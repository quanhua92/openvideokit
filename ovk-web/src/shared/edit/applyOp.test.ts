import { describe, expect, it } from "vitest";

import type { ProjectBundle } from "@/shared/api/client";
import { fixtureBundle } from "@/shared/api/msw/fixtures";
import { applyOp, makeBlankSlide } from "./applyOp";
import {
	addSlide,
	duplicateSlide,
	removeSlide,
	reorderSlides,
	setField,
} from "./ops";

const project: ProjectBundle = JSON.parse(JSON.stringify(fixtureBundle));

describe("applyOp: setField", () => {
	it("writes a field value into the active slide", () => {
		const next = applyOp(project, setField("slide-0", "title", "Hello"));
		expect(next.slides["slide-0"].fields.title).toBe("Hello");
	});

	it("returns the same project when the slide id is unknown", () => {
		const next = applyOp(project, setField("nope", "title", "x"));
		expect(next).toBe(project);
	});

	it("does NOT mutate the original project (immutability)", () => {
		const before = project.slides["slide-0"].fields.title;
		applyOp(project, setField("slide-0", "title", "changed"));
		expect(project.slides["slide-0"].fields.title).toBe(before);
	});
});

describe("applyOp: reorderSlides", () => {
	it("reorders the root slides array", () => {
		const next = applyOp(
			project,
			reorderSlides(["slide-2", "slide-0", "slide-1"]),
		);
		expect(next.root.slides).toEqual(["slide-2", "slide-0", "slide-1"]);
	});

	it("rejects an order that adds or removes ids", () => {
		const next = applyOp(project, reorderSlides(["slide-0", "slide-1"]));
		// Same project reference → rejected.
		expect(next).toBe(project);
	});
});

describe("applyOp: addSlide", () => {
	it("inserts a new blank slide at the end when no afterId", () => {
		const next = applyOp(project, addSlide("slide-new", "default"));
		expect(next.root.slides).toEqual([
			"slide-0",
			"slide-1",
			"slide-2",
			"slide-new",
		]);
		expect(next.slides["slide-new"]).toEqual(makeBlankSlide("slide-new"));
	});

	it("inserts after the given afterId", () => {
		const next = applyOp(project, addSlide("slide-new", "default", "slide-0"));
		expect(next.root.slides).toEqual([
			"slide-0",
			"slide-new",
			"slide-1",
			"slide-2",
		]);
	});

	it("rejects id collisions", () => {
		const next = applyOp(project, addSlide("slide-0", "default"));
		expect(next).toBe(project);
	});
});

describe("applyOp: duplicateSlide", () => {
	it("inserts a copy of the source slide with a new id", () => {
		const next = applyOp(project, duplicateSlide("slide-0", "slide-copy"));
		expect(next.root.slides).toEqual([
			"slide-0",
			"slide-copy",
			"slide-1",
			"slide-2",
		]);
		expect(next.slides["slide-copy"]).toEqual({
			...project.slides["slide-0"],
			id: "slide-copy",
		});
	});
});

describe("applyOp: removeSlide", () => {
	it("removes the slide from both root.slides and the slides map", () => {
		const next = applyOp(project, removeSlide("slide-1"));
		expect(next.root.slides).toEqual(["slide-0", "slide-2"]);
		expect(next.slides["slide-1"]).toBeUndefined();
	});

	it("no-op when the id is unknown", () => {
		const next = applyOp(project, removeSlide("nope"));
		expect(next).toBe(project);
	});
});
