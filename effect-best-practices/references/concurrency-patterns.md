# Concurrency Patterns

## Fork & Fiber Patterns

**Use `Effect.fork`** to run effects in the background as fibers. Fibers are lightweight, cooperative threads managed by Effect's runtime.

### Basic Fork

```typescript
import { Effect, Fiber } from "effect"

const program = Effect.gen(function* () {
    // Fork a background task — does NOT block
    const fiber = yield* Effect.fork(backgroundWork)

    // Do other work while background runs
    const mainResult = yield* doMainWork()

    // Wait for background result when needed
    const bgResult = yield* Fiber.join(fiber)

    return { mainResult, bgResult }
})
```

### Fork Variants

| Variant | Lifetime | Use Case |
|---------|----------|----------|
| `Effect.fork` | Parent scope | Default — fiber interrupted when parent scope ends |
| `Effect.forkDaemon` | Application lifetime | Long-running background tasks (health checks, watchers) |
| `Effect.forkScoped` | Enclosing `Effect.scoped` | Fiber interrupted when scope closes |

```typescript
// Daemon fiber — lives until app exits
const healthCheck = Effect.gen(function* () {
    yield* Effect.forkDaemon(
        Effect.repeat(
            checkHealth,
            Schedule.spaced("30 seconds"),
        ),
    )
})

// Scoped fiber — cleaned up when scope closes
const scopedWorker = Effect.scoped(
    Effect.gen(function* () {
        const fiber = yield* Effect.forkScoped(longRunningTask)
        yield* doWork()
        // fiber automatically interrupted here
    }),
)
```

### Fiber Operations

```typescript
// Join — wait for result (re-raises errors)
const result = yield* Fiber.join(fiber)

// Await — get Exit (success or failure) without re-raising
const exit = yield* Fiber.await(fiber)

// Interrupt — gracefully stop a fiber (runs finalizers)
yield* Fiber.interrupt(fiber)
```

> See also: `anti-patterns.md` — [Fork + Immediate Join] for why `Effect.fork` + immediate `Fiber.join` is pointless

## Parallel Execution

### Effect.all with Concurrency

**Use `Effect.all` with `{ concurrency }` option** for parallel execution of multiple effects:

```typescript
// Run all tasks in parallel (unbounded)
const results = yield* Effect.all(tasks, { concurrency: "unbounded" })

// Limit to 5 concurrent tasks
const results = yield* Effect.all(tasks, { concurrency: 5 })

// Sequential (default) — no concurrency option
const results = yield* Effect.all(tasks)
```

### Effect.forEach with Concurrency

```typescript
// Process items in parallel with bounded concurrency
const processed = yield* Effect.forEach(
    users,
    (user) => sendNotification(user),
    { concurrency: 10 },
)
```

### Short-Circuiting

By default, parallel operations short-circuit on first failure. Use `{ mode: "either" }` or `{ mode: "validate" }` to collect all results:

```typescript
// Collect all successes and failures
const results = yield* Effect.all(tasks, {
    concurrency: "unbounded",
    mode: "either",
})
```

## Queue

Queues provide point-to-point communication between fibers with backpressure.

### Queue Variants

| Variant | Behavior When Full |
|---------|-------------------|
| `Queue.bounded(n)` | Suspends producer until space available (backpressure) |
| `Queue.unbounded` | Never blocks, grows without limit |
| `Queue.sliding(n)` | Drops oldest items when full |
| `Queue.dropping(n)` | Drops newest items when full |

### Producer/Consumer Pattern

```typescript
import { Effect, Queue } from "effect"

const program = Effect.gen(function* () {
    const queue = yield* Queue.bounded<Job>(100)

    // Producer fiber
    const producer = yield* Effect.fork(
        Effect.forEach(
            jobs,
            (job) => Queue.offer(queue, job),
            { discard: true },
        ),
    )

    // Consumer fiber
    const consumer = yield* Effect.fork(
        Effect.forever(
            Effect.gen(function* () {
                const job = yield* Queue.take(queue)
                yield* processJob(job)
            }),
        ),
    )

    // Wait for producer to finish
    yield* Fiber.join(producer)

    // Signal consumer to stop
    yield* Queue.shutdown(queue)
    yield* Fiber.join(consumer)
})
```

### Queue Operations

```typescript
// Add item (suspends if bounded queue is full)
yield* Queue.offer(queue, item)

// Add multiple items
yield* Queue.offerAll(queue, items)

// Take item (suspends if empty)
const item = yield* Queue.take(queue)

// Take all available items (non-blocking)
const items = yield* Queue.takeAll(queue)

// Check size
const size = yield* Queue.size(queue)

// Shutdown — interrupts all waiting fibers
yield* Queue.shutdown(queue)
```

## PubSub

PubSub provides broadcast communication — every subscriber receives every message.

```typescript
import { Effect, PubSub, Queue } from "effect"

const program = Effect.gen(function* () {
    const pubsub = yield* PubSub.bounded<Event>(256)

    // Subscribe returns a Queue scoped to the subscriber
    const sub1 = yield* PubSub.subscribe(pubsub)
    const sub2 = yield* PubSub.subscribe(pubsub)

    // Publish — delivered to ALL subscribers
    yield* PubSub.publish(pubsub, { type: "user_created", userId: "123" })

    // Each subscriber receives the message independently
    const event1 = yield* Queue.take(sub1)
    const event2 = yield* Queue.take(sub2)
    // event1 === event2
})
```

### PubSub Variants

| Variant | Behavior When Full |
|---------|-------------------|
| `PubSub.bounded(n)` | Suspends publisher until subscribers catch up |
| `PubSub.unbounded` | Never blocks publisher |
| `PubSub.sliding(n)` | Drops oldest messages per subscriber |
| `PubSub.dropping(n)` | Drops newest messages per subscriber |

## Semaphore

**Use `Effect.makeSemaphore`** to limit concurrent access to a shared resource:

```typescript
import { Effect } from "effect"

const program = Effect.gen(function* () {
    // Allow max 3 concurrent database connections
    const semaphore = yield* Effect.makeSemaphore(3)

    const queryWithLimit = (sql: string) =>
        semaphore.withPermits(1)(
            executeQuery(sql),
        )

    // Only 3 queries run at a time, others wait
    yield* Effect.all(
        queries.map((q) => queryWithLimit(q)),
        { concurrency: "unbounded" },
    )
})
```

### Multiple Permits

```typescript
// Heavy operation requires 2 permits
const heavyQuery = semaphore.withPermits(2)(expensiveOperation)
```

## Deferred & Latch

### Deferred — One-Time Signal

`Deferred` is a one-shot value that can be set exactly once. Multiple fibers can wait for it.

```typescript
import { Deferred, Effect } from "effect"

const program = Effect.gen(function* () {
    const ready = yield* Deferred.make<void>()

    // Worker waits until signaled
    const worker = yield* Effect.fork(
        Effect.gen(function* () {
            yield* Deferred.await(ready)
            yield* doWork()
        }),
    )

    // Initialize, then signal readiness
    yield* initialize()
    yield* Deferred.succeed(ready, undefined)

    yield* Fiber.join(worker)
})
```

### Deferred Operations

```typescript
// Create
const deferred = yield* Deferred.make<string>()

// Complete with success — unblocks all waiters
yield* Deferred.succeed(deferred, "done")

// Complete with failure — all waiters receive error
yield* Deferred.fail(deferred, new MyError())

// Wait for completion
const value = yield* Deferred.await(deferred)
```

### Latch — Open/Close Gate

`Latch` is a gate that starts closed and can be opened to release all waiters:

```typescript
import { Effect, Latch } from "effect"

const program = Effect.gen(function* () {
    const gate = yield* Latch.make()

    // Workers wait at the gate
    const workers = yield* Effect.all(
        Array.from({ length: 5 }, () =>
            Effect.fork(
                Effect.gen(function* () {
                    yield* Latch.await(gate)
                    yield* processItem()
                }),
            ),
        ),
    )

    // Open the gate — all workers start simultaneously
    yield* Latch.open(gate)

    yield* Effect.all(workers.map(Fiber.join))
})
```

## Shared State with Ref

**Always use `Ref` for mutable state** shared across fibers. Never use `let` variables mutated inside Effects.

> See also: `anti-patterns.md` — [Mutable State Without Ref]

```typescript
import { Effect, Ref } from "effect"

const program = Effect.gen(function* () {
    const counter = yield* Ref.make(0)

    // Safe concurrent updates — no race conditions
    yield* Effect.all(
        Array.from({ length: 1000 }, () =>
            Ref.update(counter, (n) => n + 1),
        ),
        { concurrency: "unbounded" },
    )

    const final = yield* Ref.get(counter)
    // final === 1000 (guaranteed)
})
```

### Ref Operations

```typescript
// Create
const ref = yield* Ref.make(initialValue)

// Read
const value = yield* Ref.get(ref)

// Replace
yield* Ref.set(ref, newValue)

// Atomic read-modify-write
yield* Ref.update(ref, (current) => current + 1)

// Atomic modify and return old value
const old = yield* Ref.getAndUpdate(ref, (n) => n + 1)

// Atomic modify and return computed value
const result = yield* Ref.modify(ref, (current) => [
    computeResult(current), // returned value
    newState(current),      // new state
])
```

## Race & Timeout

### Effect.race

Run two effects concurrently, return the first to complete, interrupt the loser:

```typescript
// Use fastest available source
const data = yield* Effect.race(
    fetchFromCache(key),
    fetchFromDatabase(key),
)
```

### Effect.timeout

```typescript
import { Duration, Effect } from "effect"

// Returns Option — None if timed out
const result = yield* longOperation.pipe(
    Effect.timeout(Duration.seconds(5)),
)

// Fail with specific error on timeout
const result = yield* longOperation.pipe(
    Effect.timeoutFail({
        duration: Duration.seconds(5),
        onTimeout: () => new TimeoutError({ message: "Operation timed out" }),
    }),
)
```

> See also: `anti-patterns.md` — [Manual Retry/Timeout Logic]

## Graceful Shutdown

### NodeRuntime.runMain

**Use `NodeRuntime.runMain`** as the entry point for Node.js applications. It handles SIGINT/SIGTERM and runs all finalizers:

```typescript
import { NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

const program = Effect.gen(function* () {
    yield* startServer()
    yield* Effect.log("Server running")
    // Keeps running until interrupted (SIGINT/SIGTERM)
    yield* Effect.never
})

NodeRuntime.runMain(program.pipe(Effect.scoped))
```

### Effect.addFinalizer

Register cleanup logic that runs when the enclosing scope closes:

```typescript
const program = Effect.gen(function* () {
    yield* Effect.addFinalizer(() =>
        Effect.log("Shutting down gracefully..."),
    )

    const server = yield* startServer()

    yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
            yield* server.close()
            yield* Effect.log("Server stopped")
        }),
    )

    yield* Effect.never
})
```

> See also: `resource-patterns.md` — [Cleanup Guarantees] for how finalizers interact with resources

## Polling

**Use `Effect.repeat` with `Schedule`** for polling patterns:

```typescript
import { Duration, Effect, Schedule } from "effect"

// Poll every 5 seconds
const pollStatus = Effect.repeat(
    checkStatus,
    Schedule.spaced(Duration.seconds(5)),
)

// Exponential backoff polling
const pollWithBackoff = Effect.repeat(
    checkStatus,
    Schedule.exponential(Duration.seconds(1)).pipe(
        Schedule.union(Schedule.spaced(Duration.seconds(30))), // cap at 30s
    ),
)

// Poll until condition met
const waitForReady = Effect.repeat(
    checkStatus,
    Schedule.spaced(Duration.seconds(1)).pipe(
        Schedule.whileOutput((status) => status !== "ready"),
    ),
)

// Fixed interval (includes execution time in interval)
const fixedPoll = Effect.repeat(
    checkStatus,
    Schedule.fixed(Duration.seconds(10)),
)
```

### Schedule Comparison

| Schedule | Behavior |
|----------|----------|
| `Schedule.spaced(d)` | Wait `d` between end of one execution and start of next |
| `Schedule.fixed(d)` | Run at fixed intervals (accounts for execution time) |
| `Schedule.exponential(d)` | Double the delay each time: `d`, `2d`, `4d`, `8d`... |
| `Schedule.recurs(n)` | Repeat at most `n` times |

## Quick Reference Table

| Primitive | Import | Create | Use Case |
|-----------|--------|--------|----------|
| `Effect.fork` | `Effect` | `Effect.fork(effect)` | Background task |
| `Effect.forkDaemon` | `Effect` | `Effect.forkDaemon(effect)` | App-lifetime background task |
| `Effect.forkScoped` | `Effect` | `Effect.forkScoped(effect)` | Scope-lifetime background task |
| `Fiber.join` | `Fiber` | `Fiber.join(fiber)` | Wait for fiber result |
| `Fiber.interrupt` | `Fiber` | `Fiber.interrupt(fiber)` | Stop fiber gracefully |
| `Effect.all` | `Effect` | `Effect.all(effects, { concurrency })` | Parallel execution |
| `Effect.forEach` | `Effect` | `Effect.forEach(items, fn, { concurrency })` | Parallel iteration |
| `Queue.bounded` | `Queue` | `Queue.bounded<A>(n)` | Point-to-point with backpressure |
| `Queue.unbounded` | `Queue` | `Queue.unbounded<A>` | Point-to-point, no limit |
| `Queue.sliding` | `Queue` | `Queue.sliding<A>(n)` | Drop oldest when full |
| `Queue.dropping` | `Queue` | `Queue.dropping<A>(n)` | Drop newest when full |
| `PubSub.bounded` | `PubSub` | `PubSub.bounded<A>(n)` | Broadcast with backpressure |
| `PubSub.unbounded` | `PubSub` | `PubSub.unbounded<A>` | Broadcast, no limit |
| `Effect.makeSemaphore` | `Effect` | `Effect.makeSemaphore(n)` | Limit concurrent access |
| `Deferred.make` | `Deferred` | `Deferred.make<A>()` | One-time signal |
| `Latch.make` | `Latch` | `Latch.make()` | Open/close gate |
| `Ref.make` | `Ref` | `Ref.make(initial)` | Atomic shared state |
| `Effect.race` | `Effect` | `Effect.race(a, b)` | First to complete wins |
| `Effect.timeout` | `Effect` | `Effect.timeout(d)` | Timeout with Option |
| `Effect.timeoutFail` | `Effect` | `Effect.timeoutFail({ duration, onTimeout })` | Timeout with error |
| `Effect.repeat` | `Effect` | `Effect.repeat(effect, schedule)` | Polling / repeated execution |
