package provider

import (
	"fmt"
	"time"

	"example.com/architecture-handbook/internal/core/domain"
)

type rowScanner interface {
	Scan(...any) error
}

type userRow struct {
	ID        int
	Name      string
	Email     string
	CreatedAt string
}

func scanUser(row rowScanner) (*domain.User, error) {
	var stored userRow
	if err := row.Scan(&stored.ID, &stored.Name, &stored.Email, &stored.CreatedAt); err != nil {
		return nil, fmt.Errorf("scan user row: %w", err)
	}
	createdAt, err := time.Parse(time.RFC3339Nano, stored.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("parse stored user timestamp: %w", err)
	}
	return &domain.User{
		ID:        stored.ID,
		Name:      stored.Name,
		Email:     stored.Email,
		CreatedAt: createdAt,
	}, nil
}
