# BusAcTa Operations

Enterprise SaaS platform for accounting firms — manages clients, projects, tasks, invoicing, HR, e-signatures, document organization, and financial operations. Multi-platform: web (SSR), desktop (Electron), and mobile (iOS/Android via Capacitor).

## Tech Stack

| Layer         | Technology                                                               |
| ------------- | ------------------------------------------------------------------------ |
| Framework     | React 19, TanStack Start 1.x (SSR), TanStack Router (file-based routing) |
| Language      | TypeScript 5.8 (strict mode)                                             |
| Styling       | Tailwind CSS 4, shadcn/ui (New York style), Radix UI primitives          |
| Data Fetching | TanStack React Query                                                     |
| Forms         | React Hook Form + Zod validation                                         |
| Backend       | Supabase (PostgreSQL, Auth, Realtime, Storage)                           |
| Rich Text     | Tiptap 3.x (tables, images, mentions)                                    |
| PDF           | jsPDF, pdf-lib, react-pdf, pdfjs-dist                                    |
| Spreadsheets  | xlsx, PapaParse (CSV)                                                    |
| Charts        | Recharts                                                                 |
| Notifications | Sonner (toast), Capacitor Push                                           |
| Drag & Drop   | dnd-kit                                                                  |
| Bundler       | Vite 7                                                                   |
| Desktop       | Electron 42                                                              |
| Mobile        | Capacitor 8 (iOS + Android)                                              |
| Edge/SSR      | Cloudflare Workers                                                       |
| Testing       | Vitest (unit), Playwright (E2E)                                          |

## Environment Variables

### Client-side (Vite — `import.meta.env`)

| Variable                        | Description                    |
| ------------------------------- | ------------------------------ |
| `VITE_SUPABASE_URL`             | Supabase project API URL       |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/public JWT key   |
| `VITE_SUPABASE_PROJECT_ID`      | Supabase project ID            |
| `VITE_BYPASS_ACCESS`            | Dev-only: bypass access checks |

### Server-side (`process.env`)

| Variable                    | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `SUPABASE_URL`              | Supabase project API URL                                  |
| `SUPABASE_PUBLISHABLE_KEY`  | Supabase anon key (for SSR client)                        |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Admin key that bypasses RLS — server-only     |
| `SUPABASE_ANON_KEY`         | Fallback client key reference                             |
| `APP_ORIGIN`                | App deployment URL (OAuth redirects, links)               |
| `PUBLIC_APP_ORIGIN`         | Public-facing app URL                                     |
| `PUBLIC_SITE_URL`           | Website URL for redirects                                 |
| `CRON_SECRET`               | Protects public cron endpoints via `x-cron-secret` header |

### Integration Keys

| Variable                        | Description                     |
| ------------------------------- | ------------------------------- |
| `MS_GRAPH_CLIENT_ID`            | Microsoft Graph OAuth client ID |
| `MS_GRAPH_CLIENT_SECRET`        | Microsoft Graph OAuth secret    |
| `MS_GRAPH_REDIRECT_URI`         | OAuth callback URL              |
| `MS_GRAPH_WEBHOOK_CLIENT_STATE` | Webhook verification state      |
| `LOVABLE_API_KEY`               | Lovable.dev API key (OTP SMS)   |
| `TWILIO_API_KEY`                | Twilio SMS API key              |
| `TWILIO_FROM_NUMBER`            | Twilio sender phone number      |

### Backup Worker

| Variable       | Description                              |
| -------------- | ---------------------------------------- |
| `DATABASE_URL` | PostgreSQL connection string (port 5432) |
| `PORT`         | Worker port (default 8080)               |

## Database Schema

All tables use Row-Level Security (RLS). Key domains:

### Core

`profiles`, `user_roles`, `firms`, `projects`, `client_entities`, `tasks`, `task_messages`, `task_attachments`, `task_subtasks`, `task_action_items`, `time_logs`, `task_audit`

### Finance

`invoices`, `invoice_line_items`, `invoice_payments`, `journal_entries`, `journal_lines`, `bank_accounts`, `bank_feed_lines`, `bank_import_batches`, `bank_match_rules`, `bank_merchant_memory`, `petty_cash_transactions`, `petty_cash_transaction_lines`, `budget_journals`, `budget_journal_lines`, `chart_of_accounts`, `vendors`

### HR / Attendance

`attendance_entries`, `attendance_import_runs`, `attendance_employee_aliases`, `leave_requests`, `training_courses`, `training_assignments`, `staff_compensation`, `employee_import_runs`

### E-Signature

`esign_documents`, `esign_envelopes`, `esign_recipients`, `esign_fields`, `esign_field_values`, `esign_templates`, `esign_page_layouts`, `esign_audit`

### Organizer (Forms)

`organizer_templates`, `organizer_template_versions`, `organizer_blocks` (25+ field types), `organizer_deployments`, `organizer_responses`, `organizer_public_links`, `organizer_review_audit_log`

### Messaging

`chat_threads`, `chat_messages`, `chat_thread_members`, `chat_presence`, `message_reactions`, `message_reads`, `message_stars`, `daily_notes`, `personal_reminders`, `quick_replies`

### Security / Audit

`login_events`, `user_devices`, `mfa_trusted_devices`, `mfa_backup_codes`, `mfa_enforcement_status`, `security_audit_log`, `sensitive_action_log`, `otp_challenges`, `user_otp_channels`

### Integrations

`connected_email_accounts`, `tracked_email_threads`, `tracked_emails`, `email_sync_jobs`, `integration_credentials`, `sharepoint_sync_jobs`, `sharepoint_upload_sessions`

### Other

`project_custom_field_defs`, `project_pricing_rules`, `recurring_schedules`, `app_settings`, `incident_records`, `leads`, `direct_clients`, `office_keys`, `folder_library_templates`, `document_templates`, `client_documents`

240+ tables total. Full type definitions in `src/integrations/supabase/types.ts`.

## Auth & RBAC

Six application roles: `super_admin`, `admin`, `finance_manager`, `hr_manager`, `employee`, `client`.

RLS enforced on every table using these PostgreSQL functions:

- `has_role(user_id, role)` — checks role membership
- `current_user_role()` — returns highest-priority role
- `user_can_access_firm(firm_id)` — firm access check

Users can hold multiple roles. Active role stored in localStorage and switchable at runtime.

MFA support: backup codes, OTP (email/SMS), trusted device registry, per-role enforcement.

## Available Scripts

| Command                  | Description                       |
| ------------------------ | --------------------------------- |
| `bun run dev`            | Start development server with HMR |
| `bun run build`          | Production build (8GB heap)       |
| `bun run build:dev`      | Development build (8GB heap)      |
| `bun run preview`        | Preview production build          |
| `bun run lint`           | ESLint static analysis            |
| `bun run format`         | Prettier auto-format              |
| `bun run test`           | Vitest unit tests                 |
| `bun run test:e2e`       | Playwright E2E tests              |
| `bun run check:routes`   | Validate route links              |
| `bun run perf:todos`     | Performance audit script          |
| `bun run desktop:build`  | Build Electron desktop app        |
| `bun run mobile:sync`    | Sync Capacitor native projects    |
| `bun run mobile:ios`     | Sync and open iOS project         |
| `bun run mobile:android` | Sync and open Android project     |

## Project Structure

```
├── docs/                  # Compliance, dev guides, reports
├── e2e/                   # Playwright E2E tests
├── electron/              # Electron main process, preload, icon
├── mobile/                # Capacitor native projects
├── public/                # Static assets
├── scripts/               # Build & utility scripts
├── supabase/
│   ├── config.toml        # Supabase CLI config
│   └── migrations/        # 160+ SQL migrations
├── tests/                 # Vitest unit tests
├── worker/
│   └── backup-worker/     # Standalone pg_dump backup service
├── src/
│   ├── assets/            # Images, static files
│   ├── components/
│   │   ├── ui/            # 47 shadcn/ui components
│   │   ├── admin/         # Admin panel components
│   │   ├── auth/          # Login, MFA, invite flows
│   │   ├── clients/       # Client management
│   │   ├── esign/         # E-signature UI
│   │   ├── finance/       # Invoicing, GL, bank recon
│   │   ├── hr/            # Attendance, leave, training
│   │   ├── organizer/     # Form builder & responses
│   │   └── ...            # 22 feature directories
│   ├── hooks/             # Custom React hooks
│   ├── integrations/
│   │   └── supabase/      # Client, auth, types, middleware
│   ├── lib/
│   │   ├── auth/          # Auth context, server-fn auth
│   │   ├── finance/       # Financial logic
│   │   ├── esign/         # E-signature logic
│   │   ├── pdf/           # PDF rendering
│   │   ├── queries/       # React Query hooks
│   │   └── ...            # 28 feature directories
│   ├── routes/            # TanStack Router file-based routes
│   ├── styles/            # Global CSS
│   └── workers/           # Cloudflare Worker scripts
├── .env                   # Environment variables
├── capacitor.config.ts    # Mobile app config
├── vite.config.ts         # Vite + TanStack Start config
├── wrangler.jsonc         # Cloudflare Workers config
└── package.json
```
