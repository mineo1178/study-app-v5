import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/task-safety.emulator.ts', 'tests/material-binding.emulator.ts', 'tests/study-session.emulator.ts', 'tests/learning-plan.emulator.ts', 'tests/schedule.emulator.ts'], testTimeout: 60000, hookTimeout: 30000, fileParallelism: false } });
