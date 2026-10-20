import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { createInitialGameState, normalizeGameState } from "./config";
import type { ProducerGameState } from "./types";
import type { EncoreReadStatus } from "./encore";

import type { FamilySession } from "../use-family-session";

// One read-only document listener per authenticated scope, independent of replay/navigation.
export function useEncoreGame(session: FamilySession | undefined, familyId: string) {
  const database = session?.database;
  const uid = session?.user.uid;
  const [source, setSource] = useState<{ uid: string; familyId: string; status: EncoreReadStatus; game: ProducerGameState } | null>(null);
  useEffect(() => {
    if (!database || !uid || !session?.active()) return;
    let active = true;
    const unsubscribe = onSnapshot(doc(database, "families", familyId, "game", "idol-produce"), { includeMetadataChanges: true }, snapshot => {
      if (!active || !session.active()) return;
      try {
        setSource({ uid, familyId, status: snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites ? "loading" : "ready",
          game: normalizeGameState(snapshot.data() ?? createInitialGameState()) });
      } catch {
        setSource({ uid, familyId, status: "error", game: createInitialGameState() });
      }
    }, () => {
      if (active && session.active()) setSource({ uid, familyId, status: "error", game: createInitialGameState() });
    });
    return () => { active = false; unsubscribe(); };
  }, [database, familyId, uid, session]);
  return session?.active() && source?.uid === uid && source?.familyId === familyId ? source : null;
}
