# Resource Patterns

## Effect.acquireRelease

**Use `Effect.acquireRelease`** (the bracket pattern) to guarantee cleanup of resources. The release function runs on success, failure, AND interruption.

```typescript
import { Effect } from "effect"

const managedConnection = Effect.acquireRelease(
    // Acquire — runs once, can fail
    Effect.gen(function* () {
        const conn = yield* connectToDatabase()
        yield* Effect.log("Connection acquired")
        return conn
    }),
    // Release — guaranteed to run, receives the acquired resource
    (conn) =>
        Effect.gen(function* () {
            yield* conn.close()
            yield* Effect.log("Connection released")
        }),
)
```

> See also: `anti-patterns.md` — [Manual try/finally for Resource Cleanup] for why `try/finally` doesn't work in Effect generators

### Using the Resource

```typescript
const program = managedConnection.pipe(
    Effect.flatMap((conn) => conn.query("SELECT * FROM users")),
    Effect.scoped, // Required — triggers release when scope closes
)
```

## Effect.scoped

**`Effect.scoped` creates a scope** that manages the lifetime of all resources acquired within it. When the scope closes, all finalizers run in LIFO order.

### Inline Scoping

```typescript
// Scope wraps the entire pipeline
const result = yield* Effect.scoped(
    managedConnection.pipe(
        Effect.flatMap((conn) => conn.query(sql)),
    ),
)
```

### Scoped Generator Block

```typescript
// Scope wraps a gen block — resource available throughout
const result = yield* Effect.scoped(
    Effect.gen(function* () {
        const conn = yield* managedConnection
        const users = yield* conn.query("SELECT * FROM users")
        const orders = yield* conn.query("SELECT * FROM orders")
        return { users, orders }
    }),
)
```

### Multiple Resources in One Scope

```typescript
const program = Effect.scoped(
    Effect.gen(function* () {
        const db = yield* managedDbConnection
        const cache = yield* managedRedisConnection
        const queue = yield* managedQueueConnection

        // All three available here
        const data = yield* db.query(sql)
        yield* cache.set("key", data)
        yield* queue.publish(data)

        // On scope close: queue released, then cache, then db (LIFO)
    }),
)
```

## Cleanup Guarantees

The release function in `acquireRelease` is guaranteed to run regardless of how the effect completes:

| Outcome | Release Runs? | Notes |
|---------|--------------|-------|
| Success | Yes | After the scoped effect returns |
| Failure | Yes | After the error propagates |
| Interruption | Yes | After the fiber is interrupted |

```typescript
const safeResource = Effect.acquireRelease(
    acquire,
    (resource, exit) =>
        // exit tells you HOW the scope closed
        Exit.match(exit, {
            onSuccess: () =>
                Effect.log("Releasing after success").pipe(
                    Effect.andThen(resource.close()),
                ),
            onFailure: (cause) =>
                Effect.log("Releasing after failure", { cause: String(cause) }).pipe(
                    Effect.andThen(resource.close()),
                ),
        }),
)
```

### Effect.addFinalizer

Register cleanup logic directly within a scoped block:

```typescript
const program = Effect.scoped(
    Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
            Effect.log("Scope closing — cleaning up"),
        )

        const conn = yield* connect()

        yield* Effect.addFinalizer(() =>
            conn.close().pipe(Effect.orDie),
        )

        return yield* conn.query(sql)
    }),
)
```

> See also: `concurrency-patterns.md` — [Graceful Shutdown] for using `addFinalizer` with `NodeRuntime.runMain`

## Resource Hierarchies

When multiple resources are acquired in a scope, they form a hierarchy with **LIFO (Last-In, First-Out) release ordering** — the last resource acquired is the first to be released.

```typescript
const program = Effect.scoped(
    Effect.gen(function* () {
        yield* Effect.log("=== Acquiring ===")
        const config = yield* managedConfig    // Acquired 1st
        const db = yield* managedDatabase      // Acquired 2nd (may depend on config)
        const cache = yield* managedCache      // Acquired 3rd (may depend on db)

        yield* doWork(db, cache)

        yield* Effect.log("=== Releasing ===")
        // Release order: cache → db → config (reverse of acquisition)
        // This is correct because cache may depend on db, db on config
    }),
)
```

### Nested acquireRelease

Resources can be nested — inner resources are released before outer ones:

```typescript
const managedPool = Effect.acquireRelease(
    // Acquire: create pool with individual managed connections
    Effect.gen(function* () {
        const connections = yield* Effect.all(
            Array.from({ length: 5 }, () => connectToDatabase()),
        )
        yield* Effect.log(`Pool created with ${connections.length} connections`)
        return { connections, query: (sql: string) => /* ... */ }
    }),
    // Release: close all connections in pool
    (pool) =>
        Effect.forEach(
            pool.connections,
            (conn) => conn.close(),
            { discard: true },
        ).pipe(
            Effect.andThen(Effect.log("Pool closed")),
        ),
)
```

## Resource Pooling

**Use `Pool.make`** for reusable resource pools with automatic lifecycle management:

```typescript
import { Effect, Pool } from "effect"

const program = Effect.gen(function* () {
    const pool = yield* Pool.make({
        acquire: createDatabaseConnection(),
        size: 10,
    })

    // Get a connection from the pool — automatically returned when scope closes
    const result = yield* Effect.scoped(
        Effect.gen(function* () {
            const conn = yield* pool.get
            return yield* conn.query("SELECT * FROM users")
        }),
    )
})
```

### Pool Configuration

```typescript
const pool = yield* Pool.make({
    acquire: createConnection(),     // How to create a resource
    size: 10,                        // Maximum pool size
    timeToLive: Duration.minutes(5), // Refresh resources after TTL
    timeToLiveStrategy: "usage",     // TTL from last use (vs "creation")
})
```

### Pool vs Manual Management

| Approach | Use Case |
|----------|----------|
| `Pool.make` | Fixed set of reusable resources (DB connections, HTTP clients) |
| `Effect.acquireRelease` | One-off resources created and destroyed per operation |
| `Layer.scoped` | Singleton resources shared across the application |

## Scoped Service Layers

### Layer.scoped

**Use `Layer.scoped`** for services that manage resources with cleanup:

```typescript
import { Effect, Layer } from "effect"

class DatabasePool extends Effect.Service<DatabasePool>()("DatabasePool", {
    scoped: Effect.gen(function* () {
        const pool = yield* Effect.acquireRelease(
            createPool({ maxConnections: 10 }),
            (pool) => pool.close().pipe(Effect.orDie),
        )

        yield* Effect.log("Database pool started")

        return {
            query: (sql: string) => pool.query(sql),
            transaction: (fn: (conn: Connection) => Effect.Effect<void>) =>
                Effect.scoped(
                    Effect.gen(function* () {
                        const conn = yield* pool.get
                        yield* fn(conn)
                    }),
                ),
        }
    }),
}) {}
```

### Composing Scoped Layers

When merging layers that contain scoped resources, cleanup follows LIFO ordering:

```typescript
const InfraLive = Layer.mergeAll(
    DatabasePool.Default,    // Acquired 1st
    RedisCache.Default,      // Acquired 2nd
    MessageQueue.Default,    // Acquired 3rd
)

// On shutdown: MessageQueue → RedisCache → DatabasePool
```

> See also: `layer-patterns.md` — for `Layer.mergeAll`, `Layer.provideMerge`, and dependency declaration patterns

## Resource Timeouts

### Acquisition Timeout

Prevent hanging on resource creation:

```typescript
const managedConnection = Effect.acquireRelease(
    connectToDatabase().pipe(
        Effect.timeoutFail({
            duration: Duration.seconds(5),
            onTimeout: () => new ConnectionTimeoutError({
                message: "Database connection timed out",
            }),
        }),
    ),
    (conn) => conn.close().pipe(Effect.orDie),
)
```

### Per-Operation Timeout

Timeout individual operations while keeping the resource open:

```typescript
const program = Effect.scoped(
    Effect.gen(function* () {
        const conn = yield* managedConnection

        const result = yield* conn.query(sql).pipe(
            Effect.timeoutFail({
                duration: Duration.seconds(10),
                onTimeout: () => new QueryTimeoutError({ message: "Query timed out" }),
            }),
        )

        return result
    }),
)
```

### Total Scope Timeout

Timeout the entire scoped operation:

```typescript
const program = Effect.scoped(
    Effect.gen(function* () {
        const conn = yield* managedConnection
        const data = yield* conn.query(sql)
        yield* processData(data)
        return data
    }),
).pipe(
    Effect.timeoutFail({
        duration: Duration.seconds(30),
        onTimeout: () => new OperationTimeoutError({ message: "Total operation timed out" }),
    }),
)
// Resource is still properly released even on timeout
```

## ManagedRuntime vs Effect.provide

### Effect.provide (Default)

Provide layers per-effect execution. Each `Effect.runPromise` call builds and tears down the layer:

```typescript
const result = await Effect.runPromise(
    program.pipe(Effect.provide(AppLive)),
)
// Layer built, program runs, layer torn down
```

### ManagedRuntime (Long-Lived)

**Use `ManagedRuntime`** for servers and long-running processes where you want layers to persist across multiple effect executions:

```typescript
import { ManagedRuntime } from "effect"

// Create runtime once — layers stay alive
const runtime = ManagedRuntime.make(AppLive)

// Use for multiple requests — layers are shared
server.get("/users", async (req, res) => {
    const result = await runtime.runPromise(handleGetUsers(req))
    res.json(result)
})

server.post("/users", async (req, res) => {
    const result = await runtime.runPromise(handleCreateUser(req))
    res.json(result)
})

// Dispose when server shuts down — runs all layer finalizers
process.on("SIGTERM", () => runtime.dispose())
```

### When to Use Each

| Approach | Use Case |
|----------|----------|
| `Effect.provide` | Scripts, CLI tools, one-shot operations |
| `ManagedRuntime.make` | HTTP servers, long-running services, multiple executions sharing resources |
| `NodeRuntime.runMain` | Application entry point with graceful shutdown |

## Quick Reference Table

| API | Import | Purpose |
|-----|--------|---------|
| `Effect.acquireRelease(acquire, release)` | `Effect` | Bracket pattern — guaranteed cleanup |
| `Effect.scoped` | `Effect` | Create scope for resource lifetime |
| `Effect.addFinalizer(fn)` | `Effect` | Register cleanup in current scope |
| `Pool.make({ acquire, size })` | `Pool` | Reusable resource pool |
| `pool.get` | — | Borrow resource from pool (auto-returned) |
| `Layer.scoped` | `Layer` | Build layer with scoped resources |
| `ManagedRuntime.make(layer)` | `ManagedRuntime` | Long-lived runtime sharing layers |
| `runtime.runPromise(effect)` | — | Run effect in managed runtime |
| `runtime.dispose()` | — | Tear down runtime and run finalizers |
| `Effect.timeoutFail({ duration, onTimeout })` | `Effect` | Timeout with typed error |
| `NodeRuntime.runMain(effect)` | `@effect/platform-node` | Entry point with SIGINT/SIGTERM handling |
