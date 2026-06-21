/**
 * Shared "colored tab" styling — mirrors the communication pane's tab bar:
 * a colored top-border, a faint tint, and colored text on the active tab, with
 * a distinct accent per tab position. Used by the Clients hub (B2B firm + B2C)
 * and the Ops Workspace so every multi-tab surface reads the same.
 *
 * Usage:
 *   <div className="border-b">
 *     <TabsList className={coloredTabsListClass}>
 *       <TabsTrigger value="x" className={coloredTabTrigger(0)}>…</TabsTrigger>
 *       <TabsTrigger value="y" className={coloredTabTrigger(1)}>…</TabsTrigger>
 *     </TabsList>
 *   </div>
 */

export const coloredTabsListClass = "h-auto flex-wrap bg-transparent gap-1 p-0";

const BASE =
  "rounded-none border-t-2 border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none";

/** Active-state accents, indexed by tab position (wraps if there are more tabs). */
const ACCENTS: string[] = [
  "data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=active]:text-primary",
  "data-[state=active]:border-amber-500 data-[state=active]:bg-amber-500/10 data-[state=active]:text-amber-700 dark:data-[state=active]:text-amber-300",
  "data-[state=active]:border-emerald-500 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300",
  "data-[state=active]:border-violet-500 data-[state=active]:bg-violet-500/10 data-[state=active]:text-violet-700 dark:data-[state=active]:text-violet-300",
  "data-[state=active]:border-rose-500 data-[state=active]:bg-rose-500/10 data-[state=active]:text-rose-700 dark:data-[state=active]:text-rose-300",
  "data-[state=active]:border-cyan-500 data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-700 dark:data-[state=active]:text-cyan-300",
];

/** Returns the className for a colored tab trigger at the given position. */
export function coloredTabTrigger(index: number): string {
  return `${BASE} ${ACCENTS[index % ACCENTS.length]}`;
}
