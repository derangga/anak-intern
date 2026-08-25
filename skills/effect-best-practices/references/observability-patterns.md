# Observability Patterns

> **Effect v4.** `Effect.log*` and `Effect.fn` tracing are unchanged. `Metric` gained/renamed
> several operations, `LogLevel` values are now plain string literals, and `Config` moved
> validation into Schema checks.

## Structured Logging with Effect.log

**Always use Effect.log** instead of console.log. Effect.log provides:
- Structured data
- Log levels
- Integration with telemetry systems
- Testability

### Basic Logging

```typescript
// Simple message
yield* Effect.log("Processing started")

// With structured data
yield* Effect.log("Processing order", {
    orderId,
    userId,
    amount,
    currency,
})

// Different log levels
yield* Effect.logDebug("Cache lookup", { key, hit: true })
yield* Effect.logInfo("User logged in", { userId })
yield* Effect.logWarning("Rate limit approaching", { current: 95, limit: 100 })
yield* Effect.logError("Payment failed", { orderId, reason: error.message })
yield* Effect.logFatal("Database connection lost")
```

### Logging in Services

```typescript
const processOrder = Effect.fn("OrderService.processOrder")(function* (input: OrderInput) {
    yield* Effect.log("Starting order processing", { orderId: input.orderId })

    const result = yield* validateAndProcess(input).pipe(
        Effect.tap(() => Effect.log("Order processed successfully")),
        Effect.tapError((err) =>
            Effect.logError("Order processing failed", {
                orderId: input.orderId,
                error: err._tag,
                message: err.message,
            })
        ),
    )

    return result
})
```

## Effect.fn for Automatic Tracing

**Always use Effect.fn** for service methods. This automatically creates spans with proper names:

```typescript
// Creates span: "UserService.findById"
const findById = Effect.fn("UserService.findById")(function* (id: UserId) {
    // Automatic span creation with:
    // - Start/end timing
    // - Error capture
    // - Parameter tracking (if annotated)
})

// Creates span: "PaymentService.processPayment"
const processPayment = Effect.fn("PaymentService.processPayment")(
    function* (orderId: OrderId, amount: number) {
        // ...
    }
)
```

`Effect.fnUntraced` is the opt-out for hot paths, or for functions that only wrap an
`Effect.gen` and don't warrant their own span.

### Naming Convention

Use `ServiceName.methodName` format consistently:
- `UserService.findById`
- `OrderService.create`
- `PaymentService.refund`
- `NotificationService.sendEmail`

## Span Annotations

Add important context to spans, but don't overdo it:

```typescript
const processOrder = Effect.fn("OrderService.process")(function* (orderId: OrderId) {
    // GOOD - Important business identifiers
    yield* Effect.annotateCurrentSpan("orderId", orderId)
    yield* Effect.annotateCurrentSpan("userId", order.userId)
    yield* Effect.annotateCurrentSpan("totalAmount", order.total)

    // BAD - Too much detail, creates noise
    // yield* Effect.annotateCurrentSpan("step", "validating")
    // yield* Effect.annotateCurrentSpan("itemCount", order.items.length)
    // yield* Effect.annotateCurrentSpan("item0Name", order.items[0].name)
})
```

### What to Annotate

**Do annotate:**
- Entity IDs (orderId, userId, etc.)
- Important business values (amounts, statuses)
- Error context when failing

**Don't annotate:**
- Step-by-step progress
- Individual item details
- Internal implementation state
- Sensitive data (PII, secrets)

## Metrics

v4 consolidated the metric mutators. `Metric.increment` / `set` / `decrement` are gone:

| v3 | v4 |
| --- | --- |
| `Metric.increment(counter)` | `Metric.update(counter, 1)` |
| `Metric.set(gauge, v)` | `Metric.update(gauge, v)`, absolute value |
| `Metric.decrement(gauge)` | `Metric.modify(gauge, -1)`, delta |
| `Metric.tagged(k, v)` | `Metric.withAttributes(metric, { [k]: v })` |
| `Metric.timerWithHistogram(h)` | `Metric.timer(name, options)` |

`update` sets a gauge's absolute value; `modify` applies a delta. For counters, `update` adds.

### Counter

```typescript
import { Effect, Metric } from "effect"

// Define metrics at module level
const ordersProcessed = Metric.counter("orders_processed", {
    description: "Total orders processed",
})

const ordersFailed = Metric.counter("orders_failed", {
    description: "Total orders that failed processing",
})

// Use in service
const processOrder = Effect.fn("OrderService.process")(function* (input: OrderInput) {
    return yield* process(input).pipe(
        Effect.tap(() => Metric.update(ordersProcessed, 1)),
        Effect.tapError(() => Metric.update(ordersFailed, 1)),
    )
})
```

### Counter with Attributes

v3's tags are v4's **attributes**, applied to the metric rather than piped onto the update:

```typescript
const httpRequests = Metric.counter("http_requests_total", {
    description: "Total HTTP requests",
})

yield* Metric.update(
    Metric.withAttributes(httpRequests, {
        method: request.method,
        status: String(response.status),
        path: request.path,
    }),
    1,
)
```

### Gauge

```typescript
const activeConnections = Metric.gauge("active_connections", {
    description: "Number of active connections",
})

// Set an absolute value
yield* Metric.update(activeConnections, connectionCount)

// Apply a delta
yield* Metric.modify(activeConnections, 1)
yield* Metric.modify(activeConnections, -1)
```

### Histogram and Timer

```typescript
const requestDuration = Metric.histogram("request_duration_ms", {
    description: "Request duration in milliseconds",
    boundaries: [10, 50, 100, 250, 500, 1000, 2500, 5000],
})

// Record value
yield* Metric.update(requestDuration, durationMs)

// Metric.timer builds a duration histogram directly
const handlerDuration = Metric.timer("handler_duration", {
    description: "Handler execution time",
})
```

## Configuration with Config

**Always use Config** instead of process.env.

v4 renames: `Config.integer` → `Config.int`, `Config.literal(...)(name)` →
`Config.literals([...], name)`, `Config.secret` → `Config.redacted`, and `Config.validate` →
`Config.schema` with a Schema check. The error type is `Config.ConfigError` (the `ConfigError`
module is gone).

### Basic Config

```typescript
import { Config, Effect, Layer } from "effect"

const config = Config.all({
    port: Config.int("PORT").pipe(Config.withDefault(3000)),
    host: Config.string("HOST").pipe(Config.withDefault("localhost")),
    env: Config.literals(["development", "staging", "production"], "NODE_ENV"),
})

// Use in a layer. Layer.unwrapEffect became Layer.unwrap
const ServerLive = Layer.unwrap(
    Effect.gen(function* () {
        const { port, host, env } = yield* config
        return Layer.succeed(ServerConfig, { port, host, env })
    })
)
```

`Config.port` is a built-in for the common case: it validates 1–65535 for you.

### Config with Validation

Validation moved into Schema. Attach checks to a schema and read it with `Config.schema`:

```typescript
import { Config, Schema } from "effect"

const dbConfig = Config.all({
    host: Config.string("DB_HOST"),

    // Built-in: validates the 1..65535 range
    port: Config.port("DB_PORT"),

    database: Config.string("DB_NAME"),

    // Custom range via a Schema check
    maxConnections: Config.schema(
        Schema.Int.check(Schema.isGreaterThan(0)),
        "DB_MAX_CONNECTIONS",
    ).pipe(Config.withDefault(10)),
})
```

The check's own annotations carry the failure message, as in
`Schema.isGreaterThan(0, { description: "Max connections must be positive" })`. That replaces
v3's `{ message, validation }` pair.

### Redacted Config

```typescript
import { Config, Effect, Redacted } from "effect"

// For sensitive values that shouldn't be logged
const secretConfig = Config.all({
    apiKey: Config.redacted("API_KEY"),           // Returns Redacted<string>
    dbPassword: Config.redacted("DB_PASSWORD"),
})

// Using redacted values
const program = Effect.gen(function* () {
    const { apiKey, dbPassword } = yield* secretConfig

    // Redacted values are wrapped - use Redacted.value to unwrap
    const key = Redacted.value(apiKey)

    // Logging a Redacted shows "<redacted>"
    yield* Effect.log("Config loaded", { apiKey }) // Safe - shows <redacted>
})
```

v3's `Config.secret` was removed. `Config.redacted` already returns `Redacted<string>`. To
redact an existing config value, use `Config.map(config, Redacted.make)`.

### Config with Nested Structure

```typescript
const appConfig = Config.all({
    server: Config.all({
        port: Config.int("SERVER_PORT"),
        host: Config.string("SERVER_HOST"),
    }),
    database: Config.all({
        url: Config.string("DATABASE_URL"),
        pool: Config.int("DATABASE_POOL_SIZE").pipe(Config.withDefault(10)),
    }),
    features: Config.all({
        enableBeta: Config.boolean("ENABLE_BETA").pipe(Config.withDefault(false)),
        maxUploadSize: Config.int("MAX_UPLOAD_SIZE").pipe(Config.withDefault(10485760)),
    }),
})
```

Use `Config.nested` to compose lookup path prefixes. Parsing no longer takes a public path
prefix argument.

## Log Level Configuration

`LogLevel` values are **string literals** in v4, not branded objects: `"Fatal" | "Error" |
"Warn" | "Info" | "Debug" | "Trace" | "All" | "None"`. Note `Warning` became `"Warn"`.

The minimum level is a context reference, so it's set with a layer:

```typescript
import { Config, Effect, Layer, References } from "effect"

// v3: Logger.minimumLogLevel(level)
const LogLevelLive = Layer.unwrap(
    Effect.gen(function* () {
        const level = yield* Config.logLevel("LOG_LEVEL").pipe(Config.withDefault("Info"))
        return Layer.succeed(References.MinimumLogLevel, level)
    })
)
```

`Config.logLevel(name)` parses and validates the literal for you, with no manual lookup table.

For production JSON logging, `Logger.json` was replaced by `Logger.layer`, which **replaces**
the active logger set. Include `Logger.tracerLogger` to keep v3's built-in behavior of emitting
log events to the tracer:

```typescript
import { Logger } from "effect"

const JsonLoggerLive = Logger.layer([Logger.consoleJson, Logger.tracerLogger])

// Pretty console output for development
const PrettyLoggerLive = Logger.layer([Logger.consolePretty(), Logger.tracerLogger])
```

Omit `tracerLogger` only when you intentionally want trace log events disabled.

Other v3 `FiberRef`-based knobs are now `References` too. `References.CurrentLogLevel`,
`References.CurrentLogAnnotations`, and `References.TracerEnabled` are all set with
`Effect.provideService` or a `Layer.succeed`. See `v4-semantics.md`.

## Combining Observability

```typescript
const processOrder = Effect.fn("OrderService.process")(function* (input: OrderInput) {
    const startTime = yield* Clock.currentTimeMillis

    // Annotate span
    yield* Effect.annotateCurrentSpan("orderId", input.orderId)
    yield* Effect.annotateCurrentSpan("userId", input.userId)

    // Log start
    yield* Effect.log("Processing order", { orderId: input.orderId })

    const result = yield* process(input).pipe(
        Effect.tap(() =>
            Effect.gen(function* () {
                const duration = (yield* Clock.currentTimeMillis) - startTime

                // Record metrics
                yield* Metric.update(orderProcessingDuration, duration)
                yield* Metric.update(ordersProcessed, 1)

                // Log completion
                yield* Effect.log("Order processed", {
                    orderId: input.orderId,
                    durationMs: duration,
                })
            })
        ),
        Effect.tapError((err) =>
            Effect.gen(function* () {
                yield* Metric.update(ordersFailed, 1)
                yield* Effect.logError("Order processing failed", {
                    orderId: input.orderId,
                    error: err._tag,
                })
            })
        ),
    )

    return result
})
```

`Clock.currentTimeMillis` is yieldable directly. `Effect.clockWith((c) => c.currentTimeMillis)`
still works but is unnecessary here.
