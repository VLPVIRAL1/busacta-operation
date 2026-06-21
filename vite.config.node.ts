// Node.js hosting build config (Hostinger, VPS, etc.)
// The nitro `node-server` preset outputs to .output/server/index.mjs,
// which is what the `start` script expects (node .output/server/index.mjs).
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
    nitro({ preset: "node-server" }),
    react(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
});
