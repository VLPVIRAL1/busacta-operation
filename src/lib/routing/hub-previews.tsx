import type { ReactNode } from "react";
import type { ModuleKey } from "@/lib/routing/use-nav";

/**
 * Tiny stylized SVG mockups (~120×72) for each Tier-1 hub.
 * Pure CSS-token colors so they automatically respect dark mode.
 * Used by the "All hubs" grid on /dashboard.
 */

const W = 120;
const H = 72;

function Frame({
  children,
  accent = "hsl(var(--primary))",
}: {
  children: ReactNode;
  accent?: string;
}) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid slice">
      <rect x="0" y="0" width={W} height={H} fill="hsl(var(--muted))" />
      <rect x="0" y="0" width={W} height="10" fill={accent} opacity="0.35" />
      <circle cx="5" cy="5" r="1.4" fill={accent} />
      <circle cx="10" cy="5" r="1.4" fill={accent} opacity="0.7" />
      <circle cx="15" cy="5" r="1.4" fill={accent} opacity="0.5" />
      {children}
    </svg>
  );
}

const block = (x: number, y: number, w: number, h: number, op = 0.6) => (
  <rect x={x} y={y} width={w} height={h} rx="1.5" fill="hsl(var(--foreground))" opacity={op} />
);

const dashboardPreview = (
  <Frame>
    {block(6, 16, 32, 18, 0.25)}
    {block(44, 16, 32, 18, 0.25)}
    {block(82, 16, 32, 18, 0.25)}
    {block(6, 40, 108, 6, 0.4)}
    {block(6, 50, 108, 6, 0.3)}
    {block(6, 60, 70, 6, 0.25)}
  </Frame>
);

const opsPreview = (
  <Frame accent="hsl(var(--chart-2, var(--primary)))">
    {block(6, 16, 32, 50, 0.2)}
    {block(10, 20, 24, 6, 0.5)}
    {block(10, 28, 24, 6, 0.4)}
    {block(10, 36, 24, 6, 0.4)}
    {block(44, 16, 32, 50, 0.2)}
    {block(48, 20, 24, 6, 0.5)}
    {block(48, 28, 24, 6, 0.4)}
    {block(82, 16, 32, 50, 0.2)}
    {block(86, 20, 24, 6, 0.5)}
  </Frame>
);

const communicationPreview = (
  <Frame>
    {block(6, 18, 60, 6, 0.55)}
    {block(6, 28, 50, 5, 0.35)}
    {block(54, 38, 60, 6, 0.5)}
    {block(64, 48, 50, 5, 0.35)}
    {block(6, 58, 40, 6, 0.45)}
  </Frame>
);

const hrPreview = (
  <Frame>
    {[16, 38, 60, 82].map((x) => (
      <g key={x}>
        <circle cx={x + 8} cy="34" r="6" fill="hsl(var(--foreground))" opacity="0.4" />
        <rect
          x={x}
          y="44"
          width="22"
          height="3"
          rx="1"
          fill="hsl(var(--foreground))"
          opacity="0.5"
        />
        <rect
          x={x + 2}
          y="50"
          width="18"
          height="2.5"
          rx="1"
          fill="hsl(var(--foreground))"
          opacity="0.3"
        />
      </g>
    ))}
  </Frame>
);

const learningPreview = (
  <Frame>
    {block(6, 16, 50, 24, 0.35)}
    {block(60, 16, 54, 8, 0.5)}
    {block(60, 28, 54, 4, 0.3)}
    {block(60, 34, 40, 4, 0.3)}
    {block(6, 46, 108, 4, 0.45)}
    {block(6, 54, 70, 4, 0.3)}
  </Frame>
);

const growthPreview = (
  <Frame>
    {block(6, 56, 8, 8, 0.5)}
    {block(20, 50, 8, 14, 0.5)}
    {block(34, 42, 8, 22, 0.55)}
    {block(48, 36, 8, 28, 0.6)}
    {block(62, 28, 8, 36, 0.65)}
    {block(76, 22, 8, 42, 0.7)}
    {block(90, 18, 8, 46, 0.75)}
    {block(104, 14, 8, 50, 0.85)}
  </Frame>
);

const firmHubPreview = (
  <Frame>
    <rect x="6" y="20" width="40" height="46" rx="2" fill="hsl(var(--foreground))" opacity="0.35" />
    {block(10, 24, 32, 4, 0.55)}
    {block(10, 32, 32, 3, 0.35)}
    {block(10, 38, 24, 3, 0.35)}
    {block(50, 20, 64, 6, 0.5)}
    {block(50, 30, 64, 4, 0.3)}
    {block(50, 38, 64, 4, 0.3)}
    {block(50, 46, 64, 4, 0.3)}
    {block(50, 54, 40, 4, 0.3)}
  </Frame>
);

const adminPreview = (
  <Frame>
    {block(6, 16, 28, 50, 0.35)}
    {block(38, 16, 76, 8, 0.5)}
    {block(38, 28, 76, 4, 0.3)}
    {block(38, 36, 76, 4, 0.3)}
    {block(38, 44, 76, 4, 0.3)}
    {block(38, 52, 50, 4, 0.3)}
  </Frame>
);

const guidePreview = (
  <Frame>
    {block(8, 16, 50, 50, 0.3)}
    {block(12, 20, 42, 4, 0.55)}
    {block(12, 28, 42, 3, 0.35)}
    {block(12, 34, 38, 3, 0.35)}
    {block(12, 40, 30, 3, 0.35)}
    {block(64, 16, 50, 24, 0.35)}
    {block(64, 44, 50, 22, 0.35)}
  </Frame>
);

const portalPreview = (
  <Frame>
    {block(6, 16, 108, 14, 0.4)}
    {block(6, 34, 52, 32, 0.3)}
    {block(62, 34, 52, 14, 0.3)}
    {block(62, 52, 52, 14, 0.3)}
  </Frame>
);

export const HUB_PREVIEW: Partial<Record<ModuleKey, ReactNode>> = {
  dashboard: dashboardPreview,
  ops: opsPreview,
  communication: communicationPreview,
  hr: hrPreview,
  learning: learningPreview,
  growth: growthPreview,
  clients: firmHubPreview,
  admin: adminPreview,
  guide: guidePreview,
  portal: portalPreview,
};

export function FallbackPreview() {
  return (
    <Frame>
      {block(6, 18, 108, 6, 0.4)}
      {block(6, 28, 80, 4, 0.3)}
      {block(6, 36, 90, 4, 0.3)}
      {block(6, 44, 60, 4, 0.3)}
    </Frame>
  );
}
