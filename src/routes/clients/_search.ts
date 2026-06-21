import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

export const clientsIndexDefaults = {
  stream: "all" as const,
  status: "active" as const,
  q: "",
};

export const clientsIndexSearchSchema = z.object({
  new: fallback(z.enum(["firm", "direct"]).optional(), undefined),
  selected: fallback(z.string().optional(), undefined),
  stream: fallback(z.enum(["all", "cpa", "direct"]), clientsIndexDefaults.stream).default(
    clientsIndexDefaults.stream,
  ),
  status: fallback(z.enum(["active", "deactivated", "all"]), clientsIndexDefaults.status).default(
    clientsIndexDefaults.status,
  ),
  q: fallback(z.string(), clientsIndexDefaults.q).default(clientsIndexDefaults.q),
  tab: fallback(z.string().optional(), undefined),
});

export type ClientsIndexSearch = z.infer<typeof clientsIndexSearchSchema>;

export const firmDetailDefaults = { tab: "profile" as const };
export const firmDetailSearchSchema = z.object({
  tab: fallback(
    z.enum(["profile", "contacts", "team", "projects", "documents"]),
    firmDetailDefaults.tab,
  ).default(firmDetailDefaults.tab),
});
export type FirmDetailSearch = z.infer<typeof firmDetailSearchSchema>;

export const directDetailDefaults = { tab: "profile" as const };
export const directDetailSearchSchema = z.object({
  tab: fallback(
    z.enum(["profile", "contacts", "team", "tasks", "pricing", "documents"]),
    directDetailDefaults.tab,
  ).default(directDetailDefaults.tab),
});
export type DirectDetailSearch = z.infer<typeof directDetailSearchSchema>;
