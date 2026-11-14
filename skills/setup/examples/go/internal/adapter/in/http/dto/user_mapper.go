package dto

import (
	"encoding/json"
	"fmt"
	"io"
	"time"

	"example.com/architecture-handbook/internal/core/domain"
	"example.com/architecture-handbook/internal/core/port/in/command"
)

type CreateUserRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

type UserResponse struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type HealthResponse struct {
	Status string `json:"status"`
}

func DecodeCreateUser(body io.Reader) (command.CreateUserCommand, error) {
	decoder := json.NewDecoder(body)
	decoder.DisallowUnknownFields()
	var request CreateUserRequest
	if err := decoder.Decode(&request); err != nil {
		return command.CreateUserCommand{}, fmt.Errorf("%w: decode request: %w", domain.ErrInvalidInput, err)
	}
	var trailing struct{}
	if err := decoder.Decode(&trailing); err != io.EOF {
		return command.CreateUserCommand{}, fmt.Errorf("%w: expected exactly one JSON object", domain.ErrInvalidInput)
	}
	return command.CreateUserCommand{Name: request.Name, Email: request.Email}, nil
}

func UserToResponse(user *domain.User) UserResponse {
	return UserResponse{
		ID:        user.ID,
		Name:      user.Name,
		Email:     user.Email,
		CreatedAt: user.CreatedAt,
	}
}
