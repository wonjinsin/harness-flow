package service

import (
	"context"
	"fmt"
	"time"

	"example.com/architecture-handbook/internal/core/domain"
	inport "example.com/architecture-handbook/internal/core/port/in"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type UserService struct {
	reader       outport.UserReader
	transactions outport.Transactor
}

var _ inport.UserService = (*UserService)(nil)

func NewUserService(reader outport.UserReader, transactions outport.Transactor) *UserService {
	return &UserService{reader: reader, transactions: transactions}
}

func (s *UserService) CreateUser(ctx context.Context, command inport.CreateUserCommand) (domain.User, error) {
	user, err := domain.NewUser(command.Name, command.Email, time.Now())
	if err != nil {
		return domain.User{}, err
	}
	var created domain.User
	err = s.transactions.WithinTransaction(ctx, func(writers outport.Transaction) error {
		var err error
		created, err = writers.Create(ctx, user)
		if err != nil {
			return err
		}
		return writers.RecordUserCreated(ctx, created)
	})
	if err != nil {
		return domain.User{}, fmt.Errorf("create user: %w", err)
	}
	return created, nil
}

func (s *UserService) GetUser(ctx context.Context, id int) (domain.User, error) {
	if id < 1 {
		return domain.User{}, fmt.Errorf("%w: user ID must be positive", domain.ErrInvalidInput)
	}
	user, err := s.reader.GetByID(ctx, id)
	if err != nil {
		return domain.User{}, fmt.Errorf("get user: %w", err)
	}
	return user, nil
}
