import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["tests/learning-plan.emulator.ts","tests/test-review.emulator.ts","tests/review-spacing.emulator.ts","tests/calculation-review.emulator.ts","tests/study-session.emulator.ts"],testTimeout:60000,hookTimeout:30000}});
