// All suites use the v1.86.4 isolated localhost emulator harness.
process.argv.splice(2, 0, ...(process.argv.length === 2 ? ["encore", "timer", "calculation"] : []));
await import("./run-auth-browser.mjs");
