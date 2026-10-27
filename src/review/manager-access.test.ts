import { describe, expect, it } from "vitest";
import { assignedReviewChildren } from "./manager-access";
describe("server-managed review assignments", () => {
  const role = { active: true, schemaVersion: 1, childUids: ["child-b", "foreign-child"] };
  it("intersects assigned UIDs with family membership", () => expect(assignedReviewChildren(role, ["parent-a", "child-b", "child-c"], "parent-a")).toEqual(["child-b"]));
  it.each([null, {}, { ...role, active: false }, { ...role, schemaVersion: 2 }, { ...role, childUids: ["../child"] }, { ...role, childUids: ["child-b", "child-b"] }, { ...role, childUids: Array(11).fill("x") }, { ...role, admin: true }, { ...role, active: "true" }])("denies absent/malformed/inactive grants", bad => expect(assignedReviewChildren(bad, ["parent-a", "child-b"], "parent-a")).toEqual([]));
  it("does not accept membership from a role or a caller flag", () => expect(assignedReviewChildren(role, ["child-b"], "parent-a")).toEqual([]));
});
