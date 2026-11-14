package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	httpadapter "example.com/architecture-handbook/internal/adapter/in/http"
	sqlitedb "example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/db"
	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/provider"
	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/repository"
	"example.com/architecture-handbook/internal/core/service/usecase/user"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:8080", "HTTP listen address (loopback by default)")
	database := flag.String("database", "users.db", "SQLite database file path")
	flag.Parse()
	logger := slog.New(slog.NewJSONHandler(os.Stderr, nil))
	if err := run(*listen, *database, logger); err != nil {
		logger.Error("API stopped with an error", "error", err)
		os.Exit(1)
	}
}

func run(address, databasePath string, logger *slog.Logger) (err error) {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	startup, cancelStartup := context.WithTimeout(ctx, 10*time.Second)
	db, err := sqlitedb.Open(startup, databasePath)
	cancelStartup()
	if err != nil {
		return err
	}
	defer func() {
		if err := db.Close(); err != nil {
			logger.Error("close database failed", "error", err)
		}
	}()

	userProvider := provider.NewUserProvider(db)
	transactor := repository.NewTransactor(db)
	users := user.NewUseCase(userProvider, transactor)
	server := &http.Server{
		Addr:              address,
		Handler:           httpadapter.NewRouter(users, db.PingContext, logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	defer func() {
		if closeErr := server.Close(); closeErr != nil {
			err = errors.Join(err, fmt.Errorf("close HTTP server: %w", closeErr))
		}
	}()
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	serveErrors := make(chan error, 1)
	go func() {
		serveErrors <- server.Serve(listener)
	}()
	logger.Info("API listening", "address", listener.Addr().String())

	select {
	case err := <-serveErrors:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("serve HTTP: %w", err)
	case <-ctx.Done():
		logger.Info("shutting down API")
	}

	shutdown, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := server.Shutdown(shutdown); err != nil {
		closeErr := server.Close()
		serveErr := <-serveErrors
		if errors.Is(serveErr, http.ErrServerClosed) {
			serveErr = nil
		}
		return fmt.Errorf("shutdown HTTP: %w", errors.Join(err, closeErr, serveErr))
	}
	if err := <-serveErrors; !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("serve HTTP during shutdown: %w", err)
	}
	return nil
}
