import { defineConfig } from "vitest/config";

// Run maintained source/tests only, never investigation or recovered build copies.
export default defineConfig({ test: { include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"] } });
