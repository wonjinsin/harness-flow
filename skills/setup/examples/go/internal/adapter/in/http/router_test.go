package httpadapter_test

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	httpadapter "example.com/architecture-handbook/internal/adapter/in/http"
	"example.com/architecture-handbook/internal/adapter/in/http/dto"
	"example.com/architecture-handbook/internal/adapter/out/persistence"
	"example.com/architecture-handbook/internal/core/service"
)

func newAPI(t *testing.T) (http.Handler, *sql.DB) {
	t.Helper()
	db, err := persistence.Open(context.Background(), filepath.Join(t.TempDir(), "users.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close database: %v", err)
		}
	})
	repository := persistence.NewUserRepository(db)
	users := service.NewUserService(repository, repository)
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	return httpadapter.NewRouter(users, db.PingContext, logger), db
}

func request(t *testing.T, api http.Handler, method, path, body string, wantStatus int) *httptest.ResponseRecorder {
	t.Helper()
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	api.ServeHTTP(recorder, req)
	if recorder.Code != wantStatus {
		t.Fatalf("%s %s status = %d, want %d; body: %s", method, path, recorder.Code, wantStatus, recorder.Body.String())
	}
	return recorder
}

func TestHTTPCreateGetAndSafeFailures(t *testing.T) {
	api, _ := newAPI(t)
	request(t, api, http.MethodGet, "/health", "", http.StatusOK)
	response := request(t, api, http.MethodPost, "/users", `{"name":" Alice ","email":"ALICE@example.com"}`, http.StatusCreated)
	var created dto.UserResponse
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if created.ID == 0 || created.Name != "Alice" || created.Email != "alice@example.com" {
		t.Fatalf("unexpected response: %+v", created)
	}
	path := "/users/" + strconv.Itoa(created.ID)
	if response.Header().Get("Location") != path {
		t.Fatalf("Location = %q, want %q", response.Header().Get("Location"), path)
	}
	found := request(t, api, http.MethodGet, path, "", http.StatusOK)
	if found.Body.String() != response.Body.String() {
		t.Fatalf("GET = %s, POST = %s", found.Body.String(), response.Body.String())
	}
	request(t, api, http.MethodPost, "/users", `{"name":"Another","email":"alice@example.com"}`, http.StatusConflict)
	request(t, api, http.MethodGet, "/users/999999", "", http.StatusNotFound)
	request(t, api, http.MethodGet, "/users/not-a-number", "", http.StatusBadRequest)
	request(t, api, http.MethodGet, "/users/0", "", http.StatusBadRequest)
}

func TestHTTPRejectsInvalidBodiesWithoutPersisting(t *testing.T) {
	api, db := newAPI(t)
	bodies := []string{
		`{"name":" ","email":"alice@example.com"}`,
		`{"name":"Alice","email":"broken"}`,
		`{"name":"Alice","email":"alice@example.com","admin":true}`,
		`{"name":"Alice","email":"alice@example.com"} {}`,
		`{"name":`,
		`null`,
		strings.Repeat(" ", (1<<20)+1),
	}
	for _, body := range bodies {
		request(t, api, http.MethodPost, "/users", body, http.StatusBadRequest)
	}
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("invalid requests persisted %d users", count)
	}
}

func TestHTTPInternalFailureDoesNotExposeDatabaseCause(t *testing.T) {
	api, db := newAPI(t)
	if _, err := db.Exec(`CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events
		BEGIN SELECT RAISE(ABORT, 'private database trigger detail'); END`); err != nil {
		t.Fatal(err)
	}
	response := request(t, api, http.MethodPost, "/users", `{"name":"Alice","email":"alice@example.com"}`, http.StatusInternalServerError)
	if response.Body.String() != "{\"error\":\"internal server error\"}\n" {
		t.Fatalf("unsafe or unstable internal error response: %s", response.Body.String())
	}
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("HTTP failure left %d users committed", count)
	}
}
