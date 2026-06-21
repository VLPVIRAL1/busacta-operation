import { ListChecks, MessageCircleQuestion, Mail, type LucideIcon } from "lucide-react";
import type { TemplateCategory } from "@/lib/queries/ops.queries";

/** Per-category display metadata shared by the list rows and the workspace. */
export const CATEGORY_META: Record<
  TemplateCategory,
  { label: string; short: string; icon: LucideIcon; accent: string }
> = {
  workflow: { label: "Workflow", short: "WF", icon: ListChecks, accent: "border-l-primary/40" },
  clarification: {
    label: "Clarification",
    short: "CA",
    icon: MessageCircleQuestion,
    accent: "border-l-sky-500/50",
  },
  email: { label: "Email", short: "EM", icon: Mail, accent: "border-l-violet-500/50" },
};
