# v4 Semantics

Behavior changes in Effect v4 that break v3 muscle memory. These aren't renames. The symbol
often stays the same while the meaning underneath it shifts, so a find-and-replace migration
will miss every one of them.

## Yieldable: Ref, Deferred, and Fiber Are No Longer Effects

In v3, many types were structural subtypes of `Effect`. They carried the Effect type ID at
runtime and could be used anywhere an `Effect` was expected: `Ref`, `Deferred`, `Fiber`,
`FiberRef`, `Config`, `Option`, `Either`, `Context.Tag`.

That convenience hid a class of bugs. Because a `Ref` *was* an Effect, passing it where you
meant to pass its value silently type-checked and read the ref instead.

v4 replaces subtyping with the **`Yieldable`** trait: it permits `yield*` in generators but
does **not** make the type assignable to `Effect`.

```typescript
interface Yieldable<Self, A, E = never, R = never> {
    asEffect(): Effect<A, E, R>
    [Symbol.iterator](): EffectIterator<Self>
}
```

### Still Yieldable (`yield*` works as before)

`Effect`, `Option` (fails with `NoSuchElementError`), `Result` (fails with its error), `Config`
(fails with `ConfigError`), `Context.Service` (yields the service).

### No longer Effects, use the module function

```typescript
// WRONG in v4 - these were valid v3
const value = yield* ref
const result = yield* deferred
const output = yield* fiber

// CORRECT
const value = yield* Ref.get(ref)
const result = yield* Deferred.await(deferred)
const output = yield* Fiber.join(fiber)
```

### Combinators need an explicit `.asEffect()`

`yield*` still works on any `Yieldable`, but passing one to a combinator does not:

```typescript
// v3 - Option was assignable to Effect
const program = Effect.map(Option.some(42), (n) => n + 1)

// v4 - convert explicitly...
const program = Effect.map(Option.some(42).asEffect(), (n) => n + 1)

// ...or just use a generator, which is more idiomatic anyway
const program = Effect.gen(function* () {
    const n = yield* Option.some(42)
    return n + 1
})
```

**Why it matters:** in v3, `Effect.all([refA, refB])` accepted an array of `Ref`s and silently
read all of them instead of raising a type error. v4 makes that a compile error.

## Equality Is Structural by Default

In v3, `Equal.equals` used **reference** equality for plain objects and arrays; structural
comparison required an explicit `structuralRegion`. In v4 it is structural by default:

```typescript
// v3: all false. v4: all true.
Equal.equals({ a: 1 }, { a: 1 })
Equal.equals([1, [2, 3]], [1, [2, 3]])
Equal.equals(new Map([["a", 1]]), new Map([["a", 1]]))
Equal.equals(new Set([1, 2]), new Set([1, 2]))
```

Plain objects, arrays, `Map`, `Set`, `Date`, and `RegExp` are compared by value. Types
implementing the `Equal` interface keep their custom logic, same as v3.

`NaN` also changed: `Equal.equals(NaN, NaN)` was `false` in v3, is `true` in v4.

### Opting out

```typescript
const obj = Equal.byReference({ a: 1 })
Equal.equals(obj, { a: 1 }) // false
```

- `byReference(obj)` returns a `Proxy` using reference equality; the original is unchanged.
- `byReferenceUnsafe(obj)` marks the object itself; faster, but permanently changes how that
  object compares.

Also renamed: `Equal.equivalence()` → `Equal.asEquivalence()`.

**Watch for this** in caches, `Set`/`Map` keys, and dedup logic that relied on two identical-looking
objects being distinct. Those now collapse into one entry.

## Fiber Keep-Alive Is Built In

In v3, the core runtime did not hold the Node process open while a fiber was suspended on
something like `Deferred.await`. With nothing else on the event loop, the process exited. The
workaround was `runMain` from `@effect/platform-node`, which installed a long-lived timer.

In v4 the runtime manages a reference-counted keep-alive timer itself, so this works with plain
`Effect.runPromise`:

```typescript
const program = Effect.gen(function* () {
    const deferred = yield* Deferred.make<string>()
    yield* Deferred.await(deferred) // process stays alive, no runMain needed
})

Effect.runPromise(program)
```

**`runMain` is still recommended**, just for different reasons than before:

- **Signal handling.** `SIGINT` / `SIGTERM` gracefully interrupt the root fiber
- **Exit codes.** Calls `process.exit(code)` on failure or signal
- **Error reporting.** Reports unhandled errors

Use `runMain` for any real application entry point. The change means a script or test that
forgot it no longer exits silently mid-flight.

## Unstable Modules

v4 introduces `effect/unstable/*`. Modules outside `unstable/` follow **strict semver**; modules
inside it **may receive breaking changes in minor releases**.

Currently unstable: `ai`, `cli`, `cluster`, `devtools`, `eventlog`, `http`, `httpapi`,
`jsonschema`, `observability`, `persistence`, `process`, `reactivity`, `rpc`, `schema`, `socket`,
`sql`, `workflow`, `workers`.

These are **correct** v4 import paths, not a code smell. Much of what was `@effect/platform`,
`@effect/rpc`, and `@effect/cluster` in v3 lives here now. Modules graduate to the top-level
`effect/*` namespace as they stabilize.

Practical consequences:

- Pin your Effect version if you depend heavily on `unstable/` modules. HTTP, RPC, cluster,
  and atom code is the most exposed.
- Expect import paths to change on graduation; a module moving from `effect/unstable/http` to
  `effect/http` is a rename, not a rewrite.
- All Effect ecosystem packages share **one version number** in v4. `effect`, `@effect/sql-pg`,
  `@effect/atom-react`, `@effect/vitest` must all be on the same version.

## Other Semantic Shifts

**Layer memoization is shared across `Effect.provide` calls.** v3 memoized within a single
call, so overlapping layers across two calls were built twice. See `layer-patterns.md`.

**`Cause` is flat.** The recursive `Sequential`/`Parallel` tree is gone; a `Cause` is now a
wrapper around `reasons: ReadonlyArray<Reason>` where `Reason` is `Fail | Die | Interrupt`. See
`error-patterns.md`.

**`Runtime<R>` no longer exists.** Use `Context<R>` and `Effect.runForkWith(services)`. The
`Runtime` module is now just `Teardown`, `defaultTeardown`, and `makeRunMain`. See
`resource-patterns.md`.

**`Effect.gen(this, fn)` → `Effect.gen({ self: this }, fn)`.** The `self` value moved into an
options object.

**`FiberRef` is gone.** Fiber-local state is `Context.Reference`, read by yielding it and set
with `Effect.provideService`. Built-ins moved to the `References` module
(`References.CurrentLogLevel`, `References.MinimumLogLevel`, …). See `service-patterns.md`.
