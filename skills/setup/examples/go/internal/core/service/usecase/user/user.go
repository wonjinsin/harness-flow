package user

import (
	"context"
	"fmt"
	"time"

	"example.com/architecture-handbook/internal/core/domain"
	inport "example.com/architecture-handbook/internal/core/port/in"
	"example.com/architecture-handbook/internal/core/port/in/command"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type UseCase struct {
	userProvider outport.UserProvider
	transactor   outport.Transactor
}

var _ inport.UserUseCase = (*UseCase)(nil)

func NewUseCase(userProvider outport.UserProvider, transactor outport.Transactor) *UseCase {
	return &UseCase{userProvider: userProvider, transactor: transactor}
}

func (s *UseCase) CreateUser(ctx context.Context, input command.CreateUserCommand) (*domain.User, error) {
	user, err := domain.NewUser(input.Name, input.Email, time.Now())
	if err != nil {
		return nil, err
	}
	var created *domain.User
	err = s.transactor.WithinTransaction(ctx, func(repositories outport.Transaction) error {
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
