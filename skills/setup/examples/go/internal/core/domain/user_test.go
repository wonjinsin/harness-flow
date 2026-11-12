package domain_test

import (
	"errors"
	"strings"
	"testing"
	"time"

	"example.com/architecture-handbook/internal/core/domain"
)

func TestNewUserRejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name     string
		userName string
		email    string
	}{
		{name: "empty name", userName: " \t ", email: "alice@example.com"},
		{name: "long name", userName: strings.Repeat("a", 101), email: "alice@example.com"},
		{name: "missing email", userName: "Alice", email: ""},
		{name: "malformed email", userName: "Alice", email: "not-an-address"},
		{name: "display name is not an email", userName: "Alice", email: "Alice <alice@example.com>"},
		{name: "multiple addresses", userName: "Alice", email: "alice@example.com,bob@example.com"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := domain.NewUser(tt.userName, tt.email, time.Unix(0, 0))
			if !errors.Is(err, domain.ErrInvalidInput) {
				t.Fatalf("NewUser error = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func TestNewUserNormalizesAcceptedInput(t *testing.T) {
	user, err := domain.NewUser("  Alice  ", "  ALICE@Example.COM  ", time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}
	if user.Name != "Alice" || user.Email != "alice@example.com" {
		t.Fatalf("unexpected normalized user: %+v", user)
	}
}
