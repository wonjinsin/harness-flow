# Testing Anti-Patterns

**Load when:** writing or changing tests, or adding mocks.

**Core principle:** test what the code does, not what the mocks do. Mocks isolate;
they are not the thing under test. Following the TDD loop (watch it fail against
real code first) prevents most of these.

## 1. Testing mock behavior

Asserting that the mock is present, not that the component works.

```typescript
// ❌ verifies the mock exists
expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
// ✅ test real behavior — don't mock the sidebar, or don't assert on it
expect(screen.getByRole('navigation')).toBeInTheDocument();
```

Ask: am I testing real behavior or just mock existence? If the latter, delete the
assertion or unmock the component.

## 2. Test-only methods in production

```typescript
// ❌ destroy() exists only for test cleanup — looks like a production API,
//    dangerous if called for real, pollutes the class
class Session { async destroy() { await this._workspaceManager?.destroyWorkspace(this.id); } }
// ✅ put test cleanup in test utilities; production Session has no destroy()
export async function cleanupSession(s: Session) { /* ... */ }
```

Before adding a method to a production class, ask: is this only used by tests? If
yes, it belongs in test utilities. Also ask whether the class actually owns that
resource's lifecycle — if not, it's the wrong class for the method (don't confuse an
object's lifecycle with the entity's).

## 3. Mocking without understanding

Mocking away a side effect the test depends on.

```typescript
// ❌ mock prevents the config write the duplicate-detection test relies on
vi.mock("ToolCatalog", () => ({ discoverAndCacheTools: vi.fn().mockResolvedValue(undefined) }));
await addServer(config); await addServer(config); // should throw — but won't
// ✅ mock only the slow/external part, preserve the behavior the test needs
vi.mock("MCPServerManager"); // just the slow server startup
```

If unsure what the test depends on, run it against the real implementation first,
then add minimal mocking at the lowest level.

## 4. Incomplete mocks

```typescript
// ❌ only the fields you thought you needed — breaks when code reads response.metadata
const mockResponse = { status: "success", data: { userId: "123" } };
// ✅ mirror the real response completely
const mockResponse = { status: "success", data: { userId: "123" },
  metadata: { requestId: "req-789", timestamp: 1234567890 } };
```

A partial mock hides structural assumptions and fails silently when downstream code
reads an omitted field. Mock the complete structure as it exists in reality.

## 5. Tests as an afterthought

"Implementation complete, ready for testing" means TDD was skipped. Testing is part
of implementation: failing test → implement → refactor → *then* complete.

## When mocks get too complex

Mock setup longer than the test, mocking everything, tests breaking when a mock
changes — these signal you should use real components (an integration test) instead.
Ask: do we need a mock here at all?

## Red flags

- assertion checks for `*-mock` test IDs
- methods only called in test files
- mock setup is >50% of the test
- test fails when you remove a mock
- can't explain why the mock is needed
- mocking "just to be safe"
