package repository

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/mattn/go-sqlite3"

	"example.com/architecture-handbook/internal/core/domain"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type userRepository struct {
	tx *sql.Tx
}

var _ outport.UserRepository = (*userRepository)(nil)

func (r *userRepository) Insert(ctx context.Context, user *domain.User) (*domain.User, error) {
	result, err := r.tx.ExecContext(ctx,
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
