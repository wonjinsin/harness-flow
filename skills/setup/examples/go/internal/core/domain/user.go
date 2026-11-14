package domain

import (
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrInvalidInput  = errors.New("invalid input")
	ErrNotFound      = errors.New("user not found")
	ErrEmailConflict = errors.New("email already exists")
)

type User struct {
	ID        int
	Name      string
	Email     string
	CreatedAt time.Time
}

type Users []*User

func NewUser(name, email string, now time.Time) (*User, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	if name == "" || !utf8.ValidString(name) || strings.ContainsRune(name, '\x00') || utf8.RuneCountInString(name) > 100 {
		return nil, fmt.Errorf("%w: name must contain 1 to 100 characters", ErrInvalidInput)
	}
	address, err := mail.ParseAddress(email)
	if err != nil || address.Address != email || len(email) > 254 {
		return nil, fmt.Errorf("%w: email must be a plain email address of at most 254 bytes", ErrInvalidInput)
	}
	return &User{Name: name, Email: email, CreatedAt: now.UTC()}, nil
}
