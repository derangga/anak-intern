# HTTP API Patterns

> **Effect v4.** `@effect/platform` was absorbed into core `effect`. HTTP API modules live in
> `effect/unstable/httpapi`, server/client primitives in `effect/unstable/http`. Platform
> adapters (`@effect/platform-node`, `-bun`, `-deno`, `-browser`) remain separate packages.
>
> The v3 fluent-setter style (`.pipe(HttpApiEndpoint.setPath(...), setSuccess(...))`) is gone.
> v4 uses an options object on the constructor and `.add` / `.middleware` methods on the values.

## API Definition

**Use `HttpApi.make`** to define your API, composed of groups and endpoints:

```typescript
import { HttpApi, HttpApiGroup, HttpApiEndpoint, OpenApi } from 'effect/unstable/httpapi'

const MyApi = HttpApi.make('MyApi')
  .add(UsersApi)
  .add(OrdersApi)
  .annotate(OpenApi.Title, 'My Application API')
  .annotate(OpenApi.Version, '1.0.0')
  .annotate(OpenApi.Description, 'A sample Effect API')
```

`HttpApi.make(name)` no longer takes API-wide error or service generics. Declare errors on
each endpoint instead.

### HttpApiGroup

Group related endpoints. `.add` is variadic:

```typescript
const UsersApi = HttpApiGroup.make('users').add(getUser, createUser, deleteUser)

// With a shared path prefix
const AdminApi = HttpApiGroup.make('admin').prefix('/admin').add(deleteUser)
```

## Endpoint Configuration

### Defining Endpoints

```typescript
import { HttpApiEndpoint, HttpApiSchema } from 'effect/unstable/httpapi'
import { Schema } from 'effect'

// GET with path parameters. Note the key is `params`, not `path`
const getUser = HttpApiEndpoint.get('getUser', '/users/:id', {
  params: { id: UserId },
  success: User,
  error: UserNotFoundError,
})

// POST with request body
const createUser = HttpApiEndpoint.post('createUser', '/users', {
  payload: CreateUserInput,
  success: User.pipe(HttpApiSchema.status(201)),
  error: UserCreateError,
})

// DELETE: the constructor is `delete`, not v3's `del`
const deleteUser = HttpApiEndpoint.delete('deleteUser', '/users/:id', {
  params: { id: UserId },
  error: UserNotFoundError,
})
```

`params`, `query`, and `headers` accept either a `Schema.Struct` or a bare fields object.
`{ id: UserId }` is shorthand for `Schema.Struct({ id: UserId })`.

### Available HTTP Methods

| Method | Constructor                                    |
| ------ | ---------------------------------------------- |
| GET    | `HttpApiEndpoint.get(id, path, options?)`      |
| POST   | `HttpApiEndpoint.post(id, path, options?)`     |
| PUT    | `HttpApiEndpoint.put(id, path, options?)`      |
| PATCH  | `HttpApiEndpoint.patch(id, path, options?)`    |
| DELETE | `HttpApiEndpoint.delete(id, path, options?)`   |
| HEAD   | `HttpApiEndpoint.head(id, path, options?)`     |
| OPTIONS| `HttpApiEndpoint.options(id, path, options?)`  |

### Endpoint Options

| v4 option | v3 equivalent | Purpose |
| --- | --- | --- |
| `params` | `setPath(schema)` | Path parameters (`/:id`, `/:slug`) |
| `query` | `setUrlParams(schema)` | Query string parameters |
| `headers` | `setHeaders(schema)` | Required headers |
| `payload` | `setPayload(schema)` | Request body |
| `success` | `setSuccess(schema)` | Success response schema |
| `error` | `addError(schema)` | Error response, one schema or an array |

```typescript
HttpApiEndpoint.post('createUser', '/users', {
  params: { orgId: OrganizationId },
  query: { dryRun: Schema.optional(Schema.String) },
  headers: { 'x-request-id': Schema.String },
  payload: CreateUserInput,
  success: User,
  error: [UserCreateError, QuotaExceededError], // array for multiple
})
```

### Error Status Mapping

**Define HTTP status codes on error types**, not in handlers:

```typescript
// Status code defined ONCE on the error class
export class UserNotFoundError extends Schema.TaggedError<UserNotFoundError>()(
  'UserNotFoundError',
  { userId: UserId, message: Schema.String }
).pipe(HttpApiSchema.status(404)) {}

export class UserCreateError extends Schema.TaggedError<UserCreateError>()('UserCreateError', {
  message: Schema.String,
}).pipe(HttpApiSchema.status(400)) {}

// Reference it on the endpoint. Status mapping is automatic
const getUser = HttpApiEndpoint.get('getUser', '/users/:id', {
  success: User,
  error: UserNotFoundError, // Automatically 404
})
```

v3's `HttpApiSchema.annotations({ status: 404 })` third argument is gone. Two v4 forms work:

```typescript
// Preferred: pipe the status onto the schema
Schema.TaggedError<E>()('E', { ... }).pipe(HttpApiSchema.status(404))

// Also valid: the annotation directly
Schema.TaggedError<E>()('E', { ... }, { httpApiStatus: 404 })
```

> See also: [Duplicating Error Handling in Every Route Handler] in `anti-patterns.md`
> See also: [HTTP Status Codes (Without Generic Errors)] in `error-patterns.md`

## HttpApiBuilder Handlers

### Implementing Handlers

`handlers.handle(...)` is a method now, with no `.pipe(HttpApiBuilder.handle(...))` chain:

```typescript
import { HttpApiBuilder } from 'effect/unstable/httpapi'

const UsersApiLive = HttpApiBuilder.group(MyApi, 'users', (handlers) =>
  handlers
    .handle('getUser', ({ params }) =>
      Effect.gen(function* () {
        const userService = yield* UserService
        return yield* userService.findById(params.id)
      })
    )
    .handle('createUser', ({ payload }) =>
      Effect.gen(function* () {
        const userService = yield* UserService
        return yield* userService.create(payload)
      })
    )
    .handle('deleteUser', ({ params }) =>
      Effect.gen(function* () {
        const userService = yield* UserService
        yield* userService.delete(params.id)
      })
    )
)
```

For a single standalone endpoint outside a group, use `HttpApiBuilder.endpoint` (v3's
`HttpApiBuilder.handler`).

### Handler Parameters

The handler function receives a destructurable object whose keys match the endpoint options:

| Property  | Source          | Declared by       |
| --------- | --------------- | ----------------- |
| `params`  | URL path params | `params` option   |
| `query`   | Query string    | `query` option    |
| `payload` | Request body    | `payload` option  |
| `headers` | HTTP headers    | `headers` option  |

Note `params` and `query`. v3 called these `path` and `urlParams`.

### Providing Dependencies

```typescript
const MyApiLive = HttpApiBuilder.layer(MyApi).pipe(
  Layer.provide(UsersApiLive),
  Layer.provide(OrdersApiLive),
  Layer.provide(UserService.layer),
  Layer.provide(OrderService.layer)
)
```

`HttpApiBuilder.api(api)` is now `HttpApiBuilder.layer(api)`; it registers the completed API
with `HttpRouter`.

## Deriving an HTTP Client

The same `HttpApi` definition that drives the server also derives a fully-typed client. Endpoint names, params/payload/query/headers shapes, success types, and the error union all come from the contract. There are no hand-written URLs, JSON wrappers, or status-code branches.

### Basic Derivation

```typescript
import { HttpApiClient } from 'effect/unstable/httpapi'
import { Effect } from 'effect'

const program = Effect.gen(function* () {
  const client = yield* HttpApiClient.make(AppApi, {
    baseUrl: 'http://localhost:3000',
  })

  // Shape: client.<groupName>.<endpointName>({ params?, payload?, query?, headers? })
  const user = yield* client.users.getUser({ params: { id: userId } })

  const created = yield* client.users.createUser({
    payload: { email: 'a@b.com', name: 'Alice' },
  })
})
```

The call returns `Effect<Success, TypedErrorUnion | HttpClientError>`. The typed error union is exactly what was declared via the `error` option on each endpoint, so consumers can `catchTag("UserNotFoundError", ...)` with full exhaustiveness.

### Dynamic Base URL via `HttpClient.mapRequest`

When the base URL comes from `Config` (env-driven, differs between SSR and browser), prepend it on the underlying `HttpClient`. Use `HttpApiClient.makeWith` when supplying your own client:

```typescript
import { HttpClient, HttpClientRequest } from 'effect/unstable/http'

const baseHttpClient = (yield * HttpClient.HttpClient).pipe(
  HttpClient.mapRequest(HttpClientRequest.prependUrl(baseUrl))
)

const client =
  yield *
  HttpApiClient.makeWith(AppApi, {
    baseUrl,
    httpClient: baseHttpClient,
  })
```

### `transformClient` for Interceptors

Wrapping the underlying `HttpClient` once means every derived endpoint call goes through it. Use it for auth, logging, retries, or telemetry instead of repeating logic at call sites.

Worked example, silent token refresh on 401, with a semaphore so concurrent 401s don't stampede `/auth/refresh`:

```typescript
import { Effect, Semaphore } from 'effect'
import { HttpBody, HttpClient } from 'effect/unstable/http'

const semaphore = yield * Semaphore.make(1)

const refreshTokens = semaphore
  .withPermits(1)(
    baseHttpClient.post('/api/auth/refresh', { body: HttpBody.jsonUnsafe({}) }).pipe(Effect.scoped)
  )
  .pipe(Effect.ignore)

// HttpClient never *fails* on non-2xx. The 401 arrives as a successful Response value.
// On a 401: refresh once, then re-issue the original request exactly once.
const authClient = baseHttpClient.pipe(
  HttpClient.transformResponse((effect) =>
    Effect.flatMap(effect, (response) =>
      response.status === 401
        ? refreshTokens.pipe(Effect.andThen(effect))
        : Effect.succeed(response)
    )
  )
)

const client =
  yield *
  HttpApiClient.makeWith(AppApi, { baseUrl, httpClient: authClient })
```

v4 renames in that example: `Effect.makeSemaphore` → `Semaphore.make` (module `effect/Semaphore`), `HttpBody.unsafeJson` → `HttpBody.jsonUnsafe`, `Effect.zipRight` → `Effect.andThen`.

A retried response that is still 401 flows back through `HttpApiClient`, which maps it to the contract's typed `Unauthorized` error. Callers see a tagged error, not a raw status code.

### Extracting the Typed Error Union

For non-Effect callers (e.g. TanStack Query `useMutation` / `useQuery`), pull the error union off a client method so `onError` can `switch (error._tag)` exhaustively:

```typescript
export type ApiClientType = ApiClient['client']

// Effect.Error<T> is the v4 type-level extractor
export type ClientError<T> = T extends Effect.Effect<unknown, infer E, unknown> ? E : never

// Usage
type LoginError = ClientError<ReturnType<ApiClientType['auth']['login']>>
// LoginError = InvalidCredentials | ValidationError | HttpClientError
```

v4 also exposes `Effect.Success<T>`, `Effect.Error<T>`, and `Effect.Services<T>` directly, replacing v3's `Effect.Effect.Success` / `.Error` / `.Context`.

### Bridging Client Effects to Promises

`ManagedRuntime.runPromise` rejects with a `FiberFailure` wrapping the cause, so `error._tag` is unreachable. Run to `Exit` and re-reject with the underlying failure value so consumers see the raw tagged error:

```typescript
export const runClient = async <A, E>(
  build: (client: ApiClientType) => Effect.Effect<A, E>
): Promise<A> => {
  const exit = await runtime.runPromiseExit(Effect.flatMap(getClient, build))
  if (Exit.isSuccess(exit)) return exit.value

  const failure = Cause.findErrorOption(exit.cause)
  if (failure._tag === 'Some') throw failure.value // raw tagged error
  throw Cause.squash(exit.cause)
}

// Call site stays linear:
const user = await runClient((client) => client.auth.login({ payload: input }))
```

`Cause.failureOption` was renamed `Cause.findErrorOption` in v4.

### Client Anti-Patterns

```typescript
// FORBIDDEN: hand-rolled fetch against a typed contract
await fetch("/api/users/" + id).then((r) => r.json()) // Use client.users.getUser

// FORBIDDEN: per-call-site refresh/retry logic
const res = await callApi(); if (res.status === 401) { await refresh(); ... } // Use an interceptor

// FORBIDDEN: losing the typed error union by `Effect.catch` (v3's catchAll)
client.users.getUser({ params }).pipe(Effect.catch(() => Effect.fail("oops")))
// Use catchTag("UserNotFoundError", ...) to preserve exhaustiveness
```

## Middleware

### Logging Middleware

```typescript
import { HttpMiddleware, HttpServerRequest } from 'effect/unstable/http'
import { Clock, Effect } from 'effect'

const withLogging = HttpMiddleware.make((handler) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const startTime = yield* Clock.currentTimeMillis

    yield* Effect.log(`→ ${request.method} ${request.url}`)

    const response = yield* handler

    const duration = (yield* Clock.currentTimeMillis) - startTime
    yield* Effect.log(`← ${response.status} (${duration}ms)`)

    return response
  })
)
```

Use `Clock.currentTimeMillis` rather than `Date.now()`. It stays testable under `TestClock`.

### Request ID Middleware

```typescript
import { HttpServerResponse } from 'effect/unstable/http'

const withRequestId = HttpMiddleware.make((handler) =>
  Effect.gen(function* () {
    const requestId = yield* Effect.sync(() => crypto.randomUUID())

    const response = yield* handler.pipe(Effect.annotateCurrentSpan('requestId', requestId))

    return HttpServerResponse.setHeader(response, 'X-Request-Id', requestId)
  })
)
```

### Timeout Middleware

```typescript
import { Duration, Effect } from 'effect'

const withTimeout = (duration: Duration.Input) =>
  HttpMiddleware.make((handler) =>
    handler.pipe(
      Effect.timeout(duration),
      Effect.catchTag('TimeoutError', () =>
        HttpServerResponse.json({ error: 'Request timeout' }, { status: 504 })
      )
    )
  )
```

v4 renames: `Duration.DurationInput` → `Duration.Input`, and `TimeoutException` → `TimeoutError`
(all `*Exception` classes were renamed to `*Error`).

### Middleware Composition Order

Middleware composes inside-out, so the last applied middleware runs first:

```typescript
const ServerLive = HttpRouter.serve(MyApiLive).pipe(
  Layer.provide(HttpRouter.cors({ allowedOrigins: ['http://localhost:3000'] })),
  Layer.provide(NodeHttpServer.layer({ port: 3000 }))
)
```

`HttpApiBuilder.serve()` and `HttpApiBuilder.middlewareCors(...)` are gone. Serving and CORS
both moved to `HttpRouter` (`HttpRouter.serve`, `HttpRouter.cors`).

## Authentication

### HttpApiMiddleware for Security

v3's `HttpApiMiddleware.Tag` is now `HttpApiMiddleware.Service`, configured with `requires`,
`provides`, `error`, and `security`:

```typescript
import { HttpApiMiddleware, HttpApiSchema, HttpApiSecurity } from 'effect/unstable/httpapi'
import { Context, Effect, Layer, Redacted, Schema } from 'effect'

interface User {
  readonly id: string
  readonly email: string
  readonly roles: ReadonlyArray<string>
}

// The authenticated user is a service key the middleware provides
class CurrentUser extends Context.Service<CurrentUser, User>()('CurrentUser') {}

class Unauthorized extends Schema.TaggedError<Unauthorized>()('Unauthorized', {
  message: Schema.String,
}).pipe(HttpApiSchema.status(401)) {}

class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()('Authentication', {
  error: Unauthorized,
  security: { bearer: HttpApiSecurity.bearer },
}) {}
```

Attach it to a group or an individual endpoint with `.middleware(...)`:

```typescript
const ProtectedApi = HttpApiGroup.make('protected')
  .add(getProfile, updateProfile)
  .middleware(Authentication)

// Or per endpoint
const adminOnly = HttpApiEndpoint.delete('deleteUser', '/users/:id', {
  params: { id: UserId },
}).middleware(Authentication)
```

### Implementing the Middleware

Provide an implementation keyed by security scheme name. Each handler receives the wrapped
effect plus the parsed credential, and returns the effect to run:

```typescript
const AuthenticationLive = Layer.succeed(Authentication)({
  bearer: (effect, { credential }) =>
    Effect.gen(function* () {
      const jwt = yield* JwtService
      const user = yield* jwt.verify(Redacted.value(credential)).pipe(
        Effect.mapError(() => new Unauthorized({ message: 'Invalid token' }))
      )
      return yield* Effect.provideService(effect, CurrentUser, user)
    }),
})
```

Because the middleware declares `provides: CurrentUser`, handlers under it can yield
`CurrentUser` without it appearing in their own requirements.

### Handler Accessing Current User

```typescript
handlers.handle('getProfile', () =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    const profileService = yield* ProfileService
    return yield* profileService.getByUserId(user.id)
  })
)
```

### Role-Based Authorization

Role checks live in the handler or in a service, since the middleware has already produced the
`CurrentUser`:

```typescript
const requireRole = (role: string) =>
  Effect.gen(function* () {
    const user = yield* CurrentUser
    if (!user.roles.includes(role)) {
      return yield* Effect.fail(
        new ForbiddenError({ message: `Required role: ${role}`, requiredPermission: role })
      )
    }
  })

handlers.handle('deleteUser', ({ params }) =>
  Effect.gen(function* () {
    yield* requireRole('admin')
    const users = yield* UserService
    yield* users.delete(params.id)
  })
)
```

## CORS

CORS moved from `HttpApiBuilder.middlewareCors` to `HttpRouter.cors`, which returns a `Layer`:

```typescript
import { HttpRouter } from 'effect/unstable/http'

const ServerLive = HttpRouter.serve(MyApiLive).pipe(
  Layer.provide(HttpRouter.cors({ allowedOrigins: ['http://localhost:3000'] })),
  Layer.provide(NodeHttpServer.layer({ port: 3000 }))
)
```

### CORS Configuration Options

```typescript
HttpRouter.cors({
  // Allowed origins, use specific domains in production
  allowedOrigins: ['https://app.example.com', 'https://admin.example.com'],

  // Allowed HTTP methods
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],

  // Allowed request headers
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],

  // Headers exposed to the browser
  exposedHeaders: ['X-Request-Id', 'X-Response-Time'],

  // Allow credentials (cookies, auth headers)
  credentials: true,

  // Preflight cache duration in seconds
  maxAge: 86400,
})
```

For route-scoped CORS rather than global, pass `HttpMiddleware.cors(options)` through
`HttpRouter.middleware`.

### CORS Security Rules

1. **Never use `"*"` with `credentials: true`.** Browsers reject this combination
2. **List specific origins** in production, never a wildcard
3. **Limit `allowedMethods`** to only what your API uses
4. **Set `maxAge`** to reduce preflight requests

## Rate Limiting

### In-Memory Rate Limiter with Ref

```typescript
import { Clock, Duration, Effect, HashMap, Option, Ref } from 'effect'

interface RateLimitState {
  readonly count: number
  readonly resetAt: number
}

const makeRateLimiter = (maxRequests: number, window: Duration.Input) =>
  Effect.gen(function* () {
    const state = yield* Ref.make(HashMap.empty<string, RateLimitState>())
    const windowMs = Duration.toMillis(Duration.fromInputUnsafe(window))

    return (key: string) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis

        const allowed = yield* Ref.modify(state, (map) => {
          const current = HashMap.get(map, key)
          const entry = current.pipe(
            Option.filter((e) => e.resetAt > now),
            Option.getOrElse(() => ({ count: 0, resetAt: now + windowMs }))
          )

          if (entry.count >= maxRequests) {
            return [false, map] as const
          }

          return [
            true,
            HashMap.set(map, key, {
              count: entry.count + 1,
              resetAt: entry.resetAt,
            }),
          ] as const
        })

        if (!allowed) {
          return yield* Effect.fail(
            new RateLimitExceededError({
              message: 'Too many requests',
              retryAfter: windowMs / 1000,
            })
          )
        }
      })
  })
```

`Duration.decode` became `Duration.fromInputUnsafe`, and `Duration.DurationInput` became
`Duration.Input`.

### Rate Limiting Middleware

```typescript
const withRateLimit = HttpMiddleware.make((handler) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const rateLimiter = yield* RateLimiter

    // Use IP or user ID as rate limit key
    const key = request.headers['x-forwarded-for'] ?? 'unknown'
    yield* rateLimiter(key)

    return yield* handler
  })
)
```

> See also: [Semaphore] in `concurrency-patterns.md` for limiting concurrent access to resources

### Rate Limit Error

```typescript
export class RateLimitExceededError extends Schema.TaggedError<RateLimitExceededError>()(
  'RateLimitExceededError',
  {
    message: Schema.String,
    retryAfter: Schema.optional(Schema.Number),
  }
).pipe(HttpApiSchema.status(429)) {}
```

## Request Validation

Schema-based validation is automatic for `payload`, `params`, `query`, and `headers`. Invalid requests return 400 with validation errors.

```typescript
const CreateUserInput = Schema.Struct({
  email: Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  age: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 150 })),
})

const createUser = HttpApiEndpoint.post('createUser', '/users', {
  payload: CreateUserInput, // Auto-validated
  success: User.pipe(HttpApiSchema.status(201)),
})
// Invalid payload → automatic 400 with structured error details
```

v4 turned schema refinements into **checks**: `Schema.pattern` → `Schema.isPattern`,
`minLength` → `isMinLength`, `int` → `isInt`, `between` → `isBetween`, applied via `.check(...)`
rather than `.pipe(...)`. See `schema-patterns.md`.

### Path Parameter Validation

```typescript
const getUser = HttpApiEndpoint.get('getUser', '/users/:id', {
  params: { id: UserId }, // Branded UUID, validated automatically
  success: User,
})
// Invalid UUID in path → automatic 400
```

### Query Parameter Validation

```typescript
const listUsers = HttpApiEndpoint.get('listUsers', '/users', {
  query: {
    page: Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThan(0)),
    limit: Schema.NumberFromString.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 100 })),
    sort: Schema.optional(Schema.Literals(['asc', 'desc'])),
  },
  success: Schema.Array(User),
})
```

`Schema.Literal('asc', 'desc')` became `Schema.Literals(['asc', 'desc'])`, taking one array argument.

## OpenAPI / Swagger

### Annotating the API

v4 uses annotation keys with `.annotate(key, value)` rather than v3's `OpenApi.annotate({...})`:

```typescript
import { HttpApi, OpenApi } from 'effect/unstable/httpapi'

const MyApi = HttpApi.make('MyApi')
  .add(UsersApi)
  .annotate(OpenApi.Title, 'My Application API')
  .annotate(OpenApi.Version, '1.0.0')
  .annotate(OpenApi.Description, 'RESTful API built with Effect')
```

Groups and endpoints take the same `.annotate` method.

### Serving Swagger UI

`HttpApiSwagger.layer` now takes the API as its first argument:

```typescript
import { HttpApiSwagger } from 'effect/unstable/httpapi'

const ServerLive = HttpRouter.serve(MyApiLive).pipe(
  Layer.provide(HttpApiSwagger.layer(MyApi, { path: '/docs' })),
  Layer.provide(NodeHttpServer.layer({ port: 3000 }))
)
// Swagger UI available at http://localhost:3000/docs
```

`HttpApiScalar` is available as an alternative docs UI.

### Full Server Setup

```typescript
import { HttpRouter } from 'effect/unstable/http'
import { HttpApiBuilder, HttpApiSwagger } from 'effect/unstable/httpapi'
import { NodeHttpServer, NodeRuntime } from '@effect/platform-node'
import { Layer } from 'effect'

const MyApiLive = HttpApiBuilder.layer(MyApi).pipe(
  Layer.provide(UsersApiLive),
  Layer.provide(UserService.layer)
)

const ServerLive = HttpRouter.serve(MyApiLive).pipe(
  Layer.provide(HttpRouter.cors({ allowedOrigins: ['http://localhost:3000'] })),
  Layer.provide(HttpApiSwagger.layer(MyApi, { path: '/docs' })),
  Layer.provide(NodeHttpServer.layer({ port: 3000 }))
)

// Run with graceful shutdown
NodeRuntime.runMain(Layer.launch(ServerLive))
```

`runMain` is still the recommended entry point in v4 for signal handling, exit codes, and
error reporting. Process keep-alive is now built into the core runtime. See `v4-semantics.md`.

## Testing HTTP APIs

`HttpApiTest.groups` builds an in-process client against the real handlers, no server and no port:

```typescript
import { assert, it } from '@effect/vitest'
import { HttpApiTest } from 'effect/unstable/httpapi'
import { Effect } from 'effect'

it.effect('returns the user', () =>
  Effect.gen(function* () {
    const client = yield* HttpApiTest.groups(MyApi, ['users'])
    const user = yield* client.users.getUser({ params: { id: userId } })
    assert.strictEqual(user.name, 'Alice')
  }).pipe(Effect.provide(UsersApiLive))
)
```

## Quick Reference Table

| API                                        | Import                        | Purpose                                        |
| ------------------------------------------ | ----------------------------- | ---------------------------------------------- |
| `HttpApi.make(name)`                       | `effect/unstable/httpapi`     | Create API definition                          |
| `api.add(group)`                           | n/a                           | Add endpoint group (method, not `addGroup`)    |
| `HttpApiGroup.make(name)`                  | `effect/unstable/httpapi`     | Group related endpoints                        |
| `group.add(...endpoints)`                  | n/a                           | Add endpoints (variadic method)                |
| `group.prefix(path)`                       | n/a                           | Shared path prefix                             |
| `group.middleware(M)`                      | n/a                           | Attach middleware to a group                   |
| `HttpApiEndpoint.get(id, path, options)`   | `effect/unstable/httpapi`     | Define GET endpoint                            |
| `HttpApiEndpoint.delete(id, path, opts)`   | `effect/unstable/httpapi`     | Define DELETE endpoint (v3: `del`)             |
| `HttpApiBuilder.group(api, name, fn)`      | `effect/unstable/httpapi`     | Implement group handlers                       |
| `handlers.handle(name, fn)`                | n/a                           | Implement endpoint handler (method)            |
| `HttpApiBuilder.endpoint(...)`             | `effect/unstable/httpapi`     | Standalone endpoint impl (v3: `handler`)       |
| `HttpApiBuilder.layer(api)`                | `effect/unstable/httpapi`     | Register API with the router (v3: `api`)       |
| `HttpRouter.serve(appLayer)`               | `effect/unstable/http`        | Serve (v3: `HttpApiBuilder.serve()`)           |
| `HttpRouter.cors(config)`                  | `effect/unstable/http`        | CORS layer (v3: `middlewareCors`)              |
| `HttpApiMiddleware.Service<Self, Cfg>()`   | `effect/unstable/httpapi`     | Define middleware (v3: `Tag`)                  |
| `HttpApiSecurity.bearer`                   | `effect/unstable/httpapi`     | Bearer token security scheme                   |
| `HttpApiSwagger.layer(api, { path })`      | `effect/unstable/httpapi`     | Serve Swagger UI                               |
| `OpenApi.Title` / `.Version`               | `effect/unstable/httpapi`     | OpenAPI annotation keys                        |
| `HttpApiSchema.status(code)`               | `effect/unstable/httpapi`     | HTTP status on a schema/error                  |
| `HttpApiClient.make(api, options)`         | `effect/unstable/httpapi`     | Derive a fully-typed client                    |
| `HttpApiClient.makeWith(api, options)`     | `effect/unstable/httpapi`     | Derive a client with a custom `httpClient`     |
| `HttpApiTest.groups(api, names)`           | `effect/unstable/httpapi`     | In-process test client                         |
| `HttpClient.transformResponse(fn)`         | `effect/unstable/http`        | Interceptor wrapping every response            |
| `HttpClient.mapRequest(fn)`                | `effect/unstable/http`        | Interceptor shaping every outbound request     |
| `HttpClientRequest.prependUrl(url)`        | `effect/unstable/http`        | Prepend a base URL to a request                |
| `HttpBody.jsonUnsafe(value)`               | `effect/unstable/http`        | JSON body (v3: `unsafeJson`)                   |
