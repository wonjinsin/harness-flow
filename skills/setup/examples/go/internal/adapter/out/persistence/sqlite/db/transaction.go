package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

func WithinTransaction(ctx context.Context, database *sql.DB, operation func(*sql.Tx) error) (err error) {
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	// Also protects panics and cancellation; after Commit this is ErrTxDone.
	defer func() {
		if rollbackErr := tx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
			err = errors.Join(err, fmt.Errorf("rollback transaction: %w", rollbackErr))
		}
	}()
	if err := operation(tx); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}
