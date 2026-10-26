import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync, openSync, closeSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";
const root = process.cwd(), out = join(root, ".auth-results.local");
mkdirSync(out, { recursive: true });
const listening = port => new Promise(resolve => {
  const s = createConnection({ host: "127.0.0.1", port }); s.setTimeout(300);
  s.once("connect", () => { s.destroy(); resolve(true); }); s.once("error", () => resolve(false)); s.once("timeout", () => { s.destroy(); resolve(false); });
});
for (const p of [8086, 9098, 5178, 9158]) if (await listening(p)) throw new Error("Dedicated emulator port in use; existing process untouched");
const require = createRequire(import.meta.url);
const { AuthEmulator, SingleProjectMode } = require(join(process.env.APPDATA, "npm/node_modules/firebase-tools/lib/emulator/auth/index.js"));
const auth = new AuthEmulator({ host: "127.0.0.1", port: 9098, projectId: "demo-study-hotfix", singleProjectMode: SingleProjectMode.NO_WARNING });
const fd = openSync(join(out, "emulator.log"), "w");
const emulator = spawn("java", ["-Duser.language=en", "-Duser.country=US", "-jar", join(homedir(), ".cache/firebase/emulators/cloud-firestore-emulator-v1.22.0.jar"), "--host", "127.0.0.1", "--port", "8086", "--websocket_port", "9158", "--project_id", "demo-study-hotfix", "--rules", join(root, "firestore.rules")], { cwd: out, windowsHide: true, stdio: ["ignore", fd, fd] });
let vite;
try {
  for (let i = 0; !(await listening(8086)); i++) { if (i > 120 || emulator.exitCode !== null) throw new Error("Firestore startup failed"); await delay(250); }
  await auth.start();
  if (process.argv.includes("auth") && process.env.AUTH_SESSION_CONTROL !== "1") process.env.AUTH_SESSION_TEST = "1";
  process.env.ENCORE_TEST_METRICS = "1";
  vite = await createServer({ logLevel: "error", configFile: join(root, "tests/vite-timer.config.ts") }); await vite.listen();
  const suites = process.argv.slice(2); if (!suites.length) suites.push("auth");
  for (const suite of suites) {
    const file = { encore: "test-encore-browser.mjs", auth: "test-auth-browser.mjs", timer: "test-timer-browser.mjs", calculation: "test-calculation-browser.mjs", review: "test-review-browser.mjs" }[suite];
    if (!file) throw new Error("Unknown suite");
    const test = spawn(process.execPath, [join(root, "scripts", file)], { cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, PLAYWRIGHT_MODULE_PATH: join(homedir(), ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"), CALCULATION_BROWSER_URL: "http://127.0.0.1:5178" } });
    const code = await new Promise((resolve, reject) => { test.once("error", reject); test.once("exit", c => resolve(c ?? 1)); });
    if (code) { process.exitCode = code; break; }
  }
} finally { await vite?.close(); await auth.stop(); emulator.kill(); await Promise.race([new Promise(resolve => emulator.once("exit", resolve)), delay(5000)]); closeSync(fd); }
