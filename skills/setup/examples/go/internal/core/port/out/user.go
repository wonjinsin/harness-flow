package outport

import (
	"context"

	"example.com/architecture-handbook/internal/core/domain"
)

type UserProvider interface {
	FindByID(context.Context, int) (*domain.User, error)
}

type UserRepository interface {
	Insert(context.Context, *domain.User) (*domain.User, error)
}

type AuditRepository interface {
	RecordUserCreated(context.Context, *domain.User) error
}

// UserTransaction exposes only repositories participating in the same transaction.
// Neither the bundle nor its repositories may escape the callback or be used
// concurrently. Returning an error rolls back all callback writes.
type UserTransaction interface {
	UserRepository() UserRepository
	AuditRepository() AuditRepository
}

type UserUnitOfWork interface {
	WithinTransaction(context.Context, func(UserTransaction) error) error
}
