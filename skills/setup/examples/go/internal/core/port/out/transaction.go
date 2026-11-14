package outport

import "context"

// Transactor executes operations in the application's shared consistency boundary.
// Errors, panics, and cancellation roll back the transaction; commit errors are
// returned to the caller. Panics are rethrown after rollback.
type Transactor interface {
	WithinTransaction(context.Context, func(Transaction) error) error
}

// Transaction exposes only typed repositories bound to the same transaction.
// Neither the bundle nor its repositories may escape the callback or be used
// concurrently. It exposes no root client or transaction lifecycle methods.
type Transaction interface {
	UserRepository() UserRepository
	AuditRepository() AuditRepository
}
