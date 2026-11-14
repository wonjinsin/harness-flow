package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/mattn/go-sqlite3"

	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/db"
	"example.com/architecture-handbook/internal/core/domain"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type UserRepository struct {
	database *sql.DB
}

var _ outport.UserRepository = (*UserRepository)(nil)

func NewUserRepository(database *sql.DB) *UserRepository {
	return &UserRepository{database: database}
}

func (r *UserRepository) Insert(ctx context.Context, user *domain.User) (*domain.User, error) {
	executor, err := db.Executor(ctx, r.database)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}
	result, err := executor.ExecContext(ctx,
		"INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
		user.Name, user.Email, user.CreatedAt.Format(time.RFC3339Nano))
	if err != nil {
		var sqliteError sqlite3.Error
		if errors.As(err, &sqliteError) && sqliteError.ExtendedCode == sqlite3.ErrConstraintUnique {
			return nil, fmt.Errorf("insert user: %w: %w", domain.ErrEmailConflict, err)
		}
		return nil, fmt.Errorf("insert user: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("read inserted user ID: %w", err)
	}
	if int64(int(id)) != id {
		return nil, fmt.Errorf("inserted user ID exceeds the domain integer range")
	}
	user.ID = int(id)
	return user, nil
}
