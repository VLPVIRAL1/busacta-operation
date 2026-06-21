# Query layer (`src/lib/queries/`)

Hub-scoped TanStack Query factories. One file per hub, lazy — create
`<hub>.queries.ts` only when the first query for that hub gets extracted.

## Conventions

1. **File name:** `<hub>.queries.ts` (e.g. `dashboard.queries.ts`, `ops.queries.ts`).
2. **Export shape:** named `queryOptions(...)` factories — never raw
   `useQuery` calls. The factory returns the result of `queryOptions({...})`
   from `@tanstack/react-query` so it's reusable in both `useQuery` and
   `queryClient.ensureQueryData`.
3. **Query keys:** `[<hub>, <subject>, ...args]`. Keep keys identical when
   migrating from inline queries so the cache survives the refactor.
4. **Stay pure:** no React, no `useAuth`. Take the data the query needs
   (e.g. `userId: string`) as plain arguments. Callers pass them in.
5. **Mutations:** live next to queries in the same file as
   `<verb><Subject>Fn` server functions or `useMutation` factory hooks.
   Add when first needed — don't pre-build.
6. **Server-only work:** if a query needs the service-role client or
   secrets, write a `createServerFn` instead and call it from the `queryFn`.

## Example

```ts
// src/lib/queries/dashboard.queries.ts
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const dashboardStatsQuery = (userId: string) =>
  queryOptions({
    queryKey: ["dashboard-stats", userId],
    queryFn: async () => {
      // ...
    },
  });
```

```tsx
// consumer
const { data } = useQuery(dashboardStatsQuery(userId));
```

## Architectural guard

`eslint.config.js` enforces that **routes (`src/routes/**`) and UI components
(`src/components/**`) cannot import `@/integrations/supabase/client`
directly**. New code must go through this layer (or a server fn under
`src/lib/*.functions.ts`).

A long allow-list grandfathers existing files that haven't been migrated
yet. When you migrate a file, **remove it from
`SUPABASE_DIRECT_IMPORT_ALLOWLIST` in `eslint.config.js`** in the same PR
so the rule blocks regressions.

`@/integrations/supabase/client.server` is server-only and is forbidden
everywhere except `src/integrations/**`, `src/lib/**/*.functions.ts`, and
`src/lib/queries/**`.
