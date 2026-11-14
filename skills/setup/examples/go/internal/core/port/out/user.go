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
