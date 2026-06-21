import { describe, expect, it } from "vitest";
import {
  defaultSkipEntityForProjectType,
  validateTaskEntityRequirement,
  formatEntityDisplayName,
  isHiddenDefaultEntity,
  HIDDEN_DEFAULT_ENTITY_NAME,
} from "@/lib/shared/domain";

describe("defaultSkipEntityForProjectType", () => {
  it("flattens Project → Task for Tax Preparation", () => {
    expect(defaultSkipEntityForProjectType("tax_preparation")).toBe(true);
  });

  it("keeps Project → Entity → Task hierarchy for non-tax project types", () => {
    expect(defaultSkipEntityForProjectType("accounting")).toBe(false);
    expect(defaultSkipEntityForProjectType("auditing")).toBe(false);
    expect(defaultSkipEntityForProjectType("sales_tax")).toBe(false);
    expect(defaultSkipEntityForProjectType("company_formation")).toBe(false);
    expect(defaultSkipEntityForProjectType("payroll_processing")).toBe(false);
    expect(defaultSkipEntityForProjectType("other")).toBe(false);
  });
});

describe("validateTaskEntityRequirement", () => {
  it("requires an entity_id when skipEntity is false", () => {
    expect(validateTaskEntityRequirement({ skipEntity: false })).toEqual({
      ok: false,
      reason: "entity_required",
    });
    expect(validateTaskEntityRequirement({ skipEntity: false, entityId: "" })).toEqual({
      ok: false,
      reason: "entity_required",
    });
    expect(validateTaskEntityRequirement({ skipEntity: false, entityId: "none" })).toEqual({
      ok: false,
      reason: "entity_required",
    });
    expect(validateTaskEntityRequirement({ skipEntity: false, entityId: null })).toEqual({
      ok: false,
      reason: "entity_required",
    });
  });

  it("accepts a real entity_id when skipEntity is false", () => {
    expect(
      validateTaskEntityRequirement({
        skipEntity: false,
        entityId: "11111111-1111-1111-1111-111111111111",
      }),
    ).toEqual({ ok: true });
  });

  it("never blocks the submit when skipEntity is true", () => {
    expect(validateTaskEntityRequirement({ skipEntity: true })).toEqual({ ok: true });
    expect(validateTaskEntityRequirement({ skipEntity: true, entityId: "none" })).toEqual({
      ok: true,
    });
    expect(validateTaskEntityRequirement({ skipEntity: true, entityId: "abc" })).toEqual({
      ok: true,
    });
  });
});

describe("HIDDEN_DEFAULT_ENTITY_NAME", () => {
  it("matches the DB sentinel used by ensure_project_default_entity", () => {
    expect(HIDDEN_DEFAULT_ENTITY_NAME).toBe("__project_default");
  });
});

describe("formatEntityDisplayName", () => {
  it("replaces the hidden sentinel with 'Project tasks'", () => {
    expect(formatEntityDisplayName(HIDDEN_DEFAULT_ENTITY_NAME)).toBe("Project tasks");
  });
  it("passes through normal names", () => {
    expect(formatEntityDisplayName("Viral Patel")).toBe("Viral Patel");
  });
  it("returns '—' for null/undefined/empty", () => {
    expect(formatEntityDisplayName(null)).toBe("—");
    expect(formatEntityDisplayName(undefined)).toBe("—");
    expect(formatEntityDisplayName("")).toBe("—");
  });
});

describe("isHiddenDefaultEntity", () => {
  it("true only for the sentinel", () => {
    expect(isHiddenDefaultEntity(HIDDEN_DEFAULT_ENTITY_NAME)).toBe(true);
    expect(isHiddenDefaultEntity("Viral Patel")).toBe(false);
    expect(isHiddenDefaultEntity(null)).toBe(false);
  });
});
