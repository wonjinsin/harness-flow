package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/db"
	"example.com/architecture-handbook/internal/core/domain"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type AuditRepository struct {
	database *sql.DB
}

var _ outport.AuditRepository = (*AuditRepository)(nil)

func NewAuditRepository(database *sql.DB) *AuditRepository {
	return &AuditRepository{database: database}
}

func (r *AuditRepository) RecordUserCreated(ctx context.Context, user *domain.User) error {
	executor, err := db.Executor(ctx, r.database)
	if err != nil {
		return fmt.Errorf("insert user audit: %w", err)
	}
	_, err = executor.ExecContext(ctx,
		"INSERT INTO audit_events (user_id, action, occurred_at) VALUES (?, ?, ?)",
		user.ID, "user.created", user.CreatedAt.Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("insert user audit: %w", err)
	}
	return nil
}
