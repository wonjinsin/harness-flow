package persistence

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

type UserRepository struct {
	db *sql.DB
}

type transactionWriters struct {
	tx *sql.Tx
}

var (
	_ outport.UserReader  = (*UserRepository)(nil)
	_ outport.Transactor  = (*UserRepository)(nil)
	_ outport.Transaction = (*transactionWriters)(nil)
)

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) GetByID(ctx context.Context, id int) (domain.User, error) {
	user, err := scanUser(r.db.QueryRowContext(ctx,
		"SELECT id, name, email, created_at FROM users WHERE id = ?", id))
	if errors.Is(err, sql.ErrNoRows) {
		return domain.User{}, domain.ErrNotFound
	}
	if err != nil {
		return domain.User{}, fmt.Errorf("select user: %w", err)
	}
	return user, nil
}

func (r *UserRepository) WithinTransaction(ctx context.Context, operation func(outport.Transaction) error) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin user transaction: %w", err)
	}
	// Also protects panics and cancellation; after Commit this is ErrTxDone.
	defer tx.Rollback()
	if err := operation(&transactionWriters{tx: tx}); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit user transaction: %w", err)
	}
	return nil
}

func (w *transactionWriters) Create(ctx context.Context, user domain.User) (domain.User, error) {
	result, err := w.tx.ExecContext(ctx,
		"INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
		user.Name, user.Email, user.CreatedAt.Format(time.RFC3339Nano))
	if err != nil {
		var sqliteError sqlite3.Error
		if errors.As(err, &sqliteError) && sqliteError.ExtendedCode == sqlite3.ErrConstraintUnique {
			return domain.User{}, fmt.Errorf("insert user: %w: %w", domain.ErrEmailConflict, err)
		}
		return domain.User{}, fmt.Errorf("insert user: %w", err)
	}
	id, err := result.LastInsertId()
	if err != nil {
		return domain.User{}, fmt.Errorf("read inserted user ID: %w", err)
	}
	if int64(int(id)) != id {
		return domain.User{}, fmt.Errorf("inserted user ID exceeds the domain integer range")
	}
	user.ID = int(id)
	return user, nil
}

func (w *transactionWriters) RecordUserCreated(ctx context.Context, user domain.User) error {
	_, err := w.tx.ExecContext(ctx,
		"INSERT INTO audit_events (user_id, action, occurred_at) VALUES (?, ?, ?)",
		user.ID, "user.created", user.CreatedAt.Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("insert user audit: %w", err)
	}
	return nil
}
