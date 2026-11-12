import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['tests/official.emulator.ts'],testTimeout:30000,hookTimeout:30000}});
