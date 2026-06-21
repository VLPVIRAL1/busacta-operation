# E-Sign Modernization Plan

## Part A — Suggested features to reach parity with DocuSign/Dropbox Sign/PandaDoc

These are recommendations, not work to do now. Pick which ones you want and we'll plan/build each.

| #   | Feature                                                                      | Why it matters                                                                                                                   |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Templates with reusable fields + role mapping**                            | Already partly built (`templates.tsx`). Add saved field placements per role, one-click "Send from template" with recipient swap. |
| 2   | **Bulk send / mail-merge**                                                   | Send the same envelope to 50 recipients individually (NDAs, offer letters, W-9s). One CSV row per envelope.                      |
| 3   | **Conditional routing & approvers**                                          | "If amount > $10k, route to CFO before client." Builds on existing `routing_order`.                                              |
| 4   | **In-person signing / host signing**                                         | Hand the laptop to a walk-in client; switch identities without re-sending an email.                                              |
| 5   | **Signer attachments**                                                       | Let the signer upload a driver's license / supporting doc inline.                                                                |
| 6   | **Payments collection inline**                                               | Stripe-checkout field type — sign + pay in one flow (great for retainers).                                                       |
| 7   | **SMS delivery + SMS access codes**                                          | Twilio delivery alongside email; 2FA via OTP for high-value envelopes.                                                           |
| 8   | **Knowledge-based authentication (KBA) / ID verification**                   | Required for IRS Form 8879 e-signing. Persona/Stripe Identity integration.                                                       |
| 9   | **Mobile-first signer app + offline draft**                                  | Already responsive; add PWA install + offline localStorage replay.                                                               |
| 10  | **Bulk download as ZIP + bulk export to accounting**                         | CEO/Finance asks for "all Q3 signed envelopes".                                                                                  |
| 11  | **Audit-log export (CSV/JSON)** + downloadable evidence package              | Compliance teams need this.                                                                                                      |
| 12  | **Webhook + Zapier-style triggers** on envelope events                       | `envelope.completed` → push to QuickBooks/Slack.                                                                                 |
| 13  | **Smart anchors** ("\sig1\", "\date\" tokens in PDF auto-place fields)       | Eliminates manual field placement for repeat docs.                                                                               |
| 14  | **Signing groups / shared inbox** ("Anyone on the accounting team can sign") | DocuSign's "Signing Groups" feature.                                                                                             |
| 15  | **Branding per firm** (logo, colors, sender name, custom email domain)       | Already have email infra — add per-firm theming on signer page.                                                                  |
| 16  | **Reminders escalation ladder**                                              | Reminder #3 also notifies the original sender + CC.                                                                              |
| 17  | **Comments / Q&A thread inside the signer view**                             | Signer asks a question without leaving the page.                                                                                 |
| 18  | **Field validation library** (SSN, EIN, routing #, ZIP+4, regex)             | Reduce bounce-back / clean-up work.                                                                                              |
| 19  | **Sealed PDF includes embedded XML metadata (PAdES/CAdES-like)**             | Long-term archival validity; verifiable offline.                                                                                 |
| 20  | **Voided / expired envelope reasons + clone-to-resend**                      | One click to fix a typo'd recipient and resend.                                                                                  |
| 21  | **Two-pane reviewer mode for sender** (PDF + field summary + audit trail)    | Internal QA before sending.                                                                                                      |
| 22  | **Auto-archive after N days** + retention policy per firm                    | Compliance + storage cost control.                                                                                               |

---

## Part B — Work to implement now (this batch)

### B1. Redesign Certificate of Completion (modern layout)

Replace the current text-list certificate with a modern, brand-aligned PDF:

- **Page 1 — Cover summary**
  - BusAcTa Operations wordmark (top-left) + "Certificate of Completion" hero
  - Envelope title, status badge, sealed-on date, sealed-by, SHA-256 (mono)
  - Large QR code (verify URL) + slug
  - "Signers" table: # | Name | Email | Signed at | IP — striped rows
  - "Documents in this envelope" table: name + page count + per-doc SHA-256
- **Page 2 — Audit trail**
  - Timeline-style entries: timestamp | event chip | actor | IP | UA (truncated)
  - Grouped by recipient where applicable
- **Pages 3..N — Attached signed document**
  - **Sealed signed PDF appended directly into the certificate PDF** (so one download = certificate + signed doc, exactly as the user asked)
  - Footer on every appended page: "Sealed document — Envelope <slug> — page N of M"
- Typography: Helvetica + HelveticaBold (already embedded); accent color from `--esign-primary` translated to RGB
- Implementation: rewrite `buildCertificate()` in `src/lib/esign/seal.server.ts` and concat sealed pages into the certificate using `copyPages`. Keep `sealed.pdf` upload as well (back-compat); the new `certificate.pdf` becomes the all-in-one bundle.

### B2. Progressive / lazy PDF page rendering

Today `sign/$token.tsx` renders every page immediately as soon as `pageCount` is known → freezes on 50-page PDFs.

- Wrap each `<PdfPage>` in a viewport-aware mounter:
  - New shared component `LazyPdfPage` using `IntersectionObserver` (rootMargin `1200px 0px`)
  - Until visible (or within margin), render a sized skeleton matching the expected page size (carry forward last-known size or use first-page size as default ratio)
  - Unmount canvas when far off-screen (rootMargin `4000px 0px`) to cap memory on 200-page docs
- `pdf-cache.ts` already keeps the PDFDocument handle alive — only `getPage` + render is deferred, so first-page paint stays instant
- Reuse the same component on builder + reviewer pages (DRY)

### B3. Keyboard navigation for fields

On `/sign/$token`:

- `Tab` / `Shift+Tab` already work for native inputs — make sure every overlay field is tab-focusable (`tabIndex={0}` ordered by `tab_order`)
- `Arrow Down` / `Arrow Up` jump to next/previous required field (focus + scroll into view)
- `Enter` on a signature/initials box opens the SignaturePad dialog
- `Esc` closes any open dialog (already shadcn default)
- `?` opens a small keyboard-shortcuts help popover
- Skip-link: `Skip to next required field` (visually hidden, visible on focus) for screen-reader users

### B4. Reading mode (client-friendly distraction-free view)

- Toggle button in signer header: `Reading mode` (icon: BookOpen)
- When on:
  - Header collapses to a slim 36px bar with progress + "Finish & sign" only
  - Document max-width grows to `min(1200px, 100vw - 32px)`
  - Side chrome (decline button, doc tabs, sender message card) hidden behind a slide-out drawer accessible from the header
  - A small floating action cluster bottom-right stays reachable: `Prev required` ↑ / `Next required` ↓ / `Finish`
- Persist preference in `localStorage` key `esign:reading-mode`
- Honors `prefers-reduced-motion`

### B5. Auto-scroll to next required field on completion

- After a field becomes valid (signature drawn, text entered passing validation, date auto-filled), find the next field in `tab_order` that is required + still empty + visible
- `scrollIntoView({ behavior: "smooth", block: "center" })` on its DOM ref + focus
- Throttled to avoid scroll-fight on rapid edits
- Powers the floating "Next required" button in reading mode (B4)
- Respects `prefers-reduced-motion` (instant jump instead of smooth)

---

## Out of scope for this batch

- Anything from Part A (separate batches once you pick)
- Sender-side `envelopes.$id.tsx` template binding changes
- Any DB schema changes (all B1–B5 work against current schema)
- Mobile gesture work beyond current responsive sizing

---

## Order of execution

1. **B2** (lazy rendering) — biggest perf win, smallest blast radius
2. **B5** (auto-scroll) — small, builds on existing field refs
3. **B3** (keyboard nav) — small additive
4. **B4** (reading mode) — header refactor on signer page
5. **B1** (certificate redesign) — pure server change, no UI risk

Verification after each: rebuild + open `/sign/<token>` on a 10-page envelope in the preview, confirm no scroll freeze + keyboard flow works.
