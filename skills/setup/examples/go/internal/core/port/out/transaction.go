package outport

import "context"

// Transactor executes operations in the application's shared consistency boundary.
// Errors, panics, and cancellation roll back the transaction; commit errors are
// returned to the caller. Panics are rethrown after rollback.
type Transactor interface {
	WithinTransaction(context.Context, func(txCtx context.Context) error) error
}
