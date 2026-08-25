# Error Patterns

> **Effect v4.** `Schema.TaggedError` is unchanged, but HTTP status annotations moved to
> `.pipe(HttpApiSchema.status(n))`, `Effect.catchAll` became `Effect.catch`, and `Cause` was
> flattened. `catchTag` / `catchTags` are unchanged. They remain the backbone of this file.

## Why Explicit Error Types?

Generic errors like `BadRequestError` or `NotFoundError` seem convenient but create problems:

| Generic Error | Problems |
|--------------|----------|
| `NotFoundError` | Which resource? How should frontend recover? |
| `BadRequestError` | What's invalid? Can user fix it? |
| `UnauthorizedError` | Session expired? Wrong credentials? Missing permission? |
| `InternalServerError` | Retryable? User action needed? |

**Explicit errors enable:**
1. **Specific UI messages** - "Your session expired" vs generic "Unauthorized"
2. **Targeted recovery** - Refresh token vs show login page
3. **Better observability** - Group errors by specific type in dashboards
4. **Type-safe handling** - `catchTag("SessionExpiredError")` vs generic catch

### Anti-Pattern: Generic Error Mapping

> See also: [Leaking Implementation Errors Across Boundaries] and [Duplicating Error Handling in Every Route Handler] in `anti-patterns.md`

```typescript
// ❌ WRONG - Collapsing to generic HTTP errors
export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
    "NotFoundError",
    { message: Schema.String },
).pipe(HttpApiSchema.status(404)) {}

// At API boundaries:
Effect.catchTags({
    UserNotFoundError: (err) => Effect.fail(new NotFoundError({ message: "Not found" })),
    ChannelNotFoundError: (err) => Effect.fail(new NotFoundError({ message: "Not found" })),
    MessageNotFoundError: (err) => Effect.fail(new NotFoundError({ message: "Not found" })),
})

// Frontend receives: { _tag: "NotFoundError", message: "Not found" }
// - Can't show specific message ("User doesn't exist" vs "Channel was deleted")
// - Can't take specific action (redirect to user search vs channel list)
// - Debugging is harder (which resource was missing?)
```

```typescript
// ✅ CORRECT - Keep explicit errors all the way to frontend
export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    { userId: UserId, message: Schema.String },
).pipe(HttpApiSchema.status(404)) {}

export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
    "ChannelNotFoundError",
    { channelId: ChannelId, message: Schema.String },
).pipe(HttpApiSchema.status(404)) {}

// Frontend can handle each case
AsyncResult.matchWithError(result, {
    onInitial: () => <Skeleton />,
    onError: (err) => {
        switch (err._tag) {
            case "UserNotFoundError": return <UserNotFoundMessage userId={err.userId} />
            case "ChannelNotFoundError": return <ChannelDeletedMessage />
            case "SessionExpiredError": return <RedirectToLogin />
        }
    },
    onDefect: () => <GenericError />,
    onSuccess: (s) => <Content data={s.value} />,
})
```

See `effect-atom-patterns.md`. v3's `Result.builder(...).onErrorTag(...)` was removed in v4.

## Error Naming Conventions

| Pattern | Example | Use For |
|---------|---------|---------|
| `{Entity}NotFoundError` | `UserNotFoundError`, `ChannelNotFoundError` | Resource lookups |
| `{Entity}{Action}Error` | `UserCreateError`, `MessageUpdateError` | Mutations that fail |
| `{Feature}Error` | `SessionExpiredError`, `RateLimitExceededError` | Feature-specific failures |
| `{Integration}Error` | `WorkOSUserFetchError`, `StripePaymentError` | External service errors |
| `Invalid{Field}Error` | `InvalidEmailError`, `InvalidPasswordError` | Validation failures |

Note that v4 renamed the built-in `*Exception` classes to `*Error` (`NoSuchElementException` →
`NoSuchElementError`, `TimeoutException` → `TimeoutError`, `UnknownException` → `UnknownError`),
so this convention now matches the core library.

### Rich Error Context

Include context fields that help with debugging and UI handling:

```typescript
// Entity errors → include entity ID
export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    {
        userId: UserId,         // Which user?
        message: Schema.String,
    },
).pipe(HttpApiSchema.status(404)) {}

// Action errors → include input that failed
export class UserCreateError extends Schema.TaggedError<UserCreateError>()(
    "UserCreateError",
    {
        email: Schema.String,   // What email failed?
        reason: Schema.String,  // Why? "duplicate", "invalid domain"
        message: Schema.String,
    },
).pipe(HttpApiSchema.status(400)) {}

// Integration errors → include service name and retryable flag
export class StripePaymentError extends Schema.TaggedError<StripePaymentError>()(
    "StripePaymentError",
    {
        stripeErrorCode: Schema.String,
        retryable: Schema.Boolean,
        message: Schema.String,
    },
).pipe(HttpApiSchema.status(402)) {}

// Auth errors → include expiry info
export class SessionExpiredError extends Schema.TaggedError<SessionExpiredError>()(
    "SessionExpiredError",
    {
        sessionId: SessionId,
        expiredAt: Schema.DateTimeUtcFromString,
        message: Schema.String,
    },
).pipe(HttpApiSchema.status(401)) {}
```

## Schema.TaggedError for All Errors

**Always use `Schema.TaggedError`** for defining errors. This provides:

1. **Serialization** - Errors can be sent over RPC/network
2. **Type safety** - `_tag` discriminator enables `catchTag`
3. **Consistent structure** - All errors have predictable shape
4. **HTTP status mapping** - Via `HttpApiSchema.status`

### Basic Error Definition

```typescript
import { Schema } from "effect"
import { HttpApiSchema } from "effect/unstable/httpapi"

export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    {
        userId: UserId,
        message: Schema.String,
    },
).pipe(HttpApiSchema.status(404)) {}

export class UserCreateError extends Schema.TaggedError<UserCreateError>()(
    "UserCreateError",
    {
        message: Schema.String,
        cause: Schema.optional(Schema.String),
    },
).pipe(HttpApiSchema.status(400)) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
    "UnauthorizedError",
    {
        message: Schema.String,
    },
).pipe(HttpApiSchema.status(401)) {}

export class ForbiddenError extends Schema.TaggedError<ForbiddenError>()(
    "ForbiddenError",
    {
        message: Schema.String,
        requiredPermission: Schema.optional(Schema.String),
    },
).pipe(HttpApiSchema.status(403)) {}
```

v3's third-argument form `HttpApiSchema.annotations({ status: 404 })` is gone. The direct
annotation `Schema.TaggedError<E>()("E", { ... }, { httpApiStatus: 404 })` also works, but
`.pipe(HttpApiSchema.status(...))` is the idiomatic form.

### Required Fields

Every error should have:
- `message: Schema.String` - Human-readable description
- Relevant context fields (IDs, etc.)
- Optional `cause: Schema.optional(Schema.String)` for error chains

## Error Handling with catchTag/catchTags

**Never use `Effect.catch` or `mapError`** when you can use `catchTag`/`catchTags`. These
preserve type information and enable precise error handling.

`catchTag` and `catchTags` are unchanged in v4. The blanket catchers were renamed:

| v3 | v4 |
| --- | --- |
| `Effect.catchAll` | `Effect.catch` |
| `Effect.catchAllCause` | `Effect.catchCause` |
| `Effect.catchAllDefect` | `Effect.catchDefect` |
| `Effect.catchSome` | `Effect.catchFilter` (uses `Filter`, not `Option`) |
| `Effect.catchSomeCause` | `Effect.catchCauseFilter` |
| `Effect.catchSomeDefect` | removed |

### catchTag for Single Error Types

```typescript
const findUser = Effect.fn("UserService.findUser")(function* (id: UserId) {
    return yield* repo.findById(id).pipe(
        Effect.catchTag("DatabaseError", (err) =>
            Effect.fail(new UserNotFoundError({
                userId: id,
                message: `Database lookup failed: ${err.message}`,
            }))
        ),
    )
})
```

### catchTags for Multiple Error Types

```typescript
const processOrder = Effect.fn("OrderService.processOrder")(function* (input: OrderInput) {
    return yield* validateAndProcess(input).pipe(
        Effect.catchTags({
            ValidationError: (err) =>
                Effect.fail(new OrderValidationError({
                    message: err.message,
                    field: err.field,
                })),
            PaymentError: (err) =>
                Effect.fail(new OrderPaymentError({
                    message: `Payment failed: ${err.message}`,
                    code: err.code,
                })),
            InventoryError: (err) =>
                Effect.fail(new OrderInventoryError({
                    productId: err.productId,
                    message: "Insufficient inventory",
                })),
        }),
    )
})
```

### Why Not Effect.catch?

```typescript
// WRONG - Loses type information
yield* effect.pipe(
    Effect.catch((err) =>
        Effect.fail(new InternalServerError({ message: "Something failed" }))
    )
)

// Problems:
// 1. Can't distinguish error types downstream
// 2. Hides useful error context
// 3. Makes debugging harder
// 4. Frontend can't show specific messages
```

### New in v4: catchReason / catchReasons

When a tagged error carries a nested `reason`, `catchReason` handles one reason **without**
removing the parent error from the error channel:

```typescript
// Handle only the rate-limit reason of an AiError; other reasons still propagate
effect.pipe(
    Effect.catchReason("AiError", "RateLimitError", (reason) =>
        Effect.sleep(reason.retryAfter).pipe(Effect.andThen(effect))
    )
)

// Several reasons at once
effect.pipe(
    Effect.catchReasons("AiError", {
        RateLimitError: (reason) => backOff(reason),
        QuotaExceededError: () => Effect.fail(new QuotaError({ message: "Out of quota" })),
    })
)
```

## Error Remapping Pattern

Create reusable error remapping functions for common transformations:

```typescript
import { Effect } from "effect"

export const withRemapDbErrors = <A, E, R>(
    effect: Effect.Effect<A, E | DatabaseError | ConnectionError, R>,
    context: { entityType: string; entityId: string }
): Effect.Effect<A, E | EntityNotFoundError | ServiceUnavailableError, R> =>
    effect.pipe(
        Effect.catchTag("DatabaseError", (err) =>
            Effect.fail(new EntityNotFoundError({
                entityType: context.entityType,
                entityId: context.entityId,
                message: `${context.entityType} not found`,
            }))
        ),
        Effect.catchTag("ConnectionError", (err) =>
            Effect.fail(new ServiceUnavailableError({
                message: "Database connection unavailable",
                cause: err.message,
            }))
        ),
    )

// Usage
const findUser = Effect.fn("UserService.findUser")(function* (id: UserId) {
    return yield* repo.findById(id).pipe(
        withRemapDbErrors({ entityType: "User", entityId: id })
    )
})
```

## Retryable Errors Pattern

For errors that may be transient, add a `retryable` property. v4 expresses schema defaults with
`withDecodingDefaultType`, whose default value is an **`Effect`**:

```typescript
import { Effect, Schema } from "effect"

export class ServiceUnavailableError extends Schema.TaggedError<ServiceUnavailableError>()(
    "ServiceUnavailableError",
    {
        message: Schema.String,
        cause: Schema.optional(Schema.String),
        retryable: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(true))),
    },
).pipe(HttpApiSchema.status(503)) {}

export class RateLimitError extends Schema.TaggedError<RateLimitError>()(
    "RateLimitError",
    {
        message: Schema.String,
        retryAfter: Schema.optional(Schema.Number),
        retryable: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(true))),
    },
).pipe(HttpApiSchema.status(429)) {}

// Non-retryable error
export class ValidationError extends Schema.TaggedError<ValidationError>()(
    "ValidationError",
    {
        message: Schema.String,
        field: Schema.String,
        retryable: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
    },
).pipe(HttpApiSchema.status(400)) {}
```

### Retry Based on Error Property

> See also: [Manual Retry/Timeout Logic] in `anti-patterns.md` for why manual retry loops are forbidden

v4's `Effect.retry` takes an options object combining a schedule with `times` / `while` /
`until`, which is clearer than composing schedules for the common case:

```typescript
import { Effect, Schedule } from "effect"

const withRetry = <A, E extends { retryable?: boolean }, R>(
    effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
    effect.pipe(
        Effect.retry({
            times: 3,
            schedule: Schedule.exponential("100 millis"),
            while: (err) => err.retryable === true,
        })
    )

// Usage
yield* callExternalApi(request).pipe(withRetry)
```

v3's `Schedule.whileInput` / `whileOutput` both collapsed into `Schedule.while`, and
`Schedule.intersect` / `union` became `Schedule.max` / `Schedule.min`, but for "retry N times
with backoff while X" the options object above is the direct route.

## Working with Cause

v4 **flattened** `Cause`. It is no longer a recursive `Sequential`/`Parallel` tree. It's a
wrapper around a flat array of reasons:

```typescript
interface Cause<E> {
    readonly reasons: ReadonlyArray<Reason<E>>
}

type Reason<E> = Fail<E> | Die | Interrupt
```

`Empty`, `Sequential`, and `Parallel` are gone. An empty cause is an empty `reasons` array, and
multiple failures are collected into one flat array.

```typescript
// Iterate reasons rather than recursing a tree
const describe = (cause: Cause.Cause<AppError>) => {
    for (const reason of cause.reasons) {
        switch (reason._tag) {
            case "Fail": return reason.error
            case "Die": return reason.defect
            case "Interrupt": return reason.fiberId
        }
    }
}
```

### Extractors and Predicates

| v3 | v4 |
| --- | --- |
| `Cause.failureOption(cause)` | `Cause.findErrorOption(cause)` |
| `Cause.failureOrCause(cause)` | `Cause.findError(cause)`, returns `Result`, not `Either` |
| `Cause.dieOption(cause)` | `Cause.findDefect(cause)` |
| `Cause.failures(cause)` | `cause.reasons.filter(Cause.isFailReason)` |
| `Cause.defects(cause)` | `cause.reasons.filter(Cause.isDieReason)` |
| `Cause.isFailure(cause)` | `Cause.hasFails(cause)` |
| `Cause.isDie(cause)` | `Cause.hasDies(cause)` |
| `Cause.isInterrupted(cause)` | `Cause.hasInterrupts(cause)` |
| `Cause.sequential(a, b)` / `parallel(a, b)` | `Cause.combine(a, b)` |

`findError` and `findDefect` return `Result`; use `findErrorOption` when you want an `Option`.
See `testing-patterns.md` for asserting on tagged errors via `Exit` and `Cause`.

## Error Unions for Activities

When defining workflow activities, use explicit error unions. Note `Schema.Union` takes one
array in v4:

```typescript
export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
    "DatabaseError",
    {
        message: Schema.String,
        cause: Schema.optional(Schema.String),
        retryable: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(true))),
    },
) {}

export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
    "ChannelNotFoundError",
    {
        channelId: ChannelId,
        message: Schema.String,
        retryable: Schema.Boolean.pipe(Schema.withDecodingDefaultType(Effect.succeed(false))),
    },
) {}

export type GetChannelMembersError = DatabaseError | ChannelNotFoundError

// In activity definition
yield* Activity.make({
    name: "GetChannelMembers",
    success: ChannelMembersResult,
    error: Schema.Union([DatabaseError, ChannelNotFoundError]),
    execute: Effect.gen(function* () {
        // ...
    }),
})
```

See `rpc-cluster-patterns.md`. `Activity` now lives in `effect/unstable/workflow`.

## HTTP Status Codes (Without Generic Errors)

**Map HTTP status codes at the error level, not by creating generic error classes.** Each explicit error can have its own HTTP status.

```typescript
// ✅ CORRECT - Domain errors with their own status
export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
    "UserNotFoundError",
    { userId: UserId, message: Schema.String },
).pipe(HttpApiSchema.status(404)) {}

export class ChannelNotFoundError extends Schema.TaggedError<ChannelNotFoundError>()(
    "ChannelNotFoundError",
    { channelId: ChannelId, message: Schema.String },
).pipe(HttpApiSchema.status(404)) {}  // Same status, different error

export class SessionExpiredError extends Schema.TaggedError<SessionExpiredError>()(
    "SessionExpiredError",
    { sessionId: SessionId, expiredAt: Schema.DateTimeUtcFromString, message: Schema.String },
).pipe(HttpApiSchema.status(401)) {}

export class InvalidCredentialsError extends Schema.TaggedError<InvalidCredentialsError>()(
    "InvalidCredentialsError",
    { message: Schema.String },
).pipe(HttpApiSchema.status(401)) {}  // Same status, different meaning
```

```typescript
// ❌ WRONG - Generic HTTP error classes
export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
    "UnauthorizedError",
    { message: Schema.String },
).pipe(HttpApiSchema.status(401)) {}

// Then mapping everything to it - loses critical information!
Effect.catchTags({
    SessionExpiredError: (err) => Effect.fail(new UnauthorizedError({ message: "Unauthorized" })),
    InvalidCredentialsError: (err) => Effect.fail(new UnauthorizedError({ message: "Unauthorized" })),
    MissingTokenError: (err) => Effect.fail(new UnauthorizedError({ message: "Unauthorized" })),
})
// Frontend can't distinguish: expired session vs wrong password vs missing token
```

### When Generic Errors Are Acceptable

Generic errors are only acceptable for **truly unrecoverable internal errors** where:
- The frontend can only show "Something went wrong"
- No user action can fix it
- You're hiding internal details for security

```typescript
// Acceptable for unrecoverable errors
export class InternalServerError extends Schema.TaggedError<InternalServerError>()(
    "InternalServerError",
    { message: Schema.String, requestId: Schema.optional(Schema.String) },
).pipe(HttpApiSchema.status(500)) {}

// Use sparingly - only for truly unexpected errors
Effect.catch((unexpectedError) =>
    Effect.fail(new InternalServerError({
        message: "An unexpected error occurred",
        requestId: context.requestId,
    }))
)
```

A decode failure (`Schema.SchemaError`, v3's `ParseError`) inside a service is usually **your**
bug rather than the caller's. Prefer `Effect.die` over mapping it to a domain error, so it
surfaces as a defect instead of a handled failure.

## Error Logging

Log errors with structured context:

```typescript
const processWithLogging = Effect.fn("OrderService.process")(function* (orderId: OrderId) {
    return yield* processOrder(orderId).pipe(
        Effect.tapError((err) =>
            Effect.log("Order processing failed", {
                orderId,
                errorTag: err._tag,
                errorMessage: err.message,
            })
        ),
    )
})
```
