import type { FamilySession } from "../use-family-session";
import { TestReview } from "./TestReview";

// Management is performed only by the trusted PC administrator tool.
export function ReviewWorkspace({ session, familyId, sample, enabled }: { session?: FamilySession; familyId: string; sample: boolean; enabled: boolean }) {
  return <TestReview db={session?.database ?? null} session={session} familyId={familyId} uid={sample ? "sample" : session!.user.uid} sample={sample} enabled={enabled} />;
}
