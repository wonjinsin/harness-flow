package handler

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"example.com/architecture-handbook/internal/adapter/in/http/dto"
)

func NewHealthHandler(check func(context.Context) error, logger *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		if err := check(ctx); err != nil {
			logger.ErrorContext(ctx, "database readiness failed", "error", err)
			respond(w, r, logger, response{status: http.StatusServiceUnavailable, value: dto.ErrorResponse{Error: "service unavailable"}})
			return
		}
		respond(w, r, logger, response{status: http.StatusOK, value: dto.HealthResponse{Status: "ok"}})
	}
}
