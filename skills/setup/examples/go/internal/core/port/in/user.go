package inport

import (
	"context"

	"example.com/architecture-handbook/internal/core/domain"
)

type CreateUserCommand struct {
	Name  string
	Email string
}

type UserService interface {
	CreateUser(context.Context, CreateUserCommand) (domain.User, error)
	GetUser(context.Context, int) (domain.User, error)
}
