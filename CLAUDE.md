# CLAUDE.md — BusAcTa Operations

## Project

BusAcTa Operations — enterprise accounting firm SaaS platform. Supabase project ID: `mkqsrxpfgxovxaabtpld`.

## Commands

```bash
bun run dev          # Dev server with HMR
bun run build        # Production build
bun run lint         # ESLint
bun run format       # Prettier
bun run test         # Vitest unit tests
bun run test:e2e     # Playwright E2E tests
bun run check:routes # Validate route links
```

## Architecture

- **SSR framework:** TanStack Start on Cloudflare Workers. Server entry at `src/server.ts`.
- **Routing:** File-based via TanStack Router. Routes live in `src/routes/`. The route tree is auto-generated — do not edit `src/routeTree.gen.ts` or `src/routes/registered-routes.generated.ts`.
- **Database:** Supabase PostgreSQL with Row-Level Security on every table. Types auto-generated in `src/integrations/supabase/types.ts` — do not hand-edit.
- **Server functions:** TanStack Start server functions served at `/_serverFn/`. Auth injected via fetch interceptor in `src/lib/auth/server-fn-auth.ts`.
- **Supabase clients:** Browser client in `src/integrations/supabase/client.ts` (anon key, localStorage). Server admin client in `src/integrations/supabase/client.server.ts` (service-role key, bypasses RLS).

## Code Conventions

- TypeScript strict mode. Path alias: `@/*` maps to `src/*`.
- UI components: shadcn/ui in `src/components/ui/` (New York style, slate base).
- Feature code organized by domain in both `src/components/<feature>/` and `src/lib/<feature>/`.
- Styling: Tailwind CSS 4 utility classes. Use `cn()` from `@/lib/shared/utils` to merge classes.

## Key Patterns

- **Data fetching:** TanStack React Query. Stale time 5 min, 2 retries with exponential backoff. Dictionary tables (firms, templates, roles) cached 30–60 min.
- **Forms:** React Hook Form + Zod schemas for validation.
- **Toasts:** Sonner (`toast.success()`, `toast.error()`).
- **Drag & drop:** dnd-kit (core + sortable).
- **Rich text:** Tiptap editor with tables, images, mentions extensions.

## Auth

Five roles: `super_admin`, `admin`, `hr_manager`, `employee`, `client`.

RLS functions (PostgreSQL):

- `has_role(user_id, role)` — role check
- `current_user_role()` — highest-priority role for current user
- `user_can_access_firm(firm_id)` — firm-scoped access

Server-side auth: `requireSupabaseAuth` middleware validates JWT on server functions. Auth context in `src/lib/auth/auth-context.tsx`.

## Cron Endpoints

Public API routes at `/api/public/*` protected by `x-cron-secret` header matching `CRON_SECRET` env var. Used for: esign reminders, esign expiry, access review, chat auto-archive, organizer due-soon notifications.

## Do Not

- Edit generated files: `routeTree.gen.ts`, `registered-routes.generated.ts`, `src/integrations/supabase/types.ts`
- Expose `SUPABASE_SERVICE_ROLE_KEY` in any client-side code or import
- Disable or weaken RLS policies
- Import from `src/integrations/supabase/client.server.ts` in client-side code
- Remove `SECURITY DEFINER` from RLS helper functions without understanding the implications

## Testing

- **Unit tests:** Vitest. Config in `vitest.config.ts`. Tests in `tests/` and `__tests__/` directories.
- **E2E tests:** Playwright. Config in `playwright.config.ts`. Tests in `e2e/`.

## Platforms

- **Web:** Primary. TanStack Start SSR deployed to Cloudflare Workers.
- **Desktop:** Electron 42. Config in `electron/`. Loads the web app URL. Custom protocol `busacta://` for OAuth deep-links.
- **Mobile:** Capacitor 8. Config in `capacitor.config.ts`. App ID: `app.lovable.busacta.one`. Custom scheme `busacta://`.

## Build Note

`vite.config.ts` uses `@lovable.dev/vite-tanstack-config` — a Lovable platform dependency that bundles TanStack Start, React, Tailwind, and Cloudflare plugins. This works as-is for local development.

## Session Behavior — MANDATORY RULES

These rules apply to EVERY chat and EVERY new session without exception.

### Rule 1 — Code Review Graph — Session Start Only

At the start of every session, silently auto-run `get_minimal_context_tool` via ToolSearch with `task="session start - review current changes"`. Report the summary (nodes, edges, risk score, affected flows, top communities). No approval required. Do NOT run it before every prompt — session start only.

### Rule 2 — Skills — NEVER Run

**NEVER invoke any skill via the `Skill` tool under any circumstances.** This is absolute — no exceptions. Do NOT auto-trigger based on task shape, skill trigger descriptions, or user message content. Do NOT ask for approval to run a skill. Do NOT suggest running a skill. Skills waste tokens and are prohibited for every session.

### Rule 3 — Agents — Express Permission Required

**NEVER invoke the `Agent` tool (any `subagent_type`: general-purpose, Explore, Plan, claude, claude-code-guide, etc.) without the user's explicit, express permission in the current conversation for that specific invocation.** Default to direct tools (Read, Grep, Glob, Edit, `code-review-graph` MCP) for all exploration and edits. If a task genuinely warrants an agent, state what agent + prompt + why and wait for an explicit "yes". Auto Mode does not override this rule.

## MCP Tools

Use `code-review-graph` MCP tools BEFORE Grep/Glob/Read for any code exploration, impact analysis, or review — faster and cheaper. Key tools: `semantic_search_nodes`, `query_graph`, `get_impact_radius`, `detect_changes`, `get_review_context`, `get_affected_flows`, `get_architecture_overview`.
