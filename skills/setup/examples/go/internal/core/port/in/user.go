package inport

import (
	"context"

	"example.com/architecture-handbook/internal/core/domain"
	"example.com/architecture-handbook/internal/core/port/in/command"
)

type UserUseCase interface {
	CreateUser(context.Context, command.CreateUserCommand) (*domain.User, error)
	GetUser(context.Context, int) (*domain.User, error)
}
