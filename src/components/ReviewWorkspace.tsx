import type { FamilySession } from "../use-family-session";
import type { RegisteredTest } from "../review/target-plan";
import { TestReview } from "./TestReview";

// Management is performed only by the trusted PC administrator tool.
export function ReviewWorkspace({ session, familyId, sample, enabled, tests }: { session?: FamilySession; familyId: string; sample: boolean; enabled: boolean; tests: RegisteredTest[] }) {
  return <TestReview db={session?.database ?? null} session={session} familyId={familyId} uid={sample ? "sample" : session!.user.uid} sample={sample} enabled={enabled} tests={tests} />;
}
