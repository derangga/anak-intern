# RPC & Cluster Patterns

> **Effect v4.** `@effect/rpc`, `@effect/cluster`, and `@effect/workflow` were absorbed into core
> `effect` as `effect/unstable/rpc`, `effect/unstable/cluster`, and `effect/unstable/workflow`.
> The RPC contract shape changed the most: `RpcGroup.make` is now variadic over `Rpc.make(...)`
> values, and there is no `Rpc.query` / `Rpc.mutation` split.

## RpcGroup for API Organization

**Use `Rpc.make` for each endpoint and `RpcGroup.make` to collect them.** v3's
`RpcGroup.make(name, { record })` form is gone:

```typescript
import { Rpc, RpcGroup } from "effect/unstable/rpc"
import { Effect, Schema } from "effect"

export const UserRpcs = RpcGroup.make(
    Rpc.make("findById", {
        payload: { id: UserId },
        success: User,
        error: UserNotFoundError,
    }),

    Rpc.make("list", {
        payload: {
            organizationId: OrganizationId,
            limit: Schema.Number.pipe(Schema.withDecodingDefaultType(Effect.succeed(50))),
            offset: Schema.Number.pipe(Schema.withDecodingDefaultType(Effect.succeed(0))),
        },
        success: Schema.Array(User),
    }),

    Rpc.make("create", {
        payload: CreateUserInput,
        success: User,
        error: Schema.Union([UserCreateError, ValidationError]),
    }),

    Rpc.make("update", {
        payload: { id: UserId, data: UpdateUserInput },
        success: User,
        error: Schema.Union([UserNotFoundError, ValidationError]),
    }),

    Rpc.make("delete", {
        payload: { id: UserId },
        error: UserNotFoundError,
    }),
)
```

### Rpc.make Options

| Option | Purpose |
| --- | --- |
| `payload` | Request schema, a `Schema.Struct` or a bare fields object |
| `success` | Success schema (defaults to `Schema.Void`) |
| `error` | Error schema (defaults to `Schema.Never`) |
| `stream` | `true` for a streaming response |
| `primaryKey` | Derives a request identity, needed for deduplication/persistence |
| `defect` | Schema for defects (defaults to `Schema.Defect()`) |

v3's naming changed: `input` → `payload`, `output` → `success`. `success` and `error` are
optional now. Omit `error` rather than writing `Schema.Never`, and omit `success` for a
void response.

There is no `Rpc.query` / `Rpc.mutation` distinction in v4. Where the read/write difference
matters operationally, express it with annotations (e.g. `Persisted`, `Uninterruptible`) rather
than separate constructors. `Schema.TaggedRequest` classes are no longer auto-converted into
RPCs. Declare each contract explicitly with `Rpc.make`.

## Error Unions in RPC

**Always use explicit error unions.** Note `Schema.Union` takes one array in v4:

```typescript
// Explicit union of possible errors
Rpc.make("create", {
    payload: CreateOrderInput,
    success: Order,
    error: Schema.Union([
        ValidationError,
        InsufficientInventoryError,
        PaymentFailedError,
        UserNotFoundError,
    ]),
})

// NOT - generic error type
Rpc.make("create", {
    payload: CreateOrderInput,
    success: Order,
    error: GenericError, // WRONG - loses type information
})
```

## RPC Middleware for Authentication

v3's `RpcMiddleware.Tag` is now `RpcMiddleware.Service`, configured with `requires` / `provides`
/ `clientError` type parameters and an options object:

```typescript
import { Rpc, RpcMiddleware } from "effect/unstable/rpc"
import { Context, Effect, Layer } from "effect"

// The authenticated user is a service key the middleware provides
export class CurrentUser extends Context.Service<
    CurrentUser,
    { id: UserId; role: UserRole; organizationId: OrganizationId }
>()("CurrentUser") {}

// Auth middleware, `failure` became `error`
export class AuthMiddleware extends RpcMiddleware.Service<
    AuthMiddleware,
    { provides: CurrentUser }
>()("AuthMiddleware", {
    error: UnauthorizedError,
}) {}

// Middleware implementation
export const AuthMiddlewareLive = Layer.effect(
    AuthMiddleware,
    Effect.gen(function* () {
        const authService = yield* AuthService

        return AuthMiddleware.of({
            execute: (request) =>
                Effect.gen(function* () {
                    const token = request.headers.get("authorization")?.replace("Bearer ", "")

                    if (!token) {
                        return yield* Effect.fail(new UnauthorizedError({ message: "Missing token" }))
                    }

                    return yield* authService.validateToken(token).pipe(
                        Effect.catchTag("TokenExpiredError", () =>
                            Effect.fail(new UnauthorizedError({ message: "Token expired" }))
                        ),
                        Effect.catchTag("TokenInvalidError", () =>
                            Effect.fail(new UnauthorizedError({ message: "Invalid token" }))
                        ),
                    )
                }),
        })
    })
)

// Protected RPCs using middleware
export const ProtectedUserRpcs = UserRpcs.middleware(AuthMiddleware)
```

Set `requiredForClient: true` in the options when the client must supply the middleware too.
The middleware's `provides` metadata removes that service from each handler's requirements, so
handlers can yield `CurrentUser` without declaring it.

## Workflow Definition

**Use `Workflow.make(tag, options)`.** The name moved from an option to the first argument:

```typescript
import { Workflow } from "effect/unstable/workflow"
import { Schema } from "effect"

export const OrderFulfillmentWorkflow = Workflow.make("OrderFulfillmentWorkflow", {
    payload: {
        orderId: OrderId,
        userId: UserId,
        items: Schema.Array(OrderItem),
        shippingAddress: ShippingAddress,
    },
    // Idempotency key prevents duplicate processing
    idempotencyKey: ({ orderId }) => orderId,
    success: FulfillmentResult,
    error: Schema.Union([FulfillmentFailedError, PaymentFailedError]),
})

export const NotificationWorkflow = Workflow.make("NotificationWorkflow", {
    payload: {
        messageId: MessageId,
        channelId: ChannelId,
        authorId: UserId,
    },
    idempotencyKey: ({ messageId }) => messageId,
})
```

`idempotencyKey` is **required** in v4. Workflow definitions expose `_tag` and are
class-compatible constructors, so a separate `id` field in the payload is no longer needed for
identity, because the idempotency key serves that role.

### Workflow Implementation

```typescript
import { Activity } from "effect/unstable/workflow"
import { Effect, Schema } from "effect"

export const OrderFulfillmentWorkflowLayer = OrderFulfillmentWorkflow.toLayer(
    Effect.fn("OrderFulfillmentWorkflow")(function* (payload) {
        // Step 1: Reserve inventory
        const reservation = yield* Activity.make({
            name: "ReserveInventory",
            success: InventoryReservation,
            error: Schema.Union([InsufficientInventoryError, DatabaseError]),
            execute: Effect.gen(function* () {
                const inventory = yield* InventoryService
                return yield* inventory.reserve(payload.items)
            }),
        })

        // Step 2: Process payment
        const payment = yield* Activity.make({
            name: "ProcessPayment",
            success: PaymentResult,
            error: Schema.Union([PaymentFailedError, PaymentTimeoutError]),
            execute: Effect.gen(function* () {
                const payments = yield* PaymentService
                return yield* payments.charge(payload.userId, payload.items)
            }),
        })

        // Step 3: Create shipment
        const shipment = yield* Activity.make({
            name: "CreateShipment",
            success: Shipment,
            error: Schema.Union([ShippingError, AddressInvalidError]),
            execute: Effect.gen(function* () {
                const shipping = yield* ShippingService
                return yield* shipping.createShipment({
                    items: payload.items,
                    address: payload.shippingAddress,
                    reservationId: reservation.id,
                })
            }),
        })

        // Step 4: Send confirmation
        yield* Activity.make({
            name: "SendConfirmation",
            error: NotificationError,
            execute: Effect.gen(function* () {
                const notifications = yield* NotificationService
                yield* notifications.sendOrderConfirmation({
                    userId: payload.userId,
                    orderId: payload.orderId,
                    trackingNumber: shipment.trackingNumber,
                })
            }),
        })

        return { shipment, payment }
    })
)
```

## Activity Patterns

`Activity.make` keeps its v3 shape. **Always include `success` and `error` schemas** when the
activity produces or fails with a value. They're what survives a workflow restart:

```typescript
// CORRECT - schemas specified
yield* Activity.make({
    name: "SendEmail",
    success: EmailSentResult,
    error: Schema.Union([EmailDeliveryError, EmailTemplateError]),
    execute: Effect.gen(function* () {
        // Implementation
        const clock = yield* Clock.currentTimeMillis
        return { messageId: "msg-123", sentAt: clock }
    }),
})

// WRONG - result can't be replayed across restarts
yield* Activity.make({
    name: "SendEmail",
    execute: Effect.gen(function* () {
        return { messageId: "msg-123" } // not serialized, lost on replay
    }),
})
```

`success` defaults to `Schema.Void` and `error` to `Schema.Never`, so omitting them is correct
for a genuinely void, infallible activity, but never when the activity returns data.

`interruptRetryPolicy` is available for controlling retry-on-interrupt behavior per activity.

### Activity Error Handling with Retryable

```typescript
export class ExternalApiError extends Schema.TaggedError<ExternalApiError>()(
    "ExternalApiError",
    {
        message: Schema.String,
        statusCode: Schema.Number,
        retryable: Schema.Boolean,
    },
) {
    static fromResponse(response: Response): ExternalApiError {
        return new ExternalApiError({
            message: `API error: ${response.statusText}`,
            statusCode: response.status,
            retryable: response.status >= 500, // 5xx errors are retryable
        })
    }
}

yield* Activity.make({
    name: "CallExternalApi",
    success: ApiResponse,
    error: ExternalApiError,
    execute: Effect.gen(function* () {
        const client = yield* HttpClient.HttpClient
        const response = yield* client.get(url)
        if (response.status >= 400) {
            return yield* Effect.fail(ExternalApiError.fromResponse(response))
        }
        return yield* response.json
    }),
})
```

## ClusterCron for Scheduled Jobs

`ClusterCron.make` returns a `Layer` directly and takes the work inline as `execute`. There is
no separate `.toLayer` step. The schedule is a parsed `Cron`, not a raw string:

```typescript
import { Cron, Effect } from "effect"
import { ClusterCron } from "effect/unstable/cluster"

export const DailyReportCronLayer = ClusterCron.make({
    name: "DailyReportCron",
    // Cron expression: every day at 6 AM UTC
    cron: Cron.parseUnsafe("0 6 * * *"),
    execute: Effect.gen(function* () {
        yield* Effect.log("Starting daily report generation")

        const reports = yield* ReportService
        yield* reports.generateDailyReport()

        yield* Effect.log("Daily report generation complete")
    }),
})
```

Use `Cron.parse(expr)` when you want the `Result` rather than a throwing parse. Other options:
`shardGroup` to pin the job to a shard group, `calculateNextRunFromPrevious`, and
`skipIfOlderThan` (defaults to `"1 day"`) to skip badly-delayed runs.

The layer requires `Sharding`, so provide your cluster layer beneath it.

## Triggering Workflows

### From an HTTP Handler

```typescript
import { HttpApiBuilder, HttpApiEndpoint } from "effect/unstable/httpapi"

const createOrder = HttpApiEndpoint.post("createOrder", "/orders", {
    payload: CreateOrderInput,
    success: Order,
    error: ValidationError,
})

const OrdersApiLive = HttpApiBuilder.group(Api, "orders", (handlers) =>
    handlers.handle("createOrder", ({ payload }) =>
        Effect.gen(function* () {
            const orders = yield* OrderService
            const workflows = yield* WorkflowClient

            // Create order in database
            const order = yield* orders.create(payload)

            // Trigger async fulfillment workflow
            yield* workflows.workflows.OrderFulfillmentWorkflow.execute({
                orderId: order.id,
                userId: payload.userId,
                items: payload.items,
                shippingAddress: payload.shippingAddress,
            })

            return order
        })
    )
)
```

### From a Backend Service

```typescript
export class MessageService extends Context.Service<MessageService>()("MessageService", {
    make: Effect.gen(function* () {
        const repo = yield* MessageRepo
        const workflows = yield* WorkflowClient

        const create = Effect.fn("MessageService.create")(function* (input: CreateMessageInput) {
            const message = yield* repo.create(input)

            // Trigger notification workflow
            yield* workflows.workflows.NotificationWorkflow.execute({
                messageId: message.id,
                channelId: message.channelId,
                authorId: message.authorId,
            })

            return message
        })

        return { create }
    }),
}) {
    static readonly layer = Layer.effect(this, this.make).pipe(
        Layer.provide([MessageRepo.layer, WorkflowClient.layer]),
    )
}
```

## Import Reference

| v3 package | v4 path |
| --- | --- |
| `@effect/rpc` | `effect/unstable/rpc` (`Rpc`, `RpcGroup`, `RpcClient`, `RpcServer`, `RpcMiddleware`, `RpcSerialization`, `RpcTest`) |
| `@effect/cluster` | `effect/unstable/cluster` (`Sharding`, `Entity`, `Singleton`, `ClusterCron`, `ClusterSchema`, `MessageStorage`, …) |
| `@effect/workflow` | `effect/unstable/workflow` (`Workflow`, `Activity`) |

All three are **unstable modules**. They may take breaking changes in minor releases. Pin your
Effect version if you depend on them heavily. See `v4-semantics.md`.
