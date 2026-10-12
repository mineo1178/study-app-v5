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
      if (!id.replace(/\\/g, "/").endsWith("/src/App.tsx")) return;
      const config = /const firebaseConfig = \{[\s\S]*?\n\};/;
      const family = 'const FAMILY_ID = "oomine-study-2026";';
      const firestore = "db = getFirestore(app);";
      if (!config.test(source) || !source.includes(family) || !source.includes(firestore)) throw new Error("App emulator injection no longer matches; refusing to serve");
      const value = { apiKey: "emulator-only", authDomain: "demo-study-hotfix.firebaseapp.com", projectId: "demo-study-hotfix", appId: "1:000000000000:web:hotfix" };
      return 'import { connectAuthEmulator } from "firebase/auth";\nimport { connectFirestoreEmulator } from "firebase/firestore";\n' + source
        .replace(config, `const firebaseConfig = ${JSON.stringify(value)};`)
        .replace(family, 'const FAMILY_ID = "hotfix-study-family";')
        .replace(firestore, firestore + '\n    connectAuthEmulator(auth, "http://127.0.0.1:9098", { disableWarnings: true });\n    connectFirestoreEmulator(db, "127.0.0.1", 8086);');
    },
  }, react(), tailwindcss()],
});
