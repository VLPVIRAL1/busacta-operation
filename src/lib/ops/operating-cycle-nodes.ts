import {
  Activity,
  BarChart3,
  Bell,
  Clock,
  Gauge,
  Kanban,
  LayoutGrid,
  ListTodo,
  type LucideIcon,
} from "lucide-react";

export type OpsNode = {
  title: string;
  desc: string;
  to: string;
  Icon: LucideIcon;
  shortcut: string;
};

export type TierColor = "slate" | "violet" | "amber" | "emerald" | "blue";

export type OpsColumn = {
  idx: number;
  label: string;
  color: TierColor;
  primary: OpsNode;
  // Optional: a tier can carry a single station. Station 2 (Macro View) has no
  // secondary since the Open Points page was retired.
  secondary?: OpsNode;
};

// Single source of truth for the 5×2 operating-cycle grid.
// Consumed by both the Ops dashboard tile grid and the /guide/shortcuts legend
// so the on-screen mapping and the documented shortcuts can never drift.
export const OPS_COLUMNS: OpsColumn[] = [
  {
    idx: 1,
    label: "1. Setup",
    color: "slate",
    primary: {
      title: "Workspace",
      desc: "Firms, clients, projects, logs and SOPs — your single engagement workspace.",
      to: "/ops/workspace",
      Icon: LayoutGrid,
      shortcut: "1",
    },
  },
  {
    idx: 2,
    label: "2. Macro View",
    color: "violet",
    primary: {
      title: "Pipeline",
      desc: "Push engagements through the macro Kanban board.",
      to: "/ops/pipeline",
      Icon: Kanban,
      shortcut: "2",
    },
  },
  {
    idx: 3,
    label: "3. Action Center",
    color: "amber",
    primary: {
      title: "To-Do",
      desc: "Execute today's assigned tasks and personal checklists.",
      to: "/ops/todos",
      Icon: ListTodo,
      shortcut: "3",
    },
    secondary: {
      title: "Notifications",
      desc: "Mentions, direct assignments, and due-soon alerts.",
      to: "/ops/notifications",
      Icon: Bell,
      shortcut: "8",
    },
  },
  {
    idx: 4,
    label: "4. Audit Trail",
    color: "emerald",
    primary: {
      title: "Time Logs",
      desc: "Track hours against active work items and projects.",
      to: "/ops/reports?tab=time-logs",
      Icon: Clock,
      shortcut: "4",
    },
    secondary: {
      title: "Activity",
      desc: "Recent activity feed across workspaces and team members.",
      to: "/ops/reports?tab=activity",
      Icon: Activity,
      shortcut: "9",
    },
  },
  {
    idx: 5,
    label: "5. Intelligence",
    color: "blue",
    primary: {
      title: "Reports",
      desc: "Daily team throughput, capacity, and project deadlines.",
      to: "/ops/reports",
      Icon: BarChart3,
      shortcut: "5",
    },
    secondary: {
      title: "Workload",
      desc: "Per-person capacity view — track team load, hours, and utilization.",
      to: "/ops/reports?tab=workload",
      Icon: Gauge,
      shortcut: "0",
    },
  },
];
