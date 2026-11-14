package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"example.com/architecture-handbook/internal/core/domain"
	outport "example.com/architecture-handbook/internal/core/port/out"
)

type auditRepository struct {
	tx *sql.Tx
}

var _ outport.AuditRepository = (*auditRepository)(nil)

func (r *auditRepository) RecordUserCreated(ctx context.Context, user *domain.User) error {
	_, err := r.tx.ExecContext(ctx,
		"INSERT INTO audit_events (user_id, action, occurred_at) VALUES (?, ?, ?)",
		user.ID, "user.created", user.CreatedAt.Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("insert user audit: %w", err)
	}
	return nil
}
