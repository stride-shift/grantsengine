import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Test-only config (Vite build reads no config of its own — this file is for Vitest).
// jsdom is the render-net environment (§3 of CLEANUP_PLAN.md); the React plugin lets
// Vitest transform JSX in component render tests. Pure-util tests run here unaffected.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.js"],
  },
});
