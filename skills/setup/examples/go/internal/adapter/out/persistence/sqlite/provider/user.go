package provider

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"example.com/architecture-handbook/internal/core/domain"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type UserProvider struct {
	db *sql.DB
}

var _ outport.UserProvider = (*UserProvider)(nil)

func NewUserProvider(db *sql.DB) *UserProvider {
	return &UserProvider{db: db}
}

func (p *UserProvider) FindByID(ctx context.Context, id int) (*domain.User, error) {
	user, err := scanUser(p.db.QueryRowContext(ctx,
		"SELECT id, name, email, created_at FROM users WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("select user: %w", err)
	}
	return user, nil
}
