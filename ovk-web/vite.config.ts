import tailwindcss from "@tailwindcss/vite";
// import { devtools } from "@tanstack/devtools-vite";

import { tanstackRouter } from "@tanstack/router-plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    // devtools(),  // auto-injects the floating TanStack devtools button — re-enable when needed
    tailwindcss(),
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
  ],
  server: {
    port: 3000,
    proxy: {
      "/api": "http://localhost:8000",
    },
    // HTTPS is enabled when OVK_CERT / OVK_KEY env vars are set
    // (by scripts/start-https.sh for LAN/mobile access).
    https: process.env.OVK_CERT
      ? { cert: process.env.OVK_CERT, key: process.env.OVK_KEY }
      : undefined,
  },
});

export default config;
