import { describe, it, expect } from "vitest";
import { isHubVisibleFor, type HubVisibilityInputs } from "./default-hubs-for-roles";

const base: HubVisibilityInputs = { overrides: {}, roles: [], moduleHubs: {} };

describe("isHubVisibleFor", () => {
  it("explicit Hide override blocks a hub the role would otherwise grant", () => {
    // admin's role default includes ops, but an explicit hide wins.
    expect(isHubVisibleFor("ops", { ...base, roles: ["admin"], overrides: { ops: false } })).toBe(
      false,
    );
  });

  it("explicit Show override grants a hub the role would not", () => {
    // employee has no growth default; a show override grants it.
    expect(
      isHubVisibleFor("growth", { ...base, roles: ["employee"], overrides: { growth: true } }),
    ).toBe(true);
  });

  it("inherits from role defaults when there is no override", () => {
    expect(isHubVisibleFor("ops", { ...base, roles: ["employee"] })).toBe(true);
    expect(isHubVisibleFor("growth", { ...base, roles: ["employee"] })).toBe(false);
  });

  it("global master switch hides an inherited hub", () => {
    expect(
      isHubVisibleFor("ops", { ...base, roles: ["employee"], moduleHubs: { ops: false } }),
    ).toBe(false);
  });

  it("explicit Show override beats the global master switch", () => {
    expect(
      isHubVisibleFor("ops", {
        ...base,
        roles: ["employee"],
        moduleHubs: { ops: false },
        overrides: { ops: true },
      }),
    ).toBe(true);
  });

  it("non-gated hubs (admin/portal/general) are always visible", () => {
    expect(isHubVisibleFor("admin", base)).toBe(true);
    expect(isHubVisibleFor("portal", base)).toBe(true);
    expect(isHubVisibleFor("general", base)).toBe(true);
  });

  it("a user with no matching role default is blocked from gated hubs", () => {
    expect(isHubVisibleFor("hr", base)).toBe(false);
  });

  it("hr_manager always keeps the HR hub — a Hide override cannot remove it", () => {
    expect(
      isHubVisibleFor("hr", { ...base, roles: ["hr_manager"], overrides: { hr: false } }),
    ).toBe(true);
    // Even the global master switch cannot hide HR from an HR Manager.
    expect(
      isHubVisibleFor("hr", { ...base, roles: ["hr_manager"], moduleHubs: { hr: false } }),
    ).toBe(true);
  });

  it("the hr_manager rule is targeted — it does not protect other hubs", () => {
    // A Hide override on a *different* hub (not hr) still applies normally.
    expect(
      isHubVisibleFor("organizer", {
        ...base,
        roles: ["hr_manager"],
        overrides: { organizer: false },
      }),
    ).toBe(false);
  });
});
