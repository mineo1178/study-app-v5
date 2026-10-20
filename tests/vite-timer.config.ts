import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Only the local browser regression server transforms the real App to a demo
// project/family. Production vite.config.ts and Firebase settings stay unchanged.
export default defineConfig({
  envDir: "tests",
  cacheDir: ".timer-browser-results.local/vite-cache",
  server: { host: "127.0.0.1", port: 5178, strictPort: true },
  plugins: [{
    name: "timer-emulator-only",
    enforce: "pre",
    transform(source, id) {
      if (process.env.ENCORE_TEST_METRICS === "1" && id.replace(/\\/g, "/").endsWith("/src/game/use-encore-game.ts")) {
        const start = "    const unsubscribe = onSnapshot(";
        const stop = "return () => { active = false; unsubscribe(); };";
        if (!source.includes(start) || !source.includes(stop)) throw new Error("Encore read instrumentation mismatch");
        const instrumented = source.replace(start, '    const metrics = ((globalThis as unknown as { __encoreReads?: { starts: number; active: number } }).__encoreReads ??= { starts: 0, active: 0 });\n    metrics.starts++; metrics.active++;\n' + start)
          .replace(stop, "return () => { metrics.active--; active = false; unsubscribe(); };")
          .replace("{ doc, onSnapshot }", "{ doc, onSnapshot as encoreSdkOnSnapshot }");
        return `function onSnapshot(...args: any[]) {
  (globalThis as any).__encoreFail = () => args[3]({ code: "unavailable" });
  const cb = args[2];
  args[2] = (...values: any[]) => {
    const deliver = () => cb(...values);
    if ((globalThis as any).__encoreHoldEvents) ((globalThis as any).__encoreEvents ??= []).push(deliver);
    else deliver();
  };
  return (encoreSdkOnSnapshot as any)(...args);
}
` + instrumented;
      }
      if (process.env.ENCORE_TEST_METRICS === "1" && id.replace(/\\/g, "/").endsWith("/src/components/game/EncorePanel.tsx")) {
        return source.replace("export function EncorePanel(context: EncoreContext) {", 'export function EncorePanel(context: EncoreContext) {\n  ((globalThis as unknown as { __encoreRenders?: unknown[] }).__encoreRenders ??= []).push({ scope: context.scope, status: context.status });');
      }
      const path = id.replace(/\\/g, "/");
      if (process.env.AUTH_SESSION_TEST === "1" && path.endsWith("/src/use-family-session.ts")) {
        return source.replace('const snapshot = await getDocFromServer(doc(database, "families", family));', 'const snapshot = await getDocFromServer(doc(database, "families", family)); await (globalThis as any).__authDelay?.("membership");');
      }
      if (!path.endsWith("/src/App.tsx")) return;
      if (process.env.AUTH_SESSION_TEST === "1") {
        source = source.replace("  getDocs,", "  getDocs as authSdkGetDocs,").replace("  onSnapshot,", "  onSnapshot as authSdkOnSnapshot,");
        source = `async function getDocs(...args: any[]) { const value = await (authSdkGetDocs as any)(...args); await (globalThis as any).__authDelay?.("read"); return value; }
function onSnapshot(...args: any[]) {
  const t = (globalThis as any).__authMetrics ??= { active: 0, unsubscribed: 0, lateDelivered: 0 };
  t.active++;
  const index = typeof args[1] === "function" ? 1 : 2;
  const cb = args[index];
  args[index] = (...values: any[]) => { const deliver = () => cb(...values); if ((globalThis as any).__authHoldEvents) { ((globalThis as any).__authEvents ??= []).push(() => { t.lateDelivered++; deliver(); }); } else deliver(); };
  const unsubscribe = (authSdkOnSnapshot as any)(...args); let active = true;
  return () => { if (active) { active = false; t.active--; t.unsubscribed++; } unsubscribe(); };
}
` + source;
      }
      const config = /const firebaseConfig = \{[\s\S]*?\n\};/;
      const family = 'const FAMILY_ID = "oomine-study-2026";';
      const firestore = "getFirestore(app);";
      if (!config.test(source) || !source.includes(family) || !source.includes(firestore)) throw new Error("App emulator injection no longer matches; refusing to serve");
      const value = { apiKey: "emulator-only", authDomain: "demo-study-hotfix.firebaseapp.com", projectId: "demo-study-hotfix", appId: "1:000000000000:web:hotfix" };
      return 'import { connectAuthEmulator } from "firebase/auth";\nimport { connectFirestoreEmulator } from "firebase/firestore";\n' + source
        .replace(config, `const firebaseConfig = ${JSON.stringify(value)};`)
        .replace(family, 'const FAMILY_ID = "hotfix-study-family";')
        .replace("useFamilySession(auth, firebaseConfig, FAMILY_ID)", 'useFamilySession(auth, firebaseConfig, FAMILY_ID, AUTH_TEST_EMULATOR)')
        .replace("const FAMILY_ID =", 'const AUTH_TEST_EMULATOR = { host: "127.0.0.1", port: 8086 };\nconst FAMILY_ID =')
        .replace(firestore, firestore + '\n    connectAuthEmulator(auth, "http://127.0.0.1:9098", { disableWarnings: true });\n    connectFirestoreEmulator(getFirestore(app), "127.0.0.1", 8086);');
    },
  }, react(), tailwindcss()],
});
