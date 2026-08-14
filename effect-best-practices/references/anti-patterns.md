# Anti-Patterns (Forbidden)

These patterns are **never acceptable** in Effect-TS code. Each is listed with rationale and the correct alternative.

## FORBIDDEN: Effect.runSync/runPromise Inside Services

```typescript
// FORBIDDEN
export class UserService extends Effect.Service<UserService>()("UserService", {
    effect: Effect.gen(function* () {
        const findById = (id: UserId) => {
            // Running effects synchronously breaks composition
            const user = Effect.runSync(repo.findById(id))
            return user
        }
        return { findById }
    }),
}) {}
```

**Why:** Breaks Effect's composition model, loses error handling, can't be tested, loses tracing.

**Correct:**
```typescript
const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
    return yield* repo.findById(id)
})
```

## FORBIDDEN: throw Inside Effect.gen

```typescript
// FORBIDDEN
yield* Effect.gen(function* () {
    const user = yield* repo.findById(id)
    if (!user) {
        throw new Error("User not found") // Bypasses Effect error channel
    }
    return user
})
```

**Why:** Throws bypass Effect's error channel, can't be caught with `catchTag`, breaks type safety.

**Correct:**
```typescript
yield* Effect.gen(function* () {
    const user = yield* repo.findById(id)
    if (!user) {
        return yield* Effect.fail(new UserNotFoundError({ userId: id, message: "Not found" }))
    }
    return user
})
```

## FORBIDDEN: catchAll Losing Type Information

```typescript
// FORBIDDEN
yield* someEffect.pipe(
    Effect.catchAll((err) =>
        Effect.fail(new GenericError({ message: "Something failed" }))
    )
)
```

**Why:** Loses specific error information, makes debugging harder, prevents specific error handling downstream.

**Correct:**
```typescript
yield* someEffect.pipe(
    Effect.catchTags({
        DatabaseError: (err) => Effect.fail(new ServiceUnavailableError({ message: err.message })),
        ValidationError: (err) => Effect.fail(new BadRequestError({ message: err.message })),
    }),
)
```

## FORBIDDEN: any/unknown Casts

```typescript
// FORBIDDEN
const data = someValue as any
const result = (await fetch(url)) as unknown as MyType
```

**Why:** Completely bypasses type safety, can cause runtime errors, loses Effect's type guarantees.

**Correct:**
```typescript
// Use Schema for parsing unknown data
const result = yield* Schema.decodeUnknown(MyType)(someValue)

// Or explicit type guards
if (isMyType(someValue)) {
    // Now safely typed
}
```

## FORBIDDEN: Promise in Service Signatures

```typescript
// FORBIDDEN
export class UserService extends Effect.Service<UserService>()("UserService", {
    effect: Effect.gen(function* () {
        return {
            findById: async (id: UserId): Promise<User> => {
                // Using Promise instead of Effect
            }
        }
    }),
}) {}
```

**Why:** Loses Effect's error handling, can't compose with other Effects, loses tracing/metrics.

**Correct:**
```typescript
const findById = Effect.fn("UserService.findById")(
    function* (id: UserId): Effect.Effect<User, UserNotFoundError> {
        // ...
    }
)
```

## FORBIDDEN: console.log

```typescript
// FORBIDDEN
console.log("Processing order:", orderId)
console.error("Error:", error)
```

**Why:** Not structured, not captured by Effect's logging system, lost in production telemetry.

**Correct:**
```typescript
yield* Effect.log("Processing order", { orderId })
yield* Effect.logError("Operation failed", { error: String(error) })
```

## FORBIDDEN: process.env Directly

```typescript
// FORBIDDEN
const apiKey = process.env.API_KEY
const port = parseInt(process.env.PORT || "3000")
```

**Why:** No validation, no type safety, fails silently if missing, hard to test.

**Correct:**
```typescript
const config = yield* Config.all({
    apiKey: Config.redacted("API_KEY"),
    port: Config.integer("PORT").pipe(Config.withDefault(3000)),
})
```

## FORBIDDEN: Config.secret (Deprecated)

```typescript
// FORBIDDEN (deprecated)
const secretConfig = Config.all({
    apiKey: Config.secret("API_KEY"),
    dbPassword: Config.secret("DB_PASSWORD"),
})
```

**Why:** `Config.secret` is deprecated. Use `Config.redacted` instead, which provides the same functionality with better naming and can wrap any config type.

**Correct:**
```typescript
import { Config, Redacted } from "effect"

const secretConfig = Config.all({
    apiKey: Config.redacted("API_KEY"),           // Returns Redacted<string>
    dbPassword: Config.redacted("DB_PASSWORD"),
})

// Using redacted values
const program = Effect.gen(function* () {
    const { apiKey } = yield* secretConfig
    const key = Redacted.value(apiKey)  // Unwrap when needed
})

// Can wrap any config type
const secretNumber = Config.redacted(Config.integer("SECRET_PORT"))
//    ^? Redacted<number>
```

## FORBIDDEN: null/undefined in Domain Types

```typescript
// FORBIDDEN
type User = {
    name: string
    bio: string | null
    avatar: string | undefined
}
```

**Why:** Null/undefined handling is error-prone, loses the explicit "absence" semantics.

**Correct:**
```typescript
const User = Schema.Struct({
    name: Schema.String,
    bio: Schema.Option(Schema.String),
    avatar: Schema.Option(Schema.String),
})
```

## FORBIDDEN: Option.getOrThrow

```typescript
// FORBIDDEN
const user = Option.getOrThrow(maybeUser)
const name = pipe(maybeName, Option.getOrThrow)
```

**Why:** Throws exceptions, bypasses Effect's error handling, fails at runtime instead of compile time.

**Correct:**
```typescript
// Handle both cases explicitly
yield* Option.match(maybeUser, {
    onNone: () => Effect.fail(new UserNotFoundError({ userId, message: "Not found" })),
    onSome: Effect.succeed,
})

// Or provide a default
const name = Option.getOrElse(maybeName, () => "Anonymous")

// Or use Option.map for transformations
const upperName = Option.map(maybeName, (n) => n.toUpperCase())
```

## FORBIDDEN: Context.Tag for Business Services

```typescript
// FORBIDDEN
export class UserService extends Context.Tag("UserService")<
    UserService,
    { findById: (id: UserId) => Effect.Effect<User, UserNotFoundError> }
>() {
    static Default = Layer.effect(this, Effect.gen(function* () { ... }))
}
```

**Why:** Requires manual layer creation, no built-in accessors, more boilerplate.

**Correct:**
```typescript
export class UserService extends Effect.Service<UserService>()("UserService", {
    accessors: true,
    dependencies: [...],
    effect: Effect.gen(function* () { ... }),
}) {}
```

## FORBIDDEN: Ignoring Errors with orDie

```typescript
// FORBIDDEN (in most cases)
yield* someEffect.pipe(Effect.orDie)
```

**Why:** Converts recoverable errors to defects (unrecoverable), loses error information.

**Acceptable exceptions:**
- Truly unrecoverable situations (invalid program state)
- After exhausting all recovery options
- In test setup code

**Correct:**
```typescript
// Handle errors explicitly
yield* someEffect.pipe(
    Effect.catchTag("RecoverableError", (err) =>
        Effect.fail(new DomainError({ message: err.message }))
    ),
)
```

## FORBIDDEN: mapError Instead of catchTag

```typescript
// FORBIDDEN
yield* effect.pipe(
    Effect.mapError((err) => new GenericError({ message: String(err) }))
)
```

**Why:** Loses error type information, can't discriminate between error types.

**Correct:**
```typescript
yield* effect.pipe(
    Effect.catchTag("SpecificError", (err) =>
        Effect.fail(new MappedError({ message: err.message }))
    ),
)
```

## FORBIDDEN: Mixing Effect and Promise Chains

```typescript
// FORBIDDEN
const result = await someEffect.pipe(
    Effect.runPromise,
).then(data => {
    // Mixing Promise chain with Effect
    return Effect.runPromise(anotherEffect(data))
})
```

**Why:** Loses Effect composition benefits, error handling becomes inconsistent.

**Correct:**
```typescript
const program = Effect.gen(function* () {
    const data = yield* someEffect
    return yield* anotherEffect(data)
})

const result = await Effect.runPromise(program)
```

## FORBIDDEN: Mutable State Without Ref

```typescript
// FORBIDDEN
let counter = 0
const increment = Effect.sync(() => { counter++ })
```

**Why:** Race conditions, not testable, not composable, breaks referential transparency.

**Correct:**
```typescript
const program = Effect.gen(function* () {
    const counter = yield* Ref.make(0)
    yield* Ref.update(counter, (n) => n + 1)
    return yield* Ref.get(counter)
})
```

## FORBIDDEN: Using Date.now() or new Date() Directly

```typescript
// FORBIDDEN
const now = new Date()
const timestamp = Date.now()
```

**Why:** Not testable, introduces non-determinism, hard to mock in tests. See also [#24: Using Impure Functions Directly in Business Logic](#forbidden-using-impure-functions-directly-in-business-logic) for the general principle.

**Correct:**
```typescript
import { Clock } from "effect"

const now = yield* Clock.currentTimeMillis
const date = yield* Clock.currentTimeZone.pipe(
    Effect.map((tz) => new Date())
)
```

## FORBIDDEN: Deeply Nesting flatMap/andThen Chains

```typescript
// FORBIDDEN
step1().pipe(
    Effect.flatMap((a) =>
        step2(a).pipe(
            Effect.flatMap((b) =>
                step3(b).pipe(
                    Effect.flatMap((c) => step4(c))
                )
            )
        )
    )
)
```

**Why:** Creates callback hell, difficult to read, debug, and maintain. Effect provides `Effect.gen` specifically to avoid this.

**Correct:**
```typescript
const program = Effect.gen(function* () {
    const a = yield* step1()
    const b = yield* step2(a)
    const c = yield* step3(b)
    return yield* step4(c)
})
```

## FORBIDDEN: Treating Effects as Eager (Like Promises)

```typescript
// FORBIDDEN - assuming Effect executes on creation
const myEffect = Effect.log("Hello") // Nothing happens here!
// Unlike Promises, Effects are lazy blueprints
const myPromise = Promise.resolve("Hello") // Executes immediately

// FORBIDDEN - storing Effect results without yielding
const result = Effect.succeed(42) // This is still an Effect, not 42
```

**Why:** Effects are lazy, immutable blueprints. They describe computations but do nothing until explicitly run via `Effect.runPromise`, `Effect.runSync`, or yielded inside `Effect.gen`. Treating them as eager leads to code that silently does nothing.

**Correct:**
```typescript
const program = Effect.gen(function* () {
    yield* Effect.log("Hello") // Executed when program is run
    const result = yield* Effect.succeed(42) // result is now 42
})

// Execute the blueprint
Effect.runPromise(program)
```

## FORBIDDEN: Manual try/finally for Resource Cleanup

```typescript
// FORBIDDEN
const program = Effect.gen(function* () {
    const connection = yield* getDbConnection()
    try {
        return yield* useConnection(connection)
    } finally {
        // yield* CANNOT be used inside finally blocks!
        yield* closeConnection(connection) // This won't work correctly
    }
})
```

**Why:** `yield*` cannot be used inside `finally` blocks in generators. The cleanup effect won't execute properly. Additionally, manual cleanup is not interruption-safe — if the fiber is interrupted, the `finally` block may not run.

**Correct:**
```typescript
const program = Effect.acquireRelease(
    getDbConnection(),                       // acquire
    (connection) => closeConnection(connection) // release (guaranteed)
).pipe(
    Effect.flatMap((connection) => useConnection(connection))
)

// Run with scoped to manage the resource lifecycle
Effect.runPromise(Effect.scoped(program))
```

## FORBIDDEN: Manual Retry/Timeout Logic

```typescript
// FORBIDDEN
async function fetchWithRetry() {
    for (let i = 0; i < 3; i++) {
        try {
            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 2000)
            const response = await fetch("https://api.example.com", {
                signal: controller.signal,
            })
            clearTimeout(timeoutId)
            return await response.json()
        } catch (error) {
            if (i === 2) throw error
            await new Promise((res) => setTimeout(res, 100 * 2 ** i))
        }
    }
}
```

**Why:** Verbose, error-prone, doesn't compose, hard to test. Effect provides declarative, composable retry and timeout combinators.

**Correct:**
```typescript
import { Duration, Effect, Schedule } from "effect"

const retryPolicy = Schedule.exponential(Duration.millis(100)).pipe(
    Schedule.compose(Schedule.recurs(3)),
)

const result = yield* api.fetchData().pipe(
    Effect.timeout(Duration.seconds(2)),
    Effect.retry(retryPolicy),
)
```

## FORBIDDEN: Leaking Implementation Errors Across Boundaries

```typescript
// FORBIDDEN - exposing database errors through the service API
const findUser = (): Effect.Effect<
    User,
    ConnectionError | QueryError // Leaks infrastructure details!
> => dbQuery()
```

**Why:** Consumers of `findUser` shouldn't know or care about database-specific errors. If you swap the database, all callers must change. This is a leaky abstraction.

**Correct:**
```typescript
class RepositoryError extends Data.TaggedError("RepositoryError")<{
    readonly cause: unknown
}> {}

const findUser = (): Effect.Effect<User, RepositoryError> =>
    dbQuery().pipe(
        Effect.mapError((error) => new RepositoryError({ cause: error }))
    )
```

## FORBIDDEN: Duplicating Error Handling in Every Route Handler

```typescript
// FORBIDDEN
const userRoute = HttpApiEndpoint.get("getUser", "/users/:id").pipe(
    HttpApiEndpoint.setSuccess(UserSchema),
)

// Manually catching and mapping errors in each handler implementation
const handleGetUser = HttpApiBuilder.handler(Api, "getUser", ({ path }) =>
    findUser(path.id).pipe(
        Effect.catchTag("UserNotFoundError", (e) =>
            Effect.fail(new HttpApiError({ status: 404, message: e.message }))
        ),
    )
)

// Same error handling duplicated in every route...
const handleDeleteUser = HttpApiBuilder.handler(Api, "deleteUser", ({ path }) =>
    deleteUser(path.id).pipe(
        Effect.catchTag("UserNotFoundError", (e) =>
            Effect.fail(new HttpApiError({ status: 404, message: e.message }))
        ),
    )
)
```

**Why:** DRY violation. Error-to-status mapping is duplicated across every handler, making it easy to be inconsistent and hard to maintain.

**Correct:**
```typescript
// Annotate the error type once with its HTTP status
class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    { id: Schema.String, message: Schema.String },
    HttpApiSchema.annotations({ status: 404 }),
) {}

// Add the error to endpoints — mapping is automatic
const endpoint = HttpApiEndpoint.get("getUser", "/users/:id").pipe(
    HttpApiEndpoint.setSuccess(UserSchema),
    HttpApiEndpoint.addError(UserNotFoundError),
)

// Handlers just fail normally — no manual mapping needed
const handleGetUser = HttpApiBuilder.handler(Api, "getUser", ({ path }) =>
    findUser(path.id) // UserNotFoundError automatically becomes 404
)
```

## FORBIDDEN: Prop-Drilling Dependencies Through Function Arguments

```typescript
// FORBIDDEN
const processOrder = (
    db: Database,
    logger: Logger,
    mailer: Mailer,
    config: AppConfig,
) => {
    logger.log("Processing order")
    const order = db.findOrder(orderId)
    mailer.send(order.email, "Order confirmed")
}

// Every caller must thread all dependencies
processOrder(db, logger, mailer, config)
```

**Why:** Doesn't scale. Adding a dependency forces changes in every caller up the chain. Makes refactoring painful and testing difficult.

**Correct:**
```typescript
export class OrderService extends Effect.Service<OrderService>()("OrderService", {
    effect: Effect.gen(function* () {
        const db = yield* Database
        const mailer = yield* Mailer

        const processOrder = Effect.fn("OrderService.processOrder")(
            function* (orderId: OrderId) {
                yield* Effect.log("Processing order")
                const order = yield* db.findOrder(orderId)
                yield* mailer.send(order.email, "Order confirmed")
            }
        )

        return { processOrder }
    }),
    dependencies: [Database.Default, Mailer.Default],
}) {}

// Callers just use the service — no dependency threading
const program = Effect.gen(function* () {
    const orderService = yield* OrderService
    yield* orderService.processOrder(orderId)
})
```

## FORBIDDEN: Using Impure Functions Directly in Business Logic

```typescript
// FORBIDDEN
const createUser = Effect.gen(function* () {
    const id = crypto.randomUUID()       // Not testable
    const timestamp = Math.random()      // Non-deterministic
    const data = await fetch("/api/data") // Side effect, not tracked
    return { id, timestamp, data }
})
```

**Why:** Impure functions (`Math.random()`, `crypto.randomUUID()`, raw `fetch()`) are non-deterministic and create untestable code. They can't be mocked without monkey-patching, and their side effects aren't tracked by Effect.

**Correct:**
```typescript
export class IdGenerator extends Effect.Service<IdGenerator>()("IdGenerator", {
    sync: () => ({
        generate: Effect.sync(() => crypto.randomUUID()),
    }),
}) {}

const createUser = Effect.gen(function* () {
    const idGen = yield* IdGenerator
    const clock = yield* Clock
    const id = yield* idGen.generate
    const timestamp = yield* clock.currentTimeMillis
    return { id, timestamp }
})

// In tests: provide deterministic implementations
const TestIdGenerator = Layer.succeed(IdGenerator, {
    generate: Effect.succeed("test-uuid-123"),
})
```

## FORBIDDEN: Fork + Immediate Join (Pointless Fork)

```typescript
// FORBIDDEN
const program = Effect.gen(function* () {
    const fiber = yield* Effect.fork(someEffect)
    const result = yield* Fiber.join(fiber) // Immediately waiting — why fork?
    return result
})
```

**Why:** Forking and immediately joining is equivalent to running the effect directly, but with unnecessary overhead of creating a fiber. Fork is for true concurrency — running something in the background while doing other work.

**Correct:**
```typescript
// If you need the result immediately, just yield directly
const program = Effect.gen(function* () {
    const result = yield* someEffect
    return result
})

// Fork is for true background work
const withBackground = Effect.gen(function* () {
    const fiber = yield* Effect.fork(backgroundTask) // Runs independently
    const mainResult = yield* doMainWork()           // Main work continues
    yield* Fiber.interrupt(fiber)                     // Clean up when done
    return mainResult
})
```
