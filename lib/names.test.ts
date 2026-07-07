import { describe, expect, test } from "bun:test";
import { NAMES, pickName } from "./names";

describe("pickName", () => {
  test("picks from the list", () => {
    const name = pickName(new Set());
    expect(NAMES).toContain(name);
  });

  test("skips taken names", () => {
    const taken = new Set(NAMES.slice(0, NAMES.length - 1));
    expect(pickName(taken)).toBe(NAMES[NAMES.length - 1]!);
  });

  test("falls back to numeric suffixes when every name is taken", () => {
    const taken = new Set<string>(NAMES);
    const name = pickName(taken, () => 0);
    expect(name).toBe(`${NAMES[0]}-2`);

    taken.add(name);
    expect(pickName(taken, () => 0)).toBe(`${NAMES[0]}-3`);
  });

  test("is deterministic given a seeded random", () => {
    expect(pickName(new Set(), () => 0)).toBe(NAMES[0]!);
    expect(pickName(new Set(), () => 0.999)).toBe(NAMES[NAMES.length - 1]!);
  });
});
