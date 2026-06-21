/**
 * Runtime guard: TipTap extensions break silently when multiple copies of
 * `@tiptap/core` are loaded (custom Nodes register against a different
 * `Extension` base class than the React editor). This module imports the
 * `Node` class and tags it; subsequent imports validate the tag matches.
 */
import { Node } from "@tiptap/core";

const TAG = "__lovable_tiptap_core_singleton__";
type Tagged = { [TAG]?: string };

const globalAny = globalThis as Tagged;
const ours = "3.23.5";

if (globalAny[TAG] && globalAny[TAG] !== ours) {
  // eslint-disable-next-line no-console
  console.error(
    `[tiptap] Duplicate @tiptap/core detected (loaded ${globalAny[TAG]} and ${ours}). ` +
      `Custom blocks (Progress, Kanban, Drawing, Calendar) will not render. ` +
      `Run \`bun add @tiptap/core@${ours}\` to dedupe.`,
  );
} else {
  globalAny[TAG] = ours;
}

// Sanity check: the Node class itself must be a constructor
if (typeof Node !== "function") {
  // eslint-disable-next-line no-console
  console.error(
    "[tiptap] @tiptap/core did not export Node as a constructor — install is corrupt or duplicated.",
  );
}

export const TIPTAP_CORE_VERSION = ours;
