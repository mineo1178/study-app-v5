import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['tests/material-binding.emulator.ts'],testTimeout:30000,hookTimeout:30000}});
