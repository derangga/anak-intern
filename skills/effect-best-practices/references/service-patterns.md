# Service Patterns

> Effect v4. `Effect.Service` no longer exists — every service is a `Context.Service`.

## Context.Service Is the Only Service Constructor

v3 had four ways to define a service (`Context.Tag`, `Context.GenericTag`, `Effect.Tag`,
`Effect.Service`). v4 has one: **`Context.Service`**. Prefer the class syntax — the class
value is the context key.

```typescript
import { Context } from "effect"

class Database extends Context.Service<Database, {
    readonly query: (sql: string) => Effect.Effect<ReadonlyArray<Row>, SqlError>
}>()("Database") {}
```

Note the argument order: the type parameters come first via `Context.Service<Self, Shape>()`,
then the identifier string is passed to the returned constructor `("Database")`. This is the
reverse of v3's `Context.Tag("Database")<Self, Shape>()`.

### Basic Service Definition

For a service with an effectful constructor, pass `make` and build the layer yourself:

```typescript
import { Context, Effect, Layer } from "effect"

export class UserService extends Context.Service<UserService>()("UserService", {
    make: Effect.gen(function* () {
        const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
            // Implementation
        })

        const findByEmail = Effect.fn("UserService.findByEmail")(function* (email: string) {
            // Implementation
        })

        const create = Effect.fn("UserService.create")(function* (input: CreateUserInput) {
            // Implementation
        })

        return { findById, findByEmail, create }
    }),
}) {
    static readonly layer = Layer.effect(this, this.make)
}
```

**Three things changed from v3:**

1. `effect:` is now `make:`.
2. There is **no auto-generated `Default` layer** — you write `static readonly layer` yourself.
3. There is **no `accessors: true`** — accessors were removed entirely (see below).

### Layer Naming Convention

v4 names the primary layer `layer`, not `Default` or `Live`. Use descriptive suffixes for
variants:

| Layer | Purpose |
| --- | --- |
| `Service.layer` | the primary, production layer |
| `Service.layerConfig` | built from `Config` values |
| `Service.layerTest` | test double |

### Service with Dependencies

The `dependencies` array is gone. Wire dependencies into the layer with `Layer.provide`:

```typescript
export class OrderService extends Context.Service<OrderService>()("OrderService", {
    make: Effect.gen(function* () {
        const users = yield* UserService
        const products = yield* ProductService
        const inventory = yield* InventoryService

        const create = Effect.fn("OrderService.create")(function* (input: CreateOrderInput) {
            // Validate user exists
            const user = yield* users.findById(input.userId)

            // Check product availability
            const product = yield* products.findById(input.productId)
            const available = yield* inventory.checkAvailability(input.productId, input.quantity)

            if (!available) {
                return yield* Effect.fail(new InsufficientInventoryError({
                    productId: input.productId,
                    message: "Not enough inventory",
                }))
            }

            // Create order...
        })

        return { create }
    }),
}) {
    static readonly layer = Layer.effect(this, this.make).pipe(
        Layer.provide([UserService.layer, ProductService.layer, InventoryService.layer]),
    )
}
```

`OrderService.layer` is now `Layer<OrderService, E, never>` — the dependencies are satisfied
inside it, so usage sites provide one layer, not four. This is the same guarantee v3's
`dependencies` gave you, just written explicitly.

### Wrong: Leaving Dependencies Unsatisfied

> See also: `anti-patterns.md` — [Prop-Drilling Dependencies Through Function Arguments]

```typescript
// WRONG - layer doesn't provide what `make` requires
export class OrderService extends Context.Service<OrderService>()("OrderService", {
    make: Effect.gen(function* () {
        const users = yield* UserService  // requirement escapes into the layer type
        // ...
    }),
}) {
    static readonly layer = Layer.effect(this, this.make)
    //                      ^? Layer<OrderService, never, UserService>
}

// Now every usage site must patch the hole:
const program = Effect.gen(function* () {
    const orders = yield* OrderService
    return yield* orders.create(input)
}).pipe(
    Effect.provide(OrderService.layer),
    Effect.provide(UserService.layer),  // Annoying and error-prone
)
```

The leak is visible in the type: a third type parameter on `Layer` that isn't `never` means
you forgot a `Layer.provide`.

## Accessors Are Removed — Use `yield*`

v3's `accessors: true` generated static proxy methods (`UserService.findById(id)`). v4 removed
them. The proxy was built from mapped types over the service shape, which **erased generics and
overloads** — a method `get<T>(key: string): Effect<T>` collapsed to `Effect<unknown>`.

**Prefer `yield*`.** It makes the dependency visible at the call site:

```typescript
// CORRECT - dependency is explicit in the Effect's R channel
const program = Effect.gen(function* () {
    const users = yield* UserService
    return yield* users.findById(userId)
})
```

`use` and `useSync` exist as one-liner escapes, but reach for them sparingly — the service is
available inside the callback while the dependency stays invisible at the call site, which
makes it easy to leak requirements into return values:

```typescript
//      ┌─── Effect<User, UserNotFoundError, UserService>
//      ▼
const program = UserService.use((users) => users.findById(userId))

//      ┌─── Effect<number, never, AppConfig>
//      ▼
const port = AppConfig.useSync((c) => c.port)
```

`use` takes `(service: Shape) => Effect<A, E, R>`; `useSync` takes a pure `(service: Shape) => A`.
Both return Effects — `useSync` only means the callback itself is synchronous.

## Effect.fn for Tracing

`Effect.fn` is unchanged in v4. **Always wrap service methods with it** — it provides automatic
tracing with meaningful span names.

### Naming Convention

Use `ServiceName.methodName` format for span names:

```typescript
const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
    yield* Effect.annotateCurrentSpan("userId", id)
    // Implementation
})

const processPayment = Effect.fn("PaymentService.processPayment")(
    function* (orderId: OrderId, amount: number, currency: string) {
        yield* Effect.annotateCurrentSpan("orderId", orderId)
        yield* Effect.annotateCurrentSpan("amount", amount)
        yield* Effect.annotateCurrentSpan("currency", currency)
        // Implementation
    }
)
```

Use `Effect.fnUntraced` for hot paths where the span overhead isn't worth it, or for functions
that only wrap an `Effect.gen` and don't need their own span.

### Annotating Spans

Add important context to spans, but don't overdo it:

```typescript
// CORRECT - Important business identifiers
yield* Effect.annotateCurrentSpan("userId", userId)
yield* Effect.annotateCurrentSpan("orderId", orderId)
yield* Effect.annotateCurrentSpan("amount", amount)

// WRONG - Too much detail, noise in traces
yield* Effect.annotateCurrentSpan("userEmail", user.email)
yield* Effect.annotateCurrentSpan("userName", user.name)
yield* Effect.annotateCurrentSpan("userCreatedAt", user.createdAt)
yield* Effect.annotateCurrentSpan("step", "validating")
yield* Effect.annotateCurrentSpan("step", "processing")
yield* Effect.annotateCurrentSpan("step", "completing")
```

## Services Without `make` (Runtime-Injected Infrastructure)

Omit `make` when the implementation is supplied by the runtime rather than constructed by your
code. The class is then a bare key — the v4 replacement for v3's `Context.Tag`.

### Cloudflare Worker Bindings

```typescript
import { Context, Effect } from "effect"

// These are provided by the runtime, not created by our code
export class KVNamespace extends Context.Service<
    KVNamespace,
    CloudflareKVNamespace
>()("KVNamespace") {}

export class R2Bucket extends Context.Service<
    R2Bucket,
    CloudflareR2Bucket
>()("R2Bucket") {}

// In the worker entry point
const handler = {
    fetch(request: Request, env: Env) {
        return program.pipe(
            Effect.provideService(KVNamespace, env.MY_KV),
            Effect.provideService(R2Bucket, env.MY_BUCKET),
            Effect.runPromise,
        )
    }
}
```

### Services With Default Values

When a service has a sensible default and callers rarely override it, use `Context.Reference`
instead — it never needs providing. This is also where v3's `FiberRef` went.

```typescript
import { Context, Effect } from "effect"

const RequestTimeout = Context.Reference<number>("RequestTimeout", {
    defaultValue: () => 30_000,
})

// Read it like any service — no layer required
const program = Effect.gen(function* () {
    const timeout = yield* RequestTimeout
})

// Override for a subtree
const withShortTimeout = Effect.provideService(program, RequestTimeout, 5_000)
```

Note the v4 signature: `Context.Reference<Value>(id, options)` — a plain function call, not
v3's `Context.Reference<Self>()(id, options)` curried class form.

### Database/Redis Clients (Infrastructure)

```typescript
// Infrastructure provided at app root
// Prefer @effect/sql or similar typed clients — their keys are already Context.Services

import { PgClient } from "@effect/sql-pg"

// Concrete config
const DatabaseLive = PgClient.layer({
    host: "localhost",
    port: 5432,
    database: "app",
})

// Config-driven — note this is layerConfig in v4, not layer
const DatabaseLive = PgClient.layerConfig({
    host: Config.string("DB_HOST"),
    port: Config.int("DB_PORT"),
    database: Config.string("DB_NAME"),
})
```

`PgClient.layer` takes a concrete config in v4; the `Config`-wrapped form moved to
`PgClient.layerConfig`. (`Config.integer` was also renamed to `Config.int`.)

## Single Responsibility

Each service should have a focused responsibility:

```typescript
// CORRECT - Focused services
export class UserService extends Context.Service<UserService>()("UserService", { /* user operations */ }) {}
export class AuthService extends Context.Service<AuthService>()("AuthService", { /* auth operations */ }) {}
export class NotificationService extends Context.Service<NotificationService>()("NotificationService", { /* notifications */ }) {}

// WRONG - God service doing everything
export class AppService extends Context.Service<AppService>()("AppService", {
    make: Effect.gen(function* () {
        return {
            createUser,
            deleteUser,
            login,
            logout,
            sendEmail,
            sendPush,
            processPayment,
            // ... 50 more methods
        }
    }),
}) {}
```

## Service Interface Patterns

### Return Types

> See also: `anti-patterns.md` — [Using Impure Functions Directly in Business Logic] for why raw `fetch()`, `Math.random()`, etc. should be modeled as services

Services should return `Effect` types, never `Promise`:

```typescript
// CORRECT
const findById = Effect.fn("UserService.findById")(
    function* (id: UserId): Effect.Effect<User, UserNotFoundError> {
        // ...
    }
)

// WRONG - Promise in service interface
const findById = async (id: UserId): Promise<User> => {
    // ...
}
```

### Use Option for Nullable Results

```typescript
// CORRECT - findById can fail, findByIdOption returns Option
const findById = Effect.fn("UserService.findById")(
    function* (id: UserId): Effect.Effect<User, UserNotFoundError> {
        const maybeUser = yield* repo.findById(id)
        return yield* Option.match(maybeUser, {
            onNone: () => Effect.fail(new UserNotFoundError({ userId: id, message: "Not found" })),
            onSome: Effect.succeed,
        })
    }
)

const findByIdOption = Effect.fn("UserService.findByIdOption")(
    function* (id: UserId): Effect.Effect<Option<User>> {
        return yield* repo.findById(id)
    }
)
```

## Testing Services

For a static double, `Layer.succeed` with `.of` for shape checking:

```typescript
export const UserServiceTest = Layer.succeed(
    UserService,
    UserService.of({
        findById: (id) => Effect.succeed(mockUser),
        create: (input) => Effect.succeed({ ...mockUser, ...input }),
    })
)
```

For a stateful mock, define a second layer on the real service class rather than a second class
— the context key must be the same one production code yields:

```typescript
export class UserService extends Context.Service<UserService>()("UserService", {
    make: Effect.gen(function* () { /* real implementation */ }),
}) {
    static readonly layer = Layer.effect(this, this.make).pipe(
        Layer.provide(UserRepo.layer),
    )

    static readonly layerTest = Layer.effect(
        this,
        Effect.gen(function* () {
            const users = new Map<string, User>()

            const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
                const user = users.get(id)
                if (!user) return yield* Effect.fail(new UserNotFoundError({ userId: id, message: "Not found" }))
                return user
            })

            const create = Effect.fn("UserService.create")(function* (input: CreateUserInput) {
                const user = { id: UserId.make(crypto.randomUUID()), ...input }
                users.set(user.id, user)
                return user
            })

            return { findById, create }
        }),
    )
}
```

See `layer-patterns.md` for composing these layers and `testing-patterns.md` for wiring them
into tests.
