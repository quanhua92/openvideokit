/**
 * 3-way field-level merge — re-applies the user's local edits (delta from
 * `base` → `local`) onto `server`.  When both sides edit the same field,
 * the local (user) version wins.
 *
 * Used by useProjectSync when a PUT returns 409 (optimistic-locking
 * conflict).  Prevents data loss: the user's unsaved edits are rebased
 * onto the server's version instead of being discarded.
 */
import type { ProjectBundle } from "@/shared/api/client";

function clone<T>(obj: T): T {
  return typeof structuredClone === "function"
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

export function reapplyLocalEdits(
  base: ProjectBundle,
  local: ProjectBundle,
  server: ProjectBundle,
): ProjectBundle {
  const merged: ProjectBundle = {
    rev: server.rev,
    root: clone(server.root),
    slides: clone(server.slides),
    slideHtml: clone(server.slideHtml),
  };

  // Root-level changes
  if (JSON.stringify(local.root.slides) !== JSON.stringify(base.root.slides))
    merged.root.slides = [...local.root.slides];
  if (JSON.stringify(local.root.theme) !== JSON.stringify(base.root.theme))
    merged.root.theme = clone(local.root.theme);
  if (JSON.stringify(local.root.audio) !== JSON.stringify(base.root.audio))
    merged.root.audio = clone(local.root.audio);
  if (
    JSON.stringify(local.root.transition_default) !==
    JSON.stringify(base.root.transition_default)
  )
    merged.root.transition_default = { ...local.root.transition_default };

  // Per-slide field changes
  for (const [id, localSlide] of Object.entries(local.slides)) {
    const baseSlide = base.slides[id];
    const serverSlide = merged.slides[id];

    // New slide added by user
    if (!baseSlide) {
      merged.slides[id] = clone(localSlide);
      continue;
    }
    // Slide removed by server — skip
    if (!serverSlide) continue;

    for (const [k, v] of Object.entries(localSlide.fields)) {
      if (baseSlide.fields[k] !== v) serverSlide.fields[k] = v;
    }
    if (localSlide.duration !== baseSlide.duration)
      serverSlide.duration = localSlide.duration;
    if (
      JSON.stringify(localSlide.voiceover) !==
      JSON.stringify(baseSlide.voiceover)
    )
      serverSlide.voiceover = { ...localSlide.voiceover };
    if (JSON.stringify(localSlide.assets) !== JSON.stringify(baseSlide.assets))
      serverSlide.assets = { ...localSlide.assets };
    const lt = localSlide.transition ?? null;
    const bt = baseSlide.transition ?? null;
    if (JSON.stringify(lt) !== JSON.stringify(bt))
      serverSlide.transition = clone(localSlide.transition);
  }

  // HTML changes
  for (const [id, html] of Object.entries(local.slideHtml)) {
    if (base.slideHtml[id] !== html) merged.slideHtml[id] = html;
  }

  // Removed slides
  for (const id of Object.keys(base.slides)) {
    if (!(id in local.slides)) {
      delete merged.slides[id];
      delete merged.slideHtml[id];
      merged.root.slides = merged.root.slides.filter((s) => s !== id);
    }
  }

  return merged;
}
