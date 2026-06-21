// Shared route-pattern matcher used by both the build-time QA script and the
// in-app Route Health page. Mirrors the regex logic in
// scripts/check-route-links.ts.

export function routeToRegex(p: string): RegExp {
  const escaped = p
    .split("/")
    .map((seg) => {
      if (!seg) return "";
      if (seg.startsWith("$")) return "[^/]+";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}/?$`);
}

export function buildMatchers(paths: readonly string[]) {
  return paths.map((p) => ({ path: p, re: routeToRegex(p) }));
}

export function findMatchingRoute(
  literal: string,
  matchers: { path: string; re: RegExp }[],
): string | null {
  const clean = literal.split(/[?#]/)[0];
  for (const m of matchers) if (m.re.test(clean)) return m.path;
  return null;
}

/** Normalise `${id}` template substitutions to a placeholder segment. */
export function normaliseLiteral(raw: string): string {
  return raw.replace(/\$\{[^}]+\}/g, "x");
}
