package repository

import (
	"context"
	"database/sql"

	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/db"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type UserUnitOfWork struct {
	database *sql.DB
}

type userTransaction struct {
	userRepository  userRepository
	auditRepository auditRepository
}

var (
	_ outport.UserUnitOfWork  = (*UserUnitOfWork)(nil)
	_ outport.UserTransaction = (*userTransaction)(nil)
)

func NewUserUnitOfWork(database *sql.DB) *UserUnitOfWork {
	return &UserUnitOfWork{database: database}
}

func (u *UserUnitOfWork) WithinTransaction(ctx context.Context, operation func(outport.UserTransaction) error) error {
	return db.WithinTransaction(ctx, u.database, func(tx *sql.Tx) error {
		return operation(&userTransaction{
			userRepository:  userRepository{tx: tx},
			auditRepository: auditRepository{tx: tx},
		})
	})
}

func (t *userTransaction) UserRepository() outport.UserRepository {
	return &t.userRepository
}

func (t *userTransaction) AuditRepository() outport.AuditRepository {
	return &t.auditRepository
}
