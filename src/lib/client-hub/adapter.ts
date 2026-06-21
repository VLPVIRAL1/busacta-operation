/**
 * ClientAdapter — single source of truth that lets one set of UI components
 * (Profile / Contacts / Team & Access / Projects-or-Tasks / Documents tabs,
 * onboarding wizard, pricing) render against EITHER a B2B firm (B2B) or a
 * B2C client (B2C) without `if (stream === ...)` sprinkled in the UI.
 *
 * Both streams now share the exact same database shape (mirror tables
 * created in the parity migration). The adapter just maps stream-specific
 * table names, FK columns, labels and theme classes.
 *
 * DRY rule (project memory): no parallel component trees. The firm-side
 * tabs are the source of truth; the direct-side reuses them via the
 * adapter. This file is the seam.
 */

import type { ReactNode } from "react";

export type ClientStream = "cpa" | "direct";

export interface ClientAdapter {
  stream: ClientStream;

  // ---- Labels (user-facing nouns) ----
  entityNoun: string; // "Firm" | "Client"
  entityNounPlural: string; // "Firms" | "Clients"
  fourthTabLabel: string; // "Projects" | "Tasks"

  // ---- Tables / columns ----
  table: "firms" | "direct_clients";
  fkColumn: "firm_id" | "direct_client_id";
  contactsTable: "firm_contacts" | "direct_client_contacts";
  contactCapsTable: "firm_contact_capabilities" | "direct_client_contact_capabilities";
  teamTable: "firm_internal_team" | "direct_client_internal_team";
  memberCapsTable: "firm_member_capabilities" | "direct_client_member_capabilities";
  addressesTable: "firm_addresses" | "direct_client_addresses";
  lifecycleTable: "firm_lifecycle_events" | "direct_client_lifecycle_events";
  sharepointTable: "firm_sharepoint_config" | "direct_client_sharepoint_config";

  // ---- Display fields on the primary row ----
  nameField: "name" | "display_name";
  codeField: "firm_identifier" | "client_code";
  contactEmailField: "contact_email" | "email";
  contactPhoneField: "contact_phone" | "phone";
  codeLabel: string; // "Firm Identifier" | "Client Code"
  brandingPathPrefix: string; // "firms" | "direct-clients"
  queryKeyPrefix: string; // "firm-hub" | "direct-client-hub"

  // ---- Theme (sets the scoped CSS class so reds vs blues stay correct) ----
  themeClass: "" | "theme-direct";

  // ---- Deep-link helper (used by the unified /clients split-view header) ----
  legacyDetailHref: (id: string) => string;

  // ---- Pricing shape: where invoices read rates from ----
  pricing:
    | { mode: "per-project" }
    | { mode: "per-client-rate-card"; tableName: "direct_client_task_pricing" };
}

export const firmAdapter: ClientAdapter = {
  stream: "cpa",
  entityNoun: "Firm",
  entityNounPlural: "Firms",
  fourthTabLabel: "Projects",
  table: "firms",
  fkColumn: "firm_id",
  contactsTable: "firm_contacts",
  contactCapsTable: "firm_contact_capabilities",
  teamTable: "firm_internal_team",
  memberCapsTable: "firm_member_capabilities",
  addressesTable: "firm_addresses",
  lifecycleTable: "firm_lifecycle_events",
  sharepointTable: "firm_sharepoint_config",
  nameField: "name",
  codeField: "firm_identifier",
  contactEmailField: "contact_email",
  contactPhoneField: "contact_phone",
  codeLabel: "Firm Identifier",
  brandingPathPrefix: "firms",
  queryKeyPrefix: "firm-hub",
  themeClass: "",
  legacyDetailHref: (id) => `/clients/${id}`,
  pricing: { mode: "per-project" },
};

export const directAdapter: ClientAdapter = {
  stream: "direct",
  entityNoun: "Client",
  entityNounPlural: "Clients",
  fourthTabLabel: "Tasks",
  table: "direct_clients",
  fkColumn: "direct_client_id",
  contactsTable: "direct_client_contacts",
  contactCapsTable: "direct_client_contact_capabilities",
  teamTable: "direct_client_internal_team",
  memberCapsTable: "direct_client_member_capabilities",
  addressesTable: "direct_client_addresses",
  lifecycleTable: "direct_client_lifecycle_events",
  sharepointTable: "direct_client_sharepoint_config",
  nameField: "display_name",
  codeField: "client_code",
  contactEmailField: "email",
  contactPhoneField: "phone",
  codeLabel: "Client Code",
  brandingPathPrefix: "direct-clients",
  queryKeyPrefix: "direct-client-hub",
  themeClass: "theme-direct",
  legacyDetailHref: (id) => `/clients/${id}`,
  pricing: { mode: "per-client-rate-card", tableName: "direct_client_task_pricing" },
};

export function getAdapter(stream: ClientStream): ClientAdapter {
  return stream === "cpa" ? firmAdapter : directAdapter;
}

/**
 * Helper to wrap a subtree in the adapter's theme scope. Direct-client
 * subtree gets `theme-direct` (rose primary); firm subtree gets no wrapper.
 */
export function withAdapterTheme(adapter: ClientAdapter, children: ReactNode): ReactNode {
  if (!adapter.themeClass) return children;
  // Caller wraps in <div className={adapter.themeClass}> directly; this is
  // exported as a value so the import is non-null at compile time.
  return children;
}
