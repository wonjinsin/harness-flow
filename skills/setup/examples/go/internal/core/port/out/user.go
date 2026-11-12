package outport

import (
	"context"

	"example.com/architecture-handbook/internal/core/domain"
)

type UserReader interface {
	GetByID(context.Context, int) (domain.User, error)
}

type UserWriter interface {
	Create(context.Context, domain.User) (domain.User, error)
}

type AuditWriter interface {
	RecordUserCreated(context.Context, domain.User) error
}

// Transaction exposes only writers participating in the same transaction.
// Neither the transaction nor its writers may escape the callback or be used
// concurrently. Returning an error rolls back all callback writes.
type Transaction interface {
	UserWriter
	AuditWriter
}

type Transactor interface {
	WithinTransaction(context.Context, func(Transaction) error) error
}
