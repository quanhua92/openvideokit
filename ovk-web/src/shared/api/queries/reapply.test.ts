import { describe, expect, it } from "vitest";

import type { ProjectBundle } from "@/shared/api/client";
import { fixtureBundle } from "@/shared/api/fixtures";
import { reapplyLocalEdits } from "./reapply";

function clone(b: ProjectBundle): ProjectBundle {
  return JSON.parse(JSON.stringify(b));
}

describe("reapplyLocalEdits", () => {
  it("preserves a user field edit when the server changed a different field", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.slides["slide-0"].fields.title = "My Long Paragraph";

    const server = clone(base);
    server.slides["slide-0"].fields.body = "Server changed body";
    server.rev = "server-rev";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slides["slide-0"].fields.title).toBe("My Long Paragraph");
    expect(merged.slides["slide-0"].fields.body).toBe("Server changed body");
  });

  it("user wins when both edited the same field", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.slides["slide-0"].fields.title = "USER VERSION";

    const server = clone(base);
    server.slides["slide-0"].fields.title = "SERVER VERSION";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slides["slide-0"].fields.title).toBe("USER VERSION");
  });

  it("preserves a user edit on slide A when server edited slide B", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.slides["slide-0"].fields.title = "Edited A";

    const server = clone(base);
    server.slides["slide-1"].fields.title = "Edited B";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slides["slide-0"].fields.title).toBe("Edited A");
    expect(merged.slides["slide-1"].fields.title).toBe("Edited B");
  });

  it("preserves a user HTML edit while server changed a field", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.slideHtml["slide-0"] = "<template>USER HTML</template>";

    const server = clone(base);
    server.slides["slide-0"].fields.title = "Server title";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slideHtml["slide-0"]).toBe("<template>USER HTML</template>");
    expect(merged.slides["slide-0"].fields.title).toBe("Server title");
  });

  it("preserves a user duration change while server changed a different slide", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.slides["slide-0"].duration = 99;

    const server = clone(base);
    server.slides["slide-2"].fields.title = "Server changed slide 2";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slides["slide-0"].duration).toBe(99);
    expect(merged.slides["slide-2"].fields.title).toBe(
      "Server changed slide 2",
    );
  });

  it("preserves a user voiceover change", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.slides["slide-1"].voiceover.text = "New narration";

    const server = clone(base);
    server.slides["slide-1"].fields.title = "Server title";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slides["slide-1"].voiceover.text).toBe("New narration");
    expect(merged.slides["slide-1"].fields.title).toBe("Server title");
  });

  it("preserves user-added slide", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.slides["slide-new"] = {
      id: "slide-new",
      duration: 5,
      fields: { title: "New", body: "New body" },
      assets: {},
      voiceover: { text: "", voice: "en-US-AriaNeural" },
    };
    local.slideHtml["slide-new"] = "<template>NEW</template>";
    local.root.slides = ["slide-0", "slide-1", "slide-2", "slide-new"];

    const server = clone(base);
    server.slides["slide-0"].fields.title = "Server changed";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slides["slide-new"]).toBeDefined();
    expect(merged.slides["slide-new"].fields.title).toBe("New");
    expect(merged.slideHtml["slide-new"]).toBe("<template>NEW</template>");
    expect(merged.slides["slide-0"].fields.title).toBe("Server changed");
  });

  it("preserves user-removed slide", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    delete local.slides["slide-2"];
    delete local.slideHtml["slide-2"];
    local.root.slides = ["slide-0", "slide-1"];

    const server = clone(base);
    server.slides["slide-0"].fields.title = "Server changed";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slides["slide-2"]).toBeUndefined();
    expect(merged.slideHtml["slide-2"]).toBeUndefined();
    expect(merged.root.slides).not.toContain("slide-2");
    expect(merged.slides["slide-0"].fields.title).toBe("Server changed");
  });

  it("preserves user slide reorder", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.root.slides = ["slide-2", "slide-0", "slide-1"];

    const server = clone(base);
    server.slides["slide-0"].fields.title = "Server changed";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.root.slides).toEqual(["slide-2", "slide-0", "slide-1"]);
    expect(merged.slides["slide-0"].fields.title).toBe("Server changed");
  });

  it("returns server data unchanged when user made no edits", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    const server = clone(base);
    server.slides["slide-0"].fields.title = "Server only";
    server.rev = "server-rev";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.slides["slide-0"].fields.title).toBe("Server only");
    expect(merged.rev).toBe("server-rev");
  });

  it("uses server rev on the merged result", () => {
    const base = clone(fixtureBundle);
    const local = clone(base);
    local.slides["slide-0"].fields.title = "User edit";

    const server = clone(base);
    server.rev = "new-server-rev-1234";

    const merged = reapplyLocalEdits(base, local, server);

    expect(merged.rev).toBe("new-server-rev-1234");
    expect(merged.slides["slide-0"].fields.title).toBe("User edit");
  });
});
