package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"

	"example.com/architecture-handbook/internal/adapter/in/http/dto"
	"example.com/architecture-handbook/internal/core/domain"
	inport "example.com/architecture-handbook/internal/core/port/in"
)

type UserHandler struct {
	users  inport.UserService
	logger *slog.Logger
}

func NewUserHandler(users inport.UserService, logger *slog.Logger) *UserHandler {
	return &UserHandler{users: users, logger: logger}
}

func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	command, err := dto.DecodeCreateUser(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	user, err := h.users.CreateUser(r.Context(), command)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	w.Header().Set("Location", "/users/"+strconv.Itoa(user.ID))
	respond(w, r, h.logger, http.StatusCreated, dto.UserToResponse(user))
}

func (h *UserHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		h.writeError(w, r, domain.ErrInvalidInput)
		return
	}
	user, err := h.users.GetUser(r.Context(), id)
	if err != nil {
		h.writeError(w, r, err)
		return
	}
	respond(w, r, h.logger, http.StatusOK, dto.UserToResponse(user))
}

func (h *UserHandler) writeError(w http.ResponseWriter, r *http.Request, err error) {
	status, message := http.StatusInternalServerError, "internal server error"
	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		status, message = http.StatusBadRequest, "invalid request"
	case errors.Is(err, domain.ErrNotFound):
		status, message = http.StatusNotFound, "user not found"
	case errors.Is(err, domain.ErrEmailConflict):
		status, message = http.StatusConflict, "email already exists"
	default:
		h.logger.ErrorContext(r.Context(), "user request failed", "error", err)
	}
	respond(w, r, h.logger, status, dto.ErrorResponse{Error: message})
}

func respond(w http.ResponseWriter, r *http.Request, logger *slog.Logger, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		logger.ErrorContext(r.Context(), "write HTTP response failed", "error", err)
	}
}
