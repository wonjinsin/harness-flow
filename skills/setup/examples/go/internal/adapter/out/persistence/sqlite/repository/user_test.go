package repository_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/mattn/go-sqlite3"

	sqlitedb "example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/db"
	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/provider"
	"example.com/architecture-handbook/internal/adapter/out/persistence/sqlite/repository"
	"example.com/architecture-handbook/internal/core/domain"
	"example.com/architecture-handbook/internal/core/port/in/command"
	"example.com/architecture-handbook/internal/core/service/usecase"
)

func newDatabase(t *testing.T) (context.Context, *sql.DB, *provider.UserProvider, *sqlitedb.Transactor) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	t.Cleanup(cancel)
	db, err := sqlitedb.Open(ctx, filepath.Join(t.TempDir(), "users.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close database: %v", err)
		}
	})
	return ctx, db, provider.NewUserProvider(db), sqlitedb.NewTransactor(db)
}

func newUser(t *testing.T, name, email string) *domain.User {
	t.Helper()
	user, err := domain.NewUser(name, email, time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}
	return user
}

type rowCounts struct {
	users  int
	audits int
}

func assertCounts(t *testing.T, ctx context.Context, db *sql.DB, want rowCounts) {
	t.Helper()
	var users, audits int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&users); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM audit_events").Scan(&audits); err != nil {
		t.Fatal(err)
	}
	if users != want.users || audits != want.audits {
		t.Fatalf("persisted users/audits = %d/%d, want %d/%d", users, audits, want.users, want.audits)
	}
}

func TestCreateUserCommitsUserAndAuditAndCanBeRead(t *testing.T) {
	ctx, db, userProvider, transactor := newDatabase(t)
	users := usecase.NewUserUseCase(userProvider, repository.NewUserRepository(db), repository.NewAuditRepository(db), transactor)
	created, err := users.CreateUser(ctx, command.CreateUserCommand{Name: " Alice ", Email: "ALICE@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	found, err := users.GetUser(ctx, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if found.ID != created.ID || found.Name != "Alice" || found.Email != "alice@example.com" || !found.CreatedAt.Equal(created.CreatedAt) {
		t.Fatalf("read user = %+v, created = %+v", found, created)
	}
	var auditUserID int
	var action, occurredAt string
	if err := db.QueryRowContext(ctx, "SELECT user_id, action, occurred_at FROM audit_events").Scan(&auditUserID, &action, &occurredAt); err != nil {
		t.Fatal(err)
	}
	if auditUserID != created.ID || action != "user.created" || occurredAt != created.CreatedAt.Format(time.RFC3339Nano) {
		t.Fatalf("unexpected audit: user_id=%d action=%q occurred_at=%q", auditUserID, action, occurredAt)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1, audits: 1})
}

func TestRepositoryRemainsReusableAfterContextTransactionRollback(t *testing.T) {
	ctx, db, _, transactor := newDatabase(t)
	first := newUser(t, "Alice", "alice@example.com")
	duplicate := newUser(t, "Another", "alice@example.com")
	userRepository := repository.NewUserRepository(db)
	err := transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		if _, err := userRepository.Insert(txCtx, first); err != nil {
			return err
		}
		_, err := userRepository.Insert(txCtx, duplicate)
		return err
	})
	if !errors.Is(err, domain.ErrEmailConflict) {
		t.Fatalf("transaction error = %v, want ErrEmailConflict", err)
	}
	assertCounts(t, ctx, db, rowCounts{})
	if _, err := userRepository.Insert(ctx, first); err != nil {
		t.Fatalf("same repository cannot perform an ordinary write after rollback: %v", err)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1})
}

func TestAuditConstraintFailureRollsBackFirstWrite(t *testing.T) {
	ctx, db, userProvider, transactor := newDatabase(t)
	_, err := db.ExecContext(ctx, `CREATE TRIGGER reject_user_audit
		BEFORE INSERT ON audit_events
		BEGIN SELECT RAISE(ABORT, 'audit rejected'); END`)
	if err != nil {
		t.Fatal(err)
	}
	users := usecase.NewUserUseCase(userProvider, repository.NewUserRepository(db), repository.NewAuditRepository(db), transactor)
	_, err = users.CreateUser(ctx, command.CreateUserCommand{Name: "Alice", Email: "alice@example.com"})
	if err == nil {
		t.Fatal("creation succeeded despite the database rejecting the audit write")
	}
	var sqliteError sqlite3.Error
	if !errors.As(err, &sqliteError) || sqliteError.ExtendedCode != sqlite3.ErrConstraintTrigger {
		t.Fatalf("creation error = %v, want SQLite trigger constraint cause", err)
	}
	assertCounts(t, ctx, db, rowCounts{})

	if _, err := db.ExecContext(ctx, "DROP TRIGGER reject_user_audit"); err != nil {
		t.Fatal(err)
	}
	if _, err := users.CreateUser(ctx, command.CreateUserCommand{Name: "Alice", Email: "alice@example.com"}); err != nil {
		t.Fatalf("failed transaction leaked state or reserved the email: %v", err)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1, audits: 1})
}

func TestConcurrentDuplicateEmailHasOneWinnerAndDatabaseConstraint(t *testing.T) {
	ctx, db, userProvider, transactor := newDatabase(t)
	users := usecase.NewUserUseCase(userProvider, repository.NewUserRepository(db), repository.NewAuditRepository(db), transactor)
	const callers = 8
	start := make(chan struct{})
	results := make(chan error, callers)
	for range callers {
		go func() {
			<-start
			_, err := users.CreateUser(ctx, command.CreateUserCommand{Name: "Alice", Email: "ALICE@example.com"})
			results <- err
		}()
	}
	close(start)
	var successes, conflicts int
	for range callers {
		err := <-results
		switch {
		case err == nil:
			successes++
		case errors.Is(err, domain.ErrEmailConflict):
			conflicts++
		default:
			t.Errorf("unexpected concurrent result: %v", err)
		}
	}
	if successes != 1 || conflicts != callers-1 {
		t.Fatalf("successes/conflicts = %d/%d, want 1/%d", successes, conflicts, callers-1)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1, audits: 1})

	// Bypass the service to establish that uniqueness is a database invariant,
	// not an application-level check protected only by this process's pool.
	_, err := db.ExecContext(ctx, `INSERT INTO users (name, email, created_at)
		SELECT name, email, created_at FROM users`)
	var sqliteError sqlite3.Error
	if !errors.As(err, &sqliteError) || sqliteError.ExtendedCode != sqlite3.ErrConstraintUnique {
		t.Fatalf("direct duplicate error = %v, want SQLite unique constraint", err)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1, audits: 1})
}

func TestCancellationBetweenTransactionWritesRollsBackPersistedUser(t *testing.T) {
	ctx, db, userProvider, transactor := newDatabase(t)
	transactionContext, cancel := context.WithCancel(ctx)
	defer cancel()
	user := newUser(t, "Alice", "alice@example.com")
	userRepository := repository.NewUserRepository(db)
	auditRepository := repository.NewAuditRepository(db)
	var insertedID int
	err := transactor.WithinTransaction(transactionContext, func(txCtx context.Context) error {
		inserted, err := userRepository.Insert(txCtx, user)
		if err != nil {
			return err
		}
		insertedID = inserted.ID
		cancel()
		return auditRepository.RecordUserCreated(txCtx, inserted)
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("transaction error = %v, want context.Canceled", err)
	}
	if insertedID == 0 {
		t.Fatal("the first real SQL write did not complete before cancellation")
	}
	// Use a still-live context: reading with the cancelled context would only
	// prove cancellation, not that the database rolled back the first write.
	assertCounts(t, ctx, db, rowCounts{})
	if _, err := userProvider.FindByID(ctx, insertedID); !errors.Is(err, domain.ErrNotFound) {
		t.Fatalf("read after rollback error = %v, want ErrNotFound", err)
	}
}

func TestAuditForeignKeyRejectsUnknownUser(t *testing.T) {
	ctx, db, _, _ := newDatabase(t)
	_, err := db.ExecContext(ctx, `INSERT INTO audit_events (user_id, action, occurred_at)
		VALUES (999, 'user.created', '2026-01-01T00:00:00Z')`)
	var sqliteError sqlite3.Error
	if !errors.As(err, &sqliteError) || sqliteError.ExtendedCode != sqlite3.ErrConstraintForeignKey {
		t.Fatalf("orphan audit error = %v, want SQLite foreign-key constraint", err)
	}
	assertCounts(t, ctx, db, rowCounts{})
}

func TestProviderReadsUncommittedWriteThroughTransactionContext(t *testing.T) {
	ctx, db, userProvider, transactor := newDatabase(t)
	userRepository := repository.NewUserRepository(db)
	input := newUser(t, "Alice", "alice@example.com")
	err := transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		inserted, err := userRepository.Insert(txCtx, input)
		if err != nil {
			return err
		}
		found, err := userProvider.FindByID(txCtx, inserted.ID)
		if err != nil {
			return err
		}
		if found.ID != inserted.ID || found.Name != inserted.Name || found.Email != inserted.Email || !found.CreatedAt.Equal(inserted.CreatedAt) {
			t.Fatalf("transaction read = %+v, inserted = %+v", found, inserted)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1})
}

func TestTransactionScopeExpiresAfterCallback(t *testing.T) {
	for _, outcome := range []string{"commit", "rollback", "panic"} {
		t.Run(outcome, func(t *testing.T) {
			ctx, db, userProvider, transactor := newDatabase(t)
			userRepository := repository.NewUserRepository(db)
			input := newUser(t, "Alice", "alice@example.com")
			var err error
			var escaped context.Context
			callbackErr := errors.New("reject operation")
			panicValue := new(int)
			var recovered any
			func() {
				defer func() { recovered = recover() }()
				err = transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
					escaped = txCtx
					if _, err := userRepository.Insert(txCtx, input); err != nil {
						return err
					}
					switch outcome {
					case "rollback":
						return callbackErr
					case "panic":
						panic(panicValue)
					default:
						return nil
					}
				})
			}()
			switch outcome {
			case "commit":
				if err != nil || recovered != nil {
					t.Fatalf("commit error/panic = %v/%v", err, recovered)
				}
			case "rollback":
				if !errors.Is(err, callbackErr) || recovered != nil {
					t.Fatalf("rollback error/panic = %v/%v", err, recovered)
				}
			case "panic":
				if recovered != panicValue {
					t.Fatalf("recovered = %v, want original panic", recovered)
				}
			}
			if escaped == nil {
				t.Fatal("transaction callback did not run")
			}
			if _, err := userRepository.Insert(escaped, input); !errors.Is(err, sqlitedb.ErrTransactionScopeExpired) {
				t.Fatalf("expired write error = %v, want ErrTransactionScopeExpired", err)
			}
			if _, err := userProvider.FindByID(escaped, input.ID); !errors.Is(err, sqlitedb.ErrTransactionScopeExpired) {
				t.Fatalf("expired read error = %v, want ErrTransactionScopeExpired", err)
			}
			if err := transactor.WithinTransaction(escaped, func(context.Context) error {
				t.Fatal("runner accepted an expired scope")
				return nil
			}); !errors.Is(err, sqlitedb.ErrNestedTransaction) {
				t.Fatalf("expired runner error = %v, want ErrNestedTransaction", err)
			}
			want := rowCounts{}
			if outcome == "commit" {
				want.users = 1
			}
			assertCounts(t, ctx, db, want)
		})
	}
}

func TestNestedTransactionsRejectExistingScopeWithoutOpeningAnotherTransaction(t *testing.T) {
	ctx, db, _, transactor := newDatabase(t)
	_, otherDB, _, otherTransactor := newDatabase(t)
	err := transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		for _, runner := range []*sqlitedb.Transactor{transactor, otherTransactor} {
			err := runner.WithinTransaction(txCtx, func(context.Context) error {
				t.Fatal("nested callback ran")
				return nil
			})
			if !errors.Is(err, sqlitedb.ErrNestedTransaction) {
				t.Fatalf("nested transaction error = %v, want ErrNestedTransaction", err)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	assertCounts(t, ctx, db, rowCounts{})
	assertCounts(t, ctx, otherDB, rowCounts{})
}

func TestForeignPoolScopeRejectsRepositoryAndProviderOperations(t *testing.T) {
	ctx, db, _, transactor := newDatabase(t)
	_, otherDB, otherProvider, _ := newDatabase(t)
	otherUsers := repository.NewUserRepository(otherDB)
	otherAudits := repository.NewAuditRepository(otherDB)
	input := newUser(t, "Alice", "alice@example.com")
	err := transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		if _, err := otherUsers.Insert(txCtx, input); !errors.Is(err, sqlitedb.ErrTransactionPoolMismatch) {
			t.Fatalf("foreign write error = %v, want ErrTransactionPoolMismatch", err)
		}
		if err := otherAudits.RecordUserCreated(txCtx, input); !errors.Is(err, sqlitedb.ErrTransactionPoolMismatch) {
			t.Fatalf("foreign audit error = %v, want ErrTransactionPoolMismatch", err)
		}
		if _, err := otherProvider.FindByID(txCtx, 1); !errors.Is(err, sqlitedb.ErrTransactionPoolMismatch) {
			t.Fatalf("foreign read error = %v, want ErrTransactionPoolMismatch", err)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	assertCounts(t, ctx, db, rowCounts{})
	assertCounts(t, ctx, otherDB, rowCounts{})
}

func TestConcurrentOrdinaryCallDoesNotBorrowTransactionScope(t *testing.T) {
	ctx, db, _, transactor := newDatabase(t)
	userRepository := repository.NewUserRepository(db)
	transactionUser := newUser(t, "Alice", "alice@example.com")
	ordinaryUser := newUser(t, "Bob", "bob@example.com")
	rollbackErr := errors.New("roll back held transaction")
	err := transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		if _, err := userRepository.Insert(txCtx, transactionUser); err != nil {
			return err
		}
		ordinaryCtx, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
		defer cancel()
		result := make(chan error, 1)
		go func() {
			_, err := userRepository.Insert(ordinaryCtx, ordinaryUser)
			result <- err
		}()
		if err := <-result; !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("ordinary concurrent write error = %v, want waiting for base connection to time out", err)
		}
		return rollbackErr
	})
	if !errors.Is(err, rollbackErr) {
		t.Fatalf("transaction error = %v, want callback rollback error", err)
	}
	assertCounts(t, ctx, db, rowCounts{})
	if _, err := userRepository.Insert(ctx, ordinaryUser); err != nil {
		t.Fatalf("ordinary write after rollback: %v", err)
	}
	assertCounts(t, ctx, db, rowCounts{users: 1})
}

func TestCommitConstraintFailureRollsBackTransaction(t *testing.T) {
	ctx, db, _, transactor := newDatabase(t)
	auditRepository := repository.NewAuditRepository(db)
	input := &domain.User{ID: 999, CreatedAt: time.Unix(0, 0)}
	err := transactor.WithinTransaction(ctx, func(txCtx context.Context) error {
		executor, err := sqlitedb.Executor(txCtx, db)
		if err != nil {
			return err
		}
		if _, err := executor.ExecContext(txCtx, "PRAGMA defer_foreign_keys = ON"); err != nil {
			return err
		}
		return auditRepository.RecordUserCreated(txCtx, input)
	})
	var sqliteError sqlite3.Error
	if !errors.As(err, &sqliteError) || sqliteError.ExtendedCode != sqlite3.ErrConstraintForeignKey {
		t.Fatalf("commit error = %v, want SQLite foreign-key constraint cause", err)
	}
	if errors.Is(err, domain.ErrEmailConflict) {
		t.Fatalf("commit foreign-key error was mislabeled as an email conflict: %v", err)
	}
	assertCounts(t, ctx, db, rowCounts{})
}

func TestCancellationAfterFinalWritePreventsCommit(t *testing.T) {
	ctx, db, _, transactor := newDatabase(t)
	userRepository := repository.NewUserRepository(db)
	input := newUser(t, "Alice", "alice@example.com")
	transactionContext, cancel := context.WithCancel(ctx)
	defer cancel()
	err := transactor.WithinTransaction(transactionContext, func(txCtx context.Context) error {
		if _, err := userRepository.Insert(txCtx, input); err != nil {
			return err
		}
		cancel()
		return nil
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("transaction error = %v, want context.Canceled", err)
	}
	if input.ID == 0 {
		t.Fatal("real write did not finish before cancellation")
	}
	assertCounts(t, ctx, db, rowCounts{})
}
