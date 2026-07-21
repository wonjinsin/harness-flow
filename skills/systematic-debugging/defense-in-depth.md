# Defense-in-Depth Validation

After fixing a bug caused by a bad value, one check feels enough — but it gets
bypassed by other code paths, refactors, or mocks. Validate at every layer the
value passes through so the bug becomes structurally impossible.

Different layers catch different cases: entry validation stops most bad input,
business logic catches edge cases, environment guards stop context-specific danger,
debug logging helps when the rest fail.

## The four layers

```typescript
// 1. Entry point — reject invalid input at the API boundary
function createProject(name: string, dir: string) {
  if (!dir?.trim()) throw new Error('workingDirectory cannot be empty');
  if (!existsSync(dir)) throw new Error(`does not exist: ${dir}`);
  if (!statSync(dir).isDirectory()) throw new Error(`not a directory: ${dir}`);
}

// 2. Business logic — ensure the value makes sense for this operation
function initializeWorkspace(projectDir: string) {
  if (!projectDir) throw new Error('projectDir required');
}

// 3. Environment guard — refuse dangerous operations in specific contexts
async function gitInit(directory: string) {
  if (process.env.NODE_ENV === 'test' &&
      !normalize(resolve(directory)).startsWith(normalize(resolve(tmpdir())))) {
    throw new Error(`Refusing git init outside temp dir during tests: ${directory}`);
  }
}

// 4. Debug instrumentation — capture context for forensics
logger.debug('About to git init', { directory, cwd: process.cwd(), stack: new Error().stack });
```

## Applying it

1. Trace the data flow — where the bad value starts and where it's used.
2. Map every checkpoint it passes through.
3. Add validation at each: entry, business, environment, debug.
4. Test each layer — bypass layer 1, confirm layer 2 catches it.

All layers earn their place: different code paths bypass entry validation, mocks
bypass business checks, platform edge cases need environment guards. Don't stop at one.
