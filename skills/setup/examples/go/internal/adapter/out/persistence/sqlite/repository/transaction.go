package repository

import (
	"context"
	"database/sql"

	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/db"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type Transactor struct {
	database *sql.DB
}

type transaction struct {
	userRepository  userRepository
	auditRepository auditRepository
}

var (
	_ outport.Transactor  = (*Transactor)(nil)
	_ outport.Transaction = (*transaction)(nil)
)

func NewTransactor(database *sql.DB) *Transactor {
	return &Transactor{database: database}
}

func (t *Transactor) WithinTransaction(ctx context.Context, operation func(outport.Transaction) error) error {
	return db.WithinTransaction(ctx, t.database, func(tx *sql.Tx) error {
		return operation(&transaction{
			userRepository:  userRepository{tx: tx},
			auditRepository: auditRepository{tx: tx},
		})
	})
}

func (t *transaction) UserRepository() outport.UserRepository {
	return &t.userRepository
}

func (t *transaction) AuditRepository() outport.AuditRepository {
	return &t.auditRepository
}
