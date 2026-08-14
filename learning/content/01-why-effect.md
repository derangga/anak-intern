---
title: Why Effect
order: 1
slug: 01-why-effect
summary: An Effect is a description of a program, not a running one.
---

> Placeholder. Real prose lands in `skills-b8j.6`. This file exists so the
> pipeline has something to chew on.

## A description, not a running thing

```ts twoslash
import { Effect } from 'effect'

const program = Effect.succeed(1).pipe(Effect.map((n) => n + 1))
//    ^?
```

Nothing has run yet. To actually execute it:

```ts twoslash
import { Effect } from 'effect'
const program = Effect.succeed(2)
// ---cut---
const result = await Effect.runPromise(program)
```

## The shape of it

```mermaid
flowchart LR
  A[Effect&lt;A, E, R&gt;] --> B[runPromise]
  B --> C[Promise&lt;A&gt;]
```

## An untagged block

Not every snippet is a compilable file, so untagged blocks are highlighted
only:

```ts
someUndeclaredThing.doesNotExist()
```
