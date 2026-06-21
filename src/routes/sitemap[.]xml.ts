import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";

const BASE_URL = "https://one.busacta.com";

interface SitemapEntry {
  path: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Public-indexable surface only. The internal app (Ops, Finance,
        // Petty Cash, HR, Learning, Admin, etc.) is auth-gated and must
        // not appear here per the BusAcTa Operations blueprint.
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/login", changefreq: "monthly", priority: "0.6" },
          { path: "/legal/privacy", changefreq: "yearly", priority: "0.5" },
          { path: "/legal/terms", changefreq: "yearly", priority: "0.5" },
          { path: "/legal/security", changefreq: "yearly", priority: "0.5" },
          { path: "/legal/dpa", changefreq: "yearly", priority: "0.5" },
          { path: "/guide/manual", changefreq: "weekly", priority: "0.8" },
          { path: "/guide/faq", changefreq: "monthly", priority: "0.7" },
          { path: "/guide/workflows", changefreq: "monthly", priority: "0.7" },
        ];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
