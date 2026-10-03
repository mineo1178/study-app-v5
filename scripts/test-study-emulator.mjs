import { spawn } from "node:child_process";
import { existsSync, openSync, closeSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = join(homedir(), ".cache", "firebase", "emulators");
const jars = existsSync(cache) ? readdirSync(cache).filter((name) => /^cloud-firestore-emulator-v.*\.jar$/.test(name)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })) : [];
const jar = process.env.FIRESTORE_EMULATOR_JAR || (jars[0] && join(cache, jars[0]));
if (!jar || !existsSync(jar)) throw new Error("Firestore emulator JARがありません。Firebase CLIで取得するか、FIRESTORE_EMULATOR_JARで既存JARを指定してください。");
const port = 8085;
const isListening = () => new Promise((resolve) => {
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.setTimeout(500);
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
  socket.once("timeout", () => { socket.destroy(); resolve(false); });
});
if (await isListening()) throw new Error(`localhost:${port}は使用中です。既存サービスは停止しません。`);
const logPath = join(tmpdir(), `study-v182-emulator-${Date.now()}.log`);
const log = openSync(logPath, "w");
const emulator = spawn("java", ["-jar", jar, "--host", "127.0.0.1", "--port", String(port), "--project_id", "demo-study-v182", "--single_project_mode", "true"], { cwd: root, windowsHide: true, stdio: ["ignore", log, log] });
let startupError;
emulator.on("error", (error) => { startupError = error; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startupError) throw startupError;
    if (emulator.exitCode !== null) throw new Error(`Emulator起動失敗。ログ: ${logPath}`);
    if (await isListening()) { ready = true; break; }
    await delay(250);
  }
  if (!ready) throw new Error(`Emulator起動タイムアウト。ログ: ${logPath}`);
  console.log("Firestore emulator: demo-study-v182 @ 127.0.0.1:8085（本番接続なし）");
  const test = spawn(process.execPath, [join(root, "node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.emulator.config.ts"], {
    cwd: root, windowsHide: true, stdio: "inherit", env: { ...process.env, FIRESTORE_EMULATOR_HOST: `127.0.0.1:${port}` },
  });
  process.exitCode = await new Promise((resolve, reject) => { test.once("error", reject); test.once("exit", (code) => resolve(code ?? 1)); });
  if (process.exitCode) console.error(`Emulatorログ: ${logPath}`);
} finally {
  emulator.kill();
  closeSync(log);
}
