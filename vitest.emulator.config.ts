import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/study-session.emulator.ts", "tests/firestore-rules.emulator.ts", "tests/calculation-review.emulator.ts"], testTimeout: 60000, hookTimeout: 30000 } });
