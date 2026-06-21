// Vercel-only build config. The default vite.config.ts targets Cloudflare
// Workers (and is what `bun run dev` uses). The nitro vite plugin breaks the
// dev server ("Vite environment nitro is unavailable"), so it MUST stay out of
// the default config — this file is used ONLY for `vite build` when deploying
// to Vercel (see the build:vercel script and vercel.json buildCommand).
//
// The nitro `vercel` preset emits Build Output API v3 into .vercel/output,
// which Vercel auto-detects.
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    host: true,
  },
  plugins: [
    tanstackStart(),
    nitro({ preset: "vercel" }),
    react(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
});
