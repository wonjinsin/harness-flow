package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

const schema = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action TEXT NOT NULL CHECK (action = 'user.created'),
    occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_events_user_id ON audit_events(user_id);
`

// Open deliberately uses one connection: this small executable serializes local
// database work rather than pretending SQLite supports parallel writers. DSN
// pragmas apply to every connection, including any replacement connection.
func Open(ctx context.Context, path string) (*sql.DB, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return nil, fmt.Errorf("database path: %w", err)
	}
	location := url.URL{Scheme: "file", Path: absolute}
	location.RawQuery = "_foreign_keys=on&_busy_timeout=5000&_txlock=immediate"
	db, err := sql.Open("sqlite3", location.String())
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	if err := initialize(ctx, db); err != nil {
		if closeErr := db.Close(); closeErr != nil {
			err = errors.Join(err, fmt.Errorf("close database after initialization failure: %w", closeErr))
		}
		return nil, err
	}
	return db, nil
}

func initialize(ctx context.Context, db *sql.DB) error {
	return WithinTransaction(ctx, db, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, schema); err != nil {
			return fmt.Errorf("initialize schema: %w", err)
		}
		return nil
	})
}
