import { describe, expect, it } from "vitest";
import { parseChecklistInput } from "@/lib/format/parse-checklist-input";

describe("parseChecklistInput", () => {
  it("returns empty result for blank input", () => {
    const r = parseChecklistInput("");
    expect(r.valid).toEqual([]);
    expect(r.skippedEmpty).toBe(1); // single empty line
    expect(r.skippedShort).toBe(0);
  });

  it("strips bullets, numbers and checkbox prefixes", () => {
    const r = parseChecklistInput(
      [
        "- Need K-1 from partner X",
        "* Confirm depreciation",
        "• Where is 1099-DIV?",
        "1. First item",
        "2) Second item",
        "[ ] todo item",
        "[x] done item",
      ].join("\n"),
    );
    expect(r.valid).toEqual([
      "Need K-1 from partner X",
      "Confirm depreciation",
      "Where is 1099-DIV?",
      "First item",
      "Second item",
      "todo item",
      "done item",
    ]);
    expect(r.skippedEmpty).toBe(0);
    expect(r.skippedShort).toBe(0);
  });

  it("skips empty lines and counts them", () => {
    const r = parseChecklistInput("Line one\n\n  \nLine two\n");
    expect(r.valid).toEqual(["Line one", "Line two"]);
    expect(r.skippedEmpty).toBe(3);
  });

  it("drops lines shorter than minLength after cleaning", () => {
    const r = parseChecklistInput("- ok\n- a\n- valid line");
    expect(r.valid).toEqual(["valid line"]);
    expect(r.skippedShort).toBe(2);
  });

  it("returns only skipped counts when nothing valid remains", () => {
    const r = parseChecklistInput("\n  \n[ ] a\n- b");
    expect(r.valid).toEqual([]);
    expect(r.skippedEmpty).toBeGreaterThan(0);
    expect(r.skippedShort).toBe(2);
  });
});
