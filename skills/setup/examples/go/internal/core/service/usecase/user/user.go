package user

import (
	"context"
	"fmt"
	"time"

	"example.com/architecture-handbook/internal/core/domain"
	inport "example.com/architecture-handbook/internal/core/port/in"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type UseCase struct {
	userProvider outport.UserProvider
	userUoW      outport.UserUnitOfWork
}

var _ inport.UserUseCase = (*UseCase)(nil)

func NewUseCase(userProvider outport.UserProvider, userUoW outport.UserUnitOfWork) *UseCase {
	return &UseCase{userProvider: userProvider, userUoW: userUoW}
}

func (s *UseCase) CreateUser(ctx context.Context, command inport.CreateUserCommand) (*domain.User, error) {
	user, err := domain.NewUser(command.Name, command.Email, time.Now())
	if err != nil {
		return nil, err
	}
	var created *domain.User
	err = s.userUoW.WithinTransaction(ctx, func(repositories outport.UserTransaction) error {
		var err error
		created, err = repositories.UserRepository().Insert(ctx, user)
		if err != nil {
			return err
		}
		return repositories.AuditRepository().RecordUserCreated(ctx, created)
	})
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}
	return created, nil
}

func (s *UseCase) GetUser(ctx context.Context, id int) (*domain.User, error) {
	if id < 1 {
		return nil, fmt.Errorf("%w: user ID must be positive", domain.ErrInvalidInput)
	}
	user, err := s.userProvider.FindByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return user, nil
}
