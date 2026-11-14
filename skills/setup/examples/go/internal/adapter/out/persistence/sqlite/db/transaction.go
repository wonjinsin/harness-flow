package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sync/atomic"
)

var (
	ErrNestedTransaction       = errors.New("nested transactions are not supported")
	ErrTransactionScopeExpired = errors.New("transaction context scope has expired")
	ErrTransactionPoolMismatch = errors.New("transaction context belongs to another database pool")
)

type transactionScopeKey struct{}

type transactionScope struct {
	pool   *sql.DB
	tx     *sql.Tx
	active atomic.Bool
}

type DBTX interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// Executor never falls back to the base pool when a transaction scope is present.
func Executor(ctx context.Context, pool *sql.DB) (DBTX, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	scope, ok := ctx.Value(transactionScopeKey{}).(*transactionScope)
	if !ok {
		return pool, nil
	}
	if scope.pool != pool {
		return nil, ErrTransactionPoolMismatch
	}
	if !scope.active.Load() {
		return nil, ErrTransactionScopeExpired
	}
	return scope.tx, nil
}

type Transactor struct {
	database *sql.DB
}

func NewTransactor(database *sql.DB) *Transactor {
	return &Transactor{database: database}
}

func (t *Transactor) WithinTransaction(ctx context.Context, operation func(context.Context) error) error {
	return WithinTransaction(ctx, t.database, operation)
}

func WithinTransaction(ctx context.Context, database *sql.DB, operation func(context.Context) error) (err error) {
	if ctx.Value(transactionScopeKey{}) != nil {
		return ErrNestedTransaction
	}
	tx, err := database.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	scope := &transactionScope{pool: database, tx: tx}
	scope.active.Store(true)
	// Also protects panics and cancellation; after Commit this is ErrTxDone.
	defer func() {
		scope.active.Store(false)
		if rollbackErr := tx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
			err = errors.Join(err, fmt.Errorf("rollback transaction: %w", rollbackErr))
		}
	}()
	txCtx := context.WithValue(ctx, transactionScopeKey{}, scope)
	err = operation(txCtx)
	scope.active.Store(false)
	if err != nil {
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
