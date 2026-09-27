// @appspec:generated — do not edit
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    // The typed client lives in ../contract.
    fs: { allow: [".."] },
    // In production nginx does this; for `npm run dev`, point it at a running API.
    proxy: { "/api": { target: "http://localhost:3000", rewrite: (path) => path.replace(/^\/api/, "") } },
  },
});
