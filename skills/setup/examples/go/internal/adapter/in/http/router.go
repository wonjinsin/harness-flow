package httpadapter

import (
	"context"
	"log/slog"
	"net/http"

	"example.com/architecture-handbook/internal/adapter/in/http/handler"
	inport "example.com/architecture-handbook/internal/core/port/in"
)

func NewRouter(users inport.UserService, checkDatabase func(context.Context) error, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	userHandler := handler.NewUserHandler(users, logger)
	mux.HandleFunc("POST /users", userHandler.Create)
	mux.HandleFunc("GET /users/{id}", userHandler.Get)
	mux.HandleFunc("GET /health", handler.NewHealthHandler(checkDatabase, logger))
	return mux
}
