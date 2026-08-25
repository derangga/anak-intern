# Schema Patterns

> **Effect v4.** Schema was substantially reworked. The biggest shift: v3's standalone
> refinement schemas and `.pipe(...)` filters became **checks** applied with `.check(...)`, and
> `transform` / `transformOrFail` were replaced by `decodeTo` with a `SchemaTransformation` or
> `SchemaGetter`. `Schema.brand`, `Schema.Struct`, `Schema.Class`, and `Schema.TaggedError`
> keep their v3 shape.

## Branded Types for IDs

**Always brand entity IDs** to prevent accidentally passing the wrong ID type:

```typescript
import { Schema } from "effect"

// Entity IDs - always branded with namespace
export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("@App/UserId"))
export type UserId = Schema.Schema.Type<typeof UserId>

export const OrganizationId = Schema.String.check(Schema.isUUID()).pipe(
    Schema.brand("@App/OrganizationId"),
)
export type OrganizationId = Schema.Schema.Type<typeof OrganizationId>

export const OrderId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("@App/OrderId"))
export type OrderId = Schema.Schema.Type<typeof OrderId>

export const ProductId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand("@App/ProductId"))
export type ProductId = Schema.Schema.Type<typeof ProductId>
```

v3's `Schema.UUID` no longer exists as a standalone schema. It's a check on `Schema.String`.
`Schema.isUUID(version?)` optionally pins a UUID version. `Schema.ULID` became
`Schema.isULID()` the same way.

### Branding Convention

Use `@Namespace/EntityName` format:
- `@App/UserId` - Main application entities
- `@Billing/InvoiceId` - Billing domain entities
- `@External/StripeCustomerId` - External system IDs

### Creating Branded Values

```typescript
// From string (validates UUID format)
const userId = Schema.decodeSync(UserId)("123e4567-e89b-12d3-a456-426614174000")

// Generate new ID
const newUserId = UserId.make(crypto.randomUUID())

// Type error - can't mix ID types
const order = yield* orderService.findById(userId) // Error: UserId is not OrderId
```

### When NOT to Brand

Don't brand simple strings that don't need type safety:

```typescript
// NOT branded - acceptable
export const Url = Schema.String
export const FilePath = Schema.String
export const EmailAddress = Schema.String.check(Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/))

// These don't need branding because:
// 1. They don't cross service boundaries in ways that could be confused
// 2. They're typically validated by format, not by type
```

## Checks Replace Filters

v3 applied refinements by piping filter schemas. v4 applies **checks** with `.check(...)`, which
accepts several checks at once:

| v3 | v4 |
| --- | --- |
| `Schema.pattern(re)` | `Schema.isPattern(re)` |
| `Schema.minLength(n)` / `maxLength(n)` | `Schema.isMinLength(n)` / `isMaxLength(n)` |
| `Schema.length(n)` | `Schema.isLengthBetween(n, n)` |
| `Schema.nonEmptyString` | `Schema.isNonEmpty` |
| `Schema.int()` | `Schema.isInt()` |
| `Schema.positive()` | `Schema.isGreaterThan(0)` |
| `Schema.between(min, max)` | `Schema.isBetween({ minimum, maximum })` |
| `Schema.greaterThan(n)` | `Schema.isGreaterThan(n)` |
| `Schema.filter(predicate)` | `Schema.check(Schema.makeFilter(predicate))` |
| `Schema.filter(refinement)` | `Schema.refine(refinement)` |

```typescript
// v3
Schema.String.pipe(Schema.minLength(1), Schema.maxLength(100))

// v4: one .check call, multiple checks
Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100))
```

## Schema.Struct for Domain Types

**Prefer Schema.Struct** over TypeScript interfaces for domain types:

```typescript
// CORRECT - Schema.Struct
export const User = Schema.Struct({
    id: UserId,
    email: Schema.String,
    name: Schema.String,
    organizationId: OrganizationId,
    role: Schema.Literals(["admin", "member", "viewer"]),
    createdAt: Schema.DateTimeUtcFromString,
    updatedAt: Schema.DateTimeUtcFromString,
})
export type User = Schema.Schema.Type<typeof User>

// Can derive encoded type for database/API
export type UserEncoded = Schema.Schema.Encoded<typeof User>
```

Two v4 renames above: `Schema.Literal("a", "b", "c")` became `Schema.Literals(["a", "b", "c"])`
(one array argument; `Schema.Literal` now takes exactly one value, and `Schema.Null` replaces
`Schema.Literal(null)`), and `Schema.DateTimeUtc` became `Schema.DateTimeUtcFromString`.
v4's `DateTimeUtc` is the self schema, not the string codec.

### Input Types for Mutations

```typescript
import { Effect, Schema } from "effect"

export const CreateUserInput = Schema.Struct({
    email: Schema.String.check(
        Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
    ).annotate({ description: "Valid email address" }),

    name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(100)),

    organizationId: OrganizationId,

    // v3's optionalWith({ default }), the default is an Effect in v4
    role: Schema.Literals(["admin", "member", "viewer"]).pipe(
        Schema.withDecodingDefaultType(Effect.succeed("member" as const)),
    ),
})
export type CreateUserInput = Schema.Schema.Type<typeof CreateUserInput>

export const UpdateUserInput = Schema.Struct({
    name: Schema.optional(Schema.String.check(Schema.isMinLength(1))),
    role: Schema.optional(Schema.Literals(["admin", "member", "viewer"])),
})
export type UpdateUserInput = Schema.Schema.Type<typeof UpdateUserInput>
```

## Transforms: decodeTo Replaces transform

`Schema.transform` and `Schema.transformOrFail` are gone. Pipe the source schema through
`Schema.decodeTo(target, transformation)`.

### Total Transforms

```typescript
import { Schema, SchemaTransformation } from "effect"

// Comma-separated string to array
export const CommaSeparatedList = Schema.String.pipe(
    Schema.decodeTo(
        Schema.Array(Schema.String),
        SchemaTransformation.transform({
            decode: (s) => s.split(",").map((x) => x.trim()).filter(Boolean),
            encode: (arr) => arr.join(","),
        }),
    ),
)

// Cents to dollars
export const DollarsFromCents = Schema.Number.check(Schema.isInt()).pipe(
    Schema.decodeTo(
        Schema.Number,
        SchemaTransformation.transform({
            decode: (cents) => cents / 100,
            encode: (dollars) => Math.round(dollars * 100),
        }),
    ),
)
```

### Fallible Transforms

v3's `ParseResult.fail(new ParseResult.Type(...))` became `Effect.fail(new SchemaIssue.*)` inside
a `SchemaGetter`:

```typescript
import { Effect, Schema, SchemaGetter, SchemaIssue } from "effect"

export const PositiveNumber = Schema.Number.pipe(
    Schema.decodeTo(Schema.Number.pipe(Schema.brand("PositiveNumber")), {
        decode: SchemaGetter.transformOrFail((n) =>
            n > 0
                ? Effect.succeed(n)
                : Effect.fail(new SchemaIssue.InvalidValue())
        ),
        encode: SchemaGetter.passthrough(),
    }),
)
```

v4 mappings: `ParseResult.succeed` → `Effect.succeed`, `ParseResult.fail` → `Effect.fail`,
`ParseResult.Type` → `SchemaIssue.InvalidType`.

Note that a simple predicate is usually better expressed as a **check** than a fallible
transform: `Schema.Number.check(Schema.isGreaterThan(0)).pipe(Schema.brand("PositiveNumber"))`.

### JSON Strings

v4 ships this, so don't hand-roll it:

```typescript
// v3: Schema.parseJson(schema)
export const ConfigFromJson = Schema.fromJsonString(Config)

// Untyped JSON: v3's Schema.parseJson()
export const AnyJson = Schema.UnknownFromJsonString
```

## Schema.Class for Entities with Methods

Use `Schema.Class` when entities need methods (unchanged in v4):

```typescript
export class User extends Schema.Class<User>("User")({
    id: UserId,
    email: Schema.String,
    name: Schema.String,
    role: Schema.Literals(["admin", "member", "viewer"]),
    createdAt: Schema.DateTimeUtcFromString,
}) {
    get isAdmin(): boolean {
        return this.role === "admin"
    }

    get displayName(): string {
        return this.name || this.email.split("@")[0]
    }

    canAccessResource(resource: Resource): boolean {
        if (this.isAdmin) return true
        return resource.ownerId === this.id
    }
}

// Usage
const user = new User({
    id: UserId.make(crypto.randomUUID()),
    email: "alice@example.com",
    name: "Alice",
    role: "member",
    createdAt: DateTime.now,
})

console.log(user.displayName) // "Alice"
console.log(user.isAdmin) // false
```

## Annotations

`Schema.annotations(...)` became the `.annotate(...)` method:

```typescript
export const CreateOrderInput = Schema.Struct({
    productId: ProductId.annotate({ description: "The product to order" }),

    quantity: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)).annotate({
        description: "Number of items to order",
        examples: [1, 5, 10],
    }),

    shippingAddress: Schema.Struct({
        line1: Schema.String.annotate({ description: "Street address" }),
        line2: Schema.optional(Schema.String),
        city: Schema.String,
        state: Schema.String.check(Schema.isLengthBetween(2, 2)),
        zip: Schema.String.check(Schema.isPattern(/^\d{5}(-\d{4})?$/)),
    }).annotate({ description: "Shipping destination" }),
}).annotate({
    title: "Create Order Input",
    description: "Input for creating a new order",
})
```

Checks take their own annotations as a trailing argument, as in
`Schema.isMinLength(1, { description: "..." })`, for messages tied to a specific constraint.

## Optional Fields

v4 splits v3's `optional` / `optionalWith` options into distinct combinators:

| v3 | v4 |
| --- | --- |
| `optional(s)` | `optional(s)`, key may be absent **or** `undefined` |
| `optional(s, { exact: true })` | `optionalKey(s)`, key may be absent, never `undefined` |
| `optionalWith(s, { default })` | `s.pipe(withDecodingDefaultType(Effect.succeed(v)))` |
| `optionalWith(s, { exact: true, default })` | `s.pipe(withDecodingDefaultTypeKey(Effect.succeed(v)))` |
| `optionalWith(s, { nullable: true })` | `optional(NullOr(s))` + `decodeTo` filtering nulls |

```typescript
import { Effect, Schema } from "effect"

export const UserPreferences = Schema.Struct({
    // Optional, undefined if not provided
    theme: Schema.optional(Schema.Literals(["light", "dark"])),

    // Optional with default value
    language: Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed("en"))),

    // Nullable (for database compatibility)
    bio: Schema.NullOr(Schema.String),

    // Key may be absent, but never explicitly undefined
    timezone: Schema.optionalKey(Schema.String),
})
```

The default is an **`Effect`**, not a thunk. Write `Effect.succeed("en")`, not `() => "en"`. Use
`withDecodingDefault*` (without `Type`) when the default is expressed in `Encoded` terms rather
than `Type` terms.

## Union Types and Discriminated Unions

`Schema.Union` takes one array in v4:

```typescript
// Simple union, prefer Literals for a set of literals
export const PaymentMethod = Schema.Literals(["card", "bank_transfer", "crypto"])

// Discriminated union (tagged)
export const PaymentDetails = Schema.Union([
    Schema.Struct({
        _tag: Schema.Literal("Card"),
        cardNumber: Schema.String,
        expiry: Schema.String,
        cvv: Schema.String,
    }),
    Schema.Struct({
        _tag: Schema.Literal("BankTransfer"),
        accountNumber: Schema.String,
        routingNumber: Schema.String,
    }),
    Schema.Struct({
        _tag: Schema.Literal("Crypto"),
        walletAddress: Schema.String,
        network: Schema.Literals(["ethereum", "bitcoin", "solana"]),
    }),
])
export type PaymentDetails = Schema.Schema.Type<typeof PaymentDetails>

// Usage with switch
const processPayment = (details: PaymentDetails) => {
    switch (details._tag) {
        case "Card":
            return processCard(details.cardNumber, details.expiry, details.cvv)
        case "BankTransfer":
            return processBankTransfer(details.accountNumber, details.routingNumber)
        case "Crypto":
            return processCrypto(details.walletAddress, details.network)
    }
}
```

`Schema.TaggedStruct(tag, fields)` is the shorthand for a `_tag`-discriminated struct.
`Schema.Tuple` likewise takes one array: `Schema.Tuple([A, B])`.

## Enums and Literals

```typescript
// Use Literals for small, fixed sets
export const UserRole = Schema.Literals(["admin", "member", "viewer"])
export type UserRole = Schema.Schema.Type<typeof UserRole>

// Use Enum (v3: Enums) for larger sets or when you need runtime values
export const OrderStatus = Schema.Enum({
    Pending: "pending",
    Processing: "processing",
    Shipped: "shipped",
    Delivered: "delivered",
    Cancelled: "cancelled",
} as const)
export type OrderStatus = Schema.Schema.Type<typeof OrderStatus>
```

## Recursive Schemas

```typescript
interface Category {
    id: string
    name: string
    children: readonly Category[]
}

export const Category = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    children: Schema.Array(Schema.suspend((): Schema.Codec<Category> => Category)),
})
```

## Decoding and Encoding

The effectful codecs gained an `Effect` suffix, and the `Either` variants became `Exit`:

| v3 | v4 |
| --- | --- |
| `Schema.decodeUnknown(s)` | `Schema.decodeUnknownEffect(s)` |
| `Schema.decode(s)` | `Schema.decodeEffect(s)` |
| `Schema.decodeUnknownEither(s)` | `Schema.decodeUnknownExit(s)` |
| `Schema.encode(s)` | `Schema.encodeEffect(s)` |
| `Schema.encodeUnknownEither(s)` | `Schema.encodeUnknownExit(s)` |
| `Schema.decodeUnknownSync(s)` | unchanged |
| `Schema.decodeSync(s)` | unchanged |

```typescript
// Decode (parse) - use in services
const parseUser = Schema.decodeUnknownEffect(User)
const result = yield* parseUser(rawData) // Effect<User, SchemaError>

// Decode sync - only in controlled contexts
const user = Schema.decodeUnknownSync(User)(rawData)

// Encode - for serialization
const encodeUser = Schema.encodeEffect(User)
const encoded = yield* encodeUser(user) // Effect<UserEncoded, SchemaError>
```

The failure type is `Schema.SchemaError` (v3's `ParseError`), so a decode failure is caught with
`Effect.catchTag("SchemaError", ...)`. Inside a service, a decode failure is usually **your**
bug, not the caller's, so `Effect.die` it rather than surfacing it. See `error-patterns.md`.

## Structural Field Operations

v3's struct combinators moved onto `mapFields`:

| v3 | v4 |
| --- | --- |
| `schema.pipe(Schema.pick("a"))` | `schema.mapFields(Struct.pick(["a"]))` |
| `schema.pipe(Schema.omit("a"))` | `schema.mapFields(Struct.omit(["a"]))` |
| `Schema.partial(schema)` | `schema.mapFields(Struct.map(Schema.optional))` |
| `Schema.required(schema)` | `schema.mapFields(Struct.map(Schema.requiredKey))` |
| `schema.pipe(Schema.extend(other))` | `schema.mapFields(Struct.assign(otherFields))` |
| `Schema.Record({ key, value })` | `Schema.Record(key, value)` |
