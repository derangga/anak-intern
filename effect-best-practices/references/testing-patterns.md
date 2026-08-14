# Testing Patterns

## Effect.Service Stateful Mocks

For stateful services (ones that persist data across multiple calls within a test), create a subclass using `Effect.Service` that reuses the same service identifier. Use an in-memory `Map` as the store and wrap every method with `Effect.fn`.

**Why `Effect.Service` over a bare object literal:**

1. **Same identifier** — reusing the exact string (e.g., `"UserService"`) means the in-memory class satisfies the same `Context` slot as production code with no changes elsewhere.
2. **Tracing preserved** — `Effect.fn` wrappers keep span names in test runs, making slow or flaky tests debuggable.
3. **Typed errors** — the mock can surface the same `Schema.TaggedError` types as production.
4. **Isolation** — each `Effect.provide(UserServiceInMemory.Default)` call creates a fresh `Map`.

### Correct Pattern

```typescript
import { Effect, Schema } from "effect"

class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    { userId: Schema.String, message: Schema.String },
) {}

interface User { id: string; name: string; email: string }

// In-memory test implementation — same identifier "UserService"
export class UserServiceInMemory extends Effect.Service<UserService>()("UserService", {
    accessors: true,
    effect: Effect.gen(function* () {
        const store = new Map<string, User>()
        let counter = 1

        const findById = Effect.fn("UserService.findById")(function* (id: string) {
            const user = store.get(id)
            if (!user) {
                return yield* Effect.fail(new UserNotFoundError({ userId: id, message: "Not found" }))
            }
            return user
        })

        const create = Effect.fn("UserService.create")(function* (input: Omit<User, "id">) {
            const user: User = { id: `user-${counter++}`, ...input }
            store.set(user.id, user)
            return user
        })

        return { findById, create }
    }),
}) {}

// In tests
await Effect.runPromise(
    Effect.gen(function* () {
        const created = yield* UserService.create({ name: "Alice", email: "alice@example.com" })
        const found = yield* UserService.findById(created.id)
        expect(found.name).toBe("Alice")
    }).pipe(Effect.provide(UserServiceInMemory.Default))
)
```

### Wrong Pattern

```typescript
// WRONG — Context.Tag with bare object literal
import { Context, Effect, Layer } from "effect"

class UserService extends Context.Tag("UserService")<
    UserService,
    { findById: (id: string) => Effect.Effect<User>; create: (input: Omit<User, "id">) => Effect.Effect<User> }
>() {}

// No Effect.fn → no tracing; manual Layer.succeed → more boilerplate; no typed errors
const UserServiceTest = Layer.succeed(UserService, {
    findById: (id) => Effect.succeed({ id, name: "Test", email: "t@test.com" }),
    create: (input) => Effect.succeed({ id: "1", ...input }),
})
```

---

## Asserting on Tagged Errors with Exit/Cause

**Always use `Effect.runPromiseExit`** when testing failure paths. Never use `.rejects.toThrow()` — it converts the error to a plain `Error`, discarding `_tag` and all context fields.

### Exit Inspection APIs

| API | Purpose |
|-----|---------|
| `Effect.runPromiseExit(effect)` | Run effect; always resolves to `Exit<A, E>`, never throws |
| `Exit.isFailure(exit)` | `true` if the Exit is a failure |
| `Exit.isSuccess(exit)` | `true` if the Exit is a success |
| `exit.value` | Success value (valid after `Exit.isSuccess` check) |
| `exit.cause` | `Cause<E>` (valid after `Exit.isFailure` check) |
| `Cause.failureOption(cause)` | `Option<E>` — `Some(err)` for typed failures, `None` for defects |
| `error._tag` | Discriminant on `Schema.TaggedError` to identify error type |

### Correct Pattern

```typescript
import { Cause, Effect, Exit, Option } from "effect"

it("fails with UserNotFoundError including userId context", async () => {
    const exit = await Effect.runPromiseExit(
        UserService.findById("missing-123").pipe(Effect.provide(UserService.Default)),
    )

    expect(Exit.isFailure(exit)).toBe(true)

    const maybeError = Cause.failureOption(exit.cause)
    expect(Option.isSome(maybeError)).toBe(true)

    const error = Option.getOrThrow(maybeError)
    expect(error._tag).toBe("UserNotFoundError")
    expect(error.userId).toBe("missing-123")
    expect(error.message).toBe("User not found")
})
```

### Wrong Pattern

```typescript
// WRONG — loses _tag, userId, and all Schema.TaggedError context fields
it("fails when user not found", async () => {
    await expect(
        Effect.runPromise(
            UserService.findById("missing").pipe(Effect.provide(UserService.Default)),
        ),
    ).rejects.toThrow() // Only checks that *something* threw — not which error
})
```

---

## Shared TestLive Layer Composition

Compose all test service layers into a single exported `TestLive` in `test/setup.ts`. Every test file imports this shared layer. Per-test overrides use `TestLive.pipe(Layer.provide(SpecialMock))`.

**Why a shared layer matters:**

1. **Single source of truth** — adding a new mock requires one change in `setup.ts`, not a hunt through every file.
2. **Prevents drift** — files can't accidentally omit a service or use a stale mock.
3. **Layer deduplication** — shared infrastructure (e.g., in-memory DB) is instantiated once per test run.
4. **Easy overrides** — one-line per-test overrides without rebuilding the full composition.

### Correct Pattern

```typescript
// test/setup.ts
import { Layer } from "effect"
import { UserServiceInMemory } from "./mocks/UserServiceInMemory"
import { OrderServiceInMemory } from "./mocks/OrderServiceInMemory"
import { ProductServiceInMemory } from "./mocks/ProductServiceInMemory"
import { InMemoryDatabaseLive } from "./mocks/InMemoryDatabaseLive"

export const TestLive = Layer.mergeAll(
    UserServiceInMemory.Default,
    OrderServiceInMemory.Default,
    ProductServiceInMemory.Default,
).pipe(
    Layer.provide(InMemoryDatabaseLive),
)

// test/user.test.ts
import { TestLive } from "./setup"

describe("UserService", () => {
    it("creates a user", async () => {
        await Effect.runPromise(
            UserService.create({ name: "Alice", email: "alice@example.com" }).pipe(
                Effect.provide(TestLive),
            ),
        )
    })
})

// Per-test override — merge on top of TestLive
const OverrideLayer = TestLive.pipe(Layer.provide(AlwaysFailingUserService))
```

### Wrong Pattern

```typescript
// WRONG — layer composition duplicated (and diverged) in every test file

// test/user.test.ts
const TestLayer = Layer.mergeAll(
    UserServiceInMemory.Default,
    OrderServiceInMemory.Default,
    ProductServiceInMemory.Default,
).pipe(Layer.provide(InMemoryDatabaseLive))

// test/order.test.ts — ProductServiceInMemory accidentally omitted
const TestLayer = Layer.mergeAll(
    UserServiceInMemory.Default,
    OrderServiceInMemory.Default,
    // ← missing! tests pass until a feature uses ProductService, then break
).pipe(Layer.provide(InMemoryDatabaseLive))
```

### TestLive Structure Guidelines

| Concern | Recommendation |
|---------|----------------|
| File location | `test/setup.ts` or `test/layers.ts` |
| Export name | `TestLive` (matches `AppLive` convention) |
| Composition | `Layer.mergeAll(ServiceA.Default, ServiceB.Default, ...)` |
| Infrastructure | `.pipe(Layer.provide(InMemoryDatabaseLive))` |
| Per-test overrides | `TestLive.pipe(Layer.provide(SpecificMock))` |

---

## Abstracting Impure Functions as Services

**Never call `crypto.randomUUID()`, `Math.random()`, or `Date.now()` directly in business logic.** Abstract them behind `Effect.Service` so tests can inject deterministic implementations.

> See also: `anti-patterns.md` — [Using Impure Functions Directly in Business Logic]

### Common Impure Functions to Abstract

| Impure Call | Service Abstraction | Effect Built-in |
|-------------|--------------------|-|
| `crypto.randomUUID()` | `IdGenerator` service | — |
| `Math.random()` | `RandomNumber` service | — |
| `Date.now()` / `new Date()` | Use `Clock` directly | `Clock.currentTimeMillis` |
| `fetch(url)` | `HttpClient` service | `@effect/platform` `HttpClient` |

### Correct Pattern

```typescript
import { Effect, Layer } from "effect"

// IdGenerator — wraps crypto.randomUUID
export class IdGenerator extends Effect.Service<IdGenerator>()("IdGenerator", {
    accessors: true,
    sync: () => ({
        generate: Effect.sync(() => crypto.randomUUID()),
    }),
}) {}

// RandomNumber — wraps Math.random
export class RandomNumber extends Effect.Service<RandomNumber>()("RandomNumber", {
    accessors: true,
    sync: () => ({
        next: Effect.sync(() => Math.random()),
        nextInt: (min: number, max: number) =>
            Effect.sync(() => Math.floor(Math.random() * (max - min + 1)) + min),
    }),
}) {}

// Business logic depends on services — not raw globals
export class UserService extends Effect.Service<UserService>()("UserService", {
    accessors: true,
    dependencies: [IdGenerator.Default, RandomNumber.Default],
    effect: Effect.gen(function* () {
        const idGen = yield* IdGenerator
        const rng = yield* RandomNumber

        const create = Effect.fn("UserService.create")(
            function* (input: { name: string; email: string }) {
                const id = yield* idGen.generate
                const code = yield* rng.nextInt(100_000, 999_999)
                return { id, inviteCode: String(code), ...input }
            },
        )

        return { create }
    }),
}) {}

// Deterministic test layers using factory functions with closure counters
const makeTestIdGenerator = (ids: string[]) => {
    let index = 0
    return Layer.succeed(IdGenerator, {
        generate: Effect.sync(() => {
            const id = ids[index % ids.length]
            index++
            return id
        }),
    })
}

const makeTestRandomNumber = (values: number[]) => {
    let index = 0
    return Layer.succeed(RandomNumber, {
        next: Effect.sync(() => { const v = values[index % values.length]; index++; return v }),
        nextInt: (_min: number, _max: number) =>
            Effect.sync(() => { const v = values[index % values.length]; index++; return v }),
    })
}

// Test
const user = await Effect.runPromise(
    UserService.create({ name: "Alice", email: "alice@example.com" }).pipe(
        Effect.provide(
            UserService.Default.pipe(
                Layer.provide(Layer.mergeAll(
                    makeTestIdGenerator(["fixed-uuid-001"]),
                    makeTestRandomNumber([555_555]),
                )),
            ),
        ),
    ),
)
// user.id === "fixed-uuid-001", user.inviteCode === "555555" — deterministic every time
```

### Wrong Pattern

```typescript
// WRONG — impure calls directly in business logic
const createUser = (input: { name: string; email: string }) =>
    Effect.gen(function* () {
        const id = crypto.randomUUID()                              // Non-deterministic
        const code = Math.floor(Math.random() * 900_000) + 100_000 // Non-deterministic
        return { id, inviteCode: String(code), ...input }
    })

// Tests are forced to use fragile monkey-patching
vi.spyOn(crypto, "randomUUID").mockReturnValue("fixed-id" as any)
// Global spy leaks between tests, requires restoration, tightly couples to platform API
```
