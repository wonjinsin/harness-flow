package provider

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/db"
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
	executor, err := db.Executor(ctx, p.db)
	if err != nil {
		return nil, fmt.Errorf("select user: %w", err)
	}
	user, err := scanUser(executor.QueryRowContext(ctx,
		"SELECT id, name, email, created_at FROM users WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("select user: %w", err)
	}
	return user, nil
}
