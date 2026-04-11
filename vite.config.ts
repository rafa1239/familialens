import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deployed as an embedded sub-app at raphaelaltieri.com/familialens/
// The base path ensures all asset URLs in the built output are prefixed correctly.
// For local `vite dev`, the base is "/" — only build output is affected.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? "/familialens/" : "/",
  server: {
    port: 5177,
    host: true
  }
}));
