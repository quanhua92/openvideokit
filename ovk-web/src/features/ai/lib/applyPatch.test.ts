import { describe, expect, it } from "vitest";

import { translatePatch } from "./applyPatch";

describe("translatePatch", () => {
  it("translates /fields/title replace → setField", () => {
    const r = translatePatch("slide-0", [
      { op: "replace", path: "/fields/title", value: "Hello" },
    ]);
    expect(r.ops).toEqual([
      {
        kind: "setField",
        slideId: "slide-0",
        fieldId: "title",
        value: "Hello",
      },
    ]);
    expect(r.unsupported).toEqual([]);
  });

  it("translates /fields/body replace → setField", () => {
    const r = translatePatch("slide-1", [
      { op: "replace", path: "/fields/body", value: "New body" },
    ]);
    expect(r.ops[0]).toEqual({
      kind: "setField",
      slideId: "slide-1",
      fieldId: "body",
      value: "New body",
    });
  });

  it("translates /voiceover/text replace → setVoiceover", () => {
    const r = translatePatch("slide-0", [
      { op: "replace", path: "/voiceover/text", value: "New narration" },
    ]);
    expect(r.ops[0]).toEqual({
      kind: "setVoiceover",
      slideId: "slide-0",
      text: "New narration",
    });
  });

  it("translates /transition remove → setTransition null", () => {
    const r = translatePatch("slide-0", [
      { op: "remove", path: "/transition" },
    ]);
    expect(r.ops[0]).toEqual({
      kind: "setTransition",
      slideId: "slide-0",
      transition: null,
    });
  });

  it("reports unsupported paths", () => {
    const r = translatePatch("slide-0", [
      { op: "replace", path: "/unknown/path", value: "x" },
    ]);
    expect(r.ops).toHaveLength(0);
    expect(r.unsupported).toEqual(["/unknown/path"]);
  });

  it("skips /fields/<id> remove ops", () => {
    const r = translatePatch("slide-0", [
      { op: "remove", path: "/fields/title" },
    ]);
    expect(r.ops).toHaveLength(0);
  });
});
