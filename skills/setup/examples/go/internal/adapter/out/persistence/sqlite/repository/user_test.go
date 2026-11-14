package repository_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/mattn/go-sqlite3"

	sqlitedb "example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/db"
	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/provider"
	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/repository"
	"example.com/architecture-handbook/internal/core/domain"
	inport "example.com/architecture-handbook/internal/core/port/in"
	outport "example.com/architecture-handbook/internal/core/port/out"
	"example.com/architecture-handbook/internal/core/service/usecase/user"
)

func newDatabase(t *testing.T) (context.Context, *sql.DB, *provider.UserProvider, *repository.UserUnitOfWork) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	db, err := sqlitedb.Open(ctx, filepath.Join(t.TempDir(), "users.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close database: %v", err)
		}
	})
	return ctx, db, provider.NewUserProvider(db), repository.NewUserUnitOfWork(db)
}

type rowCounts struct {
	users  int
	audits int
}

func assertCounts(t *testing.T, ctx context.Context, db *sql.DB, want rowCounts) {
	t.Helper()
	var users, audits int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&users); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM audit_events").Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if users != want.users || audits != want.audits {
		t.Fatalf("persisted users/audits = %d/%d, want %d/%d", users, audits, want.users, want.audits)
	}
}

func TestCreateUserCommitsUserAndAuditAndCanBeRead(t *testing.T) {
	ctx, db, userProvider, userUoW := newDatabase(t)
	users := user.NewUseCase(userProvider, userUoW)
	created, err := users.CreateUser(ctx, inport.CreateUserCommand{Name: " Alice ", Email: "ALICE@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	found, err := users.GetUser(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if found.ID != created.ID || found.Name != "Alice" || found.Email != "alice@example.com" || !found.CreatedAt.Equal(created.CreatedAt) {
		t.Fatalf("read user = %+v, created = %+v", found, created)
	}
	var auditUserID int
	var action, occurredAt string
	if err := db.QueryRowContext(ctx, "SELECT user_id, action, occurred_at FROM audit_events").Scan(&auditUserID, &action, &occurredAt); err != nil {
		t.Fatal(err)
	}
	if auditUserID != created.ID || action != "user.created" || occurredAt != created.CreatedAt.Format(time.RFC3339Nano) {
		t.Fatalf("unexpected audit: user_id=%d action=%q occurred_at=%q", auditUserID, action, occurredAt)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1, audits: 1})
}

func TestAuditConstraintFailureRollsBackFirstWrite(t *testing.T) {
	ctx, db, userProvider, userUoW := newDatabase(t)
	_, err := db.ExecContext(ctx, `CREATE TRIGGER reject_user_audit
		BEFORE INSERT ON audit_events
		BEGIN SELECT RAISE(ABORT, 'audit rejected'); END`)
	if err != nil {
		t.Fatal(err)
	}
	users := user.NewUseCase(userProvider, userUoW)
	_, err = users.CreateUser(ctx, inport.CreateUserCommand{Name: "Alice", Email: "alice@example.com"})
	if err == nil {
		t.Fatal("creation succeeded despite the database rejecting the audit write")
	}
	var sqliteError sqlite3.Error
	if !errors.As(err, &sqliteError) || sqliteError.ExtendedCode != sqlite3.ErrConstraintTrigger {
		t.Fatalf("creation error = %v, want SQLite trigger constraint cause", err)
	}
	assertCounts(t, ctx, db, rowCounts{})

	if _, err := db.ExecContext(ctx, "DROP TRIGGER reject_user_audit"); err != nil {
		t.Fatal(err)
	}
	if _, err := users.CreateUser(ctx, inport.CreateUserCommand{Name: "Alice", Email: "alice@example.com"}); err != nil {
		t.Fatalf("failed transaction leaked state or reserved the email: %v", err)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1, audits: 1})
}

func TestConcurrentDuplicateEmailHasOneWinnerAndDatabaseConstraint(t *testing.T) {
	ctx, db, userProvider, userUoW := newDatabase(t)
	users := user.NewUseCase(userProvider, userUoW)
	const callers = 8
	start := make(chan struct{})
	results := make(chan error, callers)
	var group sync.WaitGroup
	for range callers {
		group.Add(1)
		go func() {
			defer group.Done()
			<-start
			_, err := users.CreateUser(ctx, inport.CreateUserCommand{Name: "Alice", Email: "ALICE@example.com"})
			results <- err
		}()
	}
	close(start)
	group.Wait()
	close(results)
	var successes, conflicts int
	for err := range results {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, domain.ErrEmailConflict):
			conflicts++
		default:
			t.Fatalf("unexpected concurrent result: %v", err)
		}
	}
	if successes != 1 || conflicts != callers-1 {
		t.Fatalf("successes/conflicts = %d/%d, want 1/%d", successes, conflicts, callers-1)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1, audits: 1})

	// Bypass the service to establish that uniqueness is a database invariant,
	// not an application-level check protected only by this process's pool.
	_, err := db.ExecContext(ctx, `INSERT INTO users (name, email, created_at)
		SELECT name, email, created_at FROM users`)
	var sqliteError sqlite3.Error
	if !errors.As(err, &sqliteError) || sqliteError.ExtendedCode != sqlite3.ErrConstraintUnique {
		t.Fatalf("direct duplicate error = %v, want SQLite unique constraint", err)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1, audits: 1})
}

func TestCancellationBetweenTransactionWritesRollsBackPersistedUser(t *testing.T) {
	ctx, db, userProvider, userUoW := newDatabase(t)
	transactionContext, cancel := context.WithCancel(ctx)
	defer cancel()
	user, err := domain.NewUser("Alice", "alice@example.com", time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}
	var insertedID int
	err = userUoW.WithinTransaction(transactionContext, func(repositories outport.UserTransaction) error {
		inserted, err := repositories.UserRepository().Insert(transactionContext, user)
		if err != nil {
			return err
		}
		insertedID = inserted.ID
		cancel()
		return repositories.AuditRepository().RecordUserCreated(transactionContext, inserted)
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("transaction error = %v, want context.Canceled", err)
	}
	if insertedID == 0 {
		t.Fatal("the first real SQL write did not complete before cancellation")
	}
	// Use a still-live context: reading with the cancelled context would only
	// prove cancellation, not that the database rolled back the first write.
	assertCounts(t, ctx, db, rowCounts{})
	if _, err := userProvider.FindByID(ctx, insertedID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("read after rollback error = %v, want ErrNotFound", err)
	}
}

func TestAuditForeignKeyRejectsUnknownUser(t *testing.T) {
	ctx, db, _, _ := newDatabase(t)
	_, err := db.ExecContext(ctx, `INSERT INTO audit_events (user_id, action, occurred_at)
		VALUES (999, 'user.created', '2026-01-01T00:00:00Z')`)
	var sqliteError sqlite3.Error
	if !errors.As(err, &sqliteError) || sqliteError.ExtendedCode != sqlite3.ErrConstraintForeignKey {
		t.Fatalf("orphan audit error = %v, want SQLite foreign-key constraint", err)
	}
	assertCounts(t, ctx, db, rowCounts{})
}
