import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { deleteApp, initializeApp, type FirebaseOptions } from "firebase/app";
import { beforeAuthStateChanged, connectAuthEmulator, getAuth, inMemoryPersistence, onAuthStateChanged, setPersistence, signOut, updateCurrentUser, type Auth, type User } from "firebase/auth";
import { connectFirestoreEmulator, doc, getDocFromServer, getFirestore, terminate, type Firestore } from "firebase/firestore";

export type FamilySession = { user: User; database: Firestore; generation: number; active: () => boolean };
type State = { status: "checking" | "signed-out" | "denied" | "error" | "allowed"; session?: FamilySession };
let serial = 0;

// Each data client keeps its own immutable Auth principal. An old transaction or
// offline write can never acquire the next user's credentials.
export function useFamilySession(auth: Auth | null, config: FirebaseOptions, family: string, emulator?: { host: string; port: number }) {
  const [state, setState] = useState<State>({ status: auth ? "checking" : "signed-out" });
  const generation = useRef(0);
  const close = useRef<() => Promise<void>>(async () => {});
  const recheck = useRef<() => void>(() => {});
  useEffect(() => {
    if (!auth) return;
    let mounted = true;
    const epoch = generation;
    const invalidate = () => {
      epoch.current++;
      // Before Auth publishes a new principal, remove every protected subtree,
      // including modal timers, calculation listeners, and diagnostics.
      flushSync(() => { if (mounted) setState({ status: "checking" }); });
      return close.current();
    };
    const authorize = async (user: User | null) => {
      const id = ++epoch.current;
      setState({ status: user ? "checking" : "signed-out" });
      if (!user) return;
      const sessionApp = initializeApp(config, "protected-session-" + ++serial);
      const sessionAuth = getAuth(sessionApp);
      if (auth.emulatorConfig) {
        const e = auth.emulatorConfig;
        connectAuthEmulator(sessionAuth, e.protocol + "://" + e.host + ":" + e.port, { disableWarnings: true });
      }
      const database = getFirestore(sessionApp);
      if (emulator) connectFirestoreEmulator(database, emulator.host, emulator.port);
      let valid = true;
      let closing: Promise<void> | undefined;
      const dispose = () => {
        valid = false;
        return closing ??= terminate(database).then(() => deleteApp(sessionApp));
      };
      close.current = dispose;
      const active = () => valid && mounted && epoch.current === id && auth.currentUser?.uid === user.uid;
      try {
        await setPersistence(sessionAuth, inMemoryPersistence);
        if (!active()) { await dispose(); return; }
        await updateCurrentUser(sessionAuth, user);
        if (!active()) { await dispose(); return; }
        // Server verification is required even if an old family document is cached.
        const snapshot = await getDocFromServer(doc(database, "families", family));
        if (!active()) { await dispose(); return; }
        const members = snapshot.data()?.memberUids;
        if (!snapshot.exists() || !Array.isArray(members) || !members.includes(user.uid)) {
          await dispose();
          if (mounted && epoch.current === id) setState({ status: "denied" });
          return;
        }
        setState({ status: "allowed", session: { user, database, generation: id, active } });
      } catch (error) {
        const current = active();
        await dispose();
        if (current && mounted && epoch.current === id && auth.currentUser?.uid === user.uid) setState({ status: (error as { code?: string }).code === "permission-denied" ? "denied" : "error" });
      }
    };
    recheck.current = () => { void invalidate().then(() => authorize(auth.currentUser)); };
    const before = beforeAuthStateChanged(auth, next => {
      if (next?.uid === auth.currentUser?.uid) return;
      return invalidate();
    }, () => { void invalidate().then(() => authorize(auth.currentUser)); });
    const unsubscribe = onAuthStateChanged(auth, user => {
      // Persistence updates from another tab can skip beforeAuthStateChanged.
      // Close the UI synchronously here as well, before any other Auth observer.
      const closing = invalidate();
      const id = epoch.current;
      void closing.then(() => {
        if (mounted && epoch.current === id && auth.currentUser?.uid === user?.uid) return authorize(user);
      });
    });
    return () => {
      mounted = false;
      epoch.current++;
      before(); unsubscribe();
      void close.current();
    };
  }, [auth, config, family, emulator]);
  return { ...state, retry: () => recheck.current(), logout: async () => {
    if (!auth) return;
    generation.current++;
    flushSync(() => setState({ status: "checking" }));
    await close.current();
    try { await signOut(auth); } catch (error) { recheck.current(); throw error; }
  } };
}
