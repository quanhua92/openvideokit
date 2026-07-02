/**
 * StudioMobile — CapCut-style layout.
 *
 *   ┌──────────────────────┐
 *   │       Stage       ⌃  │  ← ~45vh, collapse button top-right
 *   ├──────────────────────┤
 *   │      Transport       │  ← h-10
 *   ├──────────────────────┤
 *   │      (active panel)  │  ← flex-1 — gets the stage's space when hidden
 *   ├──────────────────────┤
 *   │  ✨ ◧ 💬 ⌨ 🖼 ⏻     │  ← h-14 toolbar
 *   └──────────────────────┘
 *
 * Tap the chevron on the stage to collapse it; the panel below expands to
 * fill the freed space. Tap "Show stage" to bring it back.
 */

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import * as ResizablePrimitive from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import { AIDock } from "@/features/ai/AIDock";
import { AssetLibrary } from "@/features/assets/components/AssetLibrary";
import { CaptionControls } from "@/features/captions/components/CaptionControls";
import { CaptionTextEditor } from "@/features/captions/components/CaptionTextEditor";
import { HtmlEditor } from "@/features/html-editor/HtmlEditor";
import { ProjectPanel } from "@/features/project/ProjectPanel";
import { PropertiesPanel } from "@/features/properties/PropertiesPanel";
import { StageCanvas } from "@/features/stage/StageCanvas";
import { TimelinePanel } from "@/features/timeline/TimelinePanel";
import { EmptySlot } from "./EmptySlot";
import { MobileToolbar } from "./MobileToolbar";
import { getPanel, type PanelId } from "./panels";
import type { StudioData } from "./Studio";
import { TransportBar } from "./TransportBar";

export function StudioMobile({ data }: { data: StudioData }) {
  const [active, setActive] = useState<PanelId>("ai");
  const [stageHidden, setStageHidden] = useState(false);
  const { projectId, project, active: activeSlide } = data;

  return (
    <div className="flex h-full flex-col">
      <ResizablePrimitive.Group
        orientation="vertical"
        id="ovk-mobile"
        className="flex flex-1 min-h-0 h-full w-full flex-col"
      >
        {!stageHidden && (
          <>
            <ResizablePanel id="stage" defaultSize={35} minSize={20}>
              <div className="relative h-full w-full bg-black">
                <StageCanvas
                  projectId={projectId}
                  slide={activeSlide.slide}
                  activeStart={activeSlide.start}
                  captionStyle={project.root.theme.caption_style}
                />
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-2 size-7 opacity-90"
                  onClick={() => setStageHidden(true)}
                  aria-label="Hide stage"
                >
                  <ChevronUp className="size-3.5" />
                </Button>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel id="panels" defaultSize={65} minSize={30}>
          <div className="flex h-full flex-col">
            {stageHidden && (
              <button
                type="button"
                onClick={() => setStageHidden(false)}
                className="flex h-8 shrink-0 items-center justify-center gap-1.5 border-b border-border bg-muted/40 text-xs text-muted-foreground hover:bg-muted"
                aria-label="Show stage"
              >
                <ChevronDown className="size-3" />
                Show stage
              </button>
            )}
            <TransportBar />

            <div className="flex-1 overflow-hidden border-t border-border">
              {active === "props" && (
                <PropertiesPanel
                  slide={activeSlide.slide}
                  slideId={activeSlide.slideId}
                />
              )}
              {active === "timeline" && <TimelinePanel project={project} />}
              {active === "html" && activeSlide.slideId && (
                <HtmlEditor
                  key={activeSlide.slideId}
                  slideId={activeSlide.slideId}
                  prior={project.slideHtml[activeSlide.slideId] ?? ""}
                />
              )}
              {active === "html" && !activeSlide.slideId && (
                <EmptySlot panel={getPanel("html")} />
              )}
              {active === "assets" && activeSlide.slideId ? (
                <div className="h-full">
                  <AssetLibrary slideId={activeSlide.slideId} />
                </div>
              ) : active === "assets" ? (
                <EmptySlot panel={getPanel("assets")} />
              ) : null}
              {active === "captions" && activeSlide.slide && (
                <div className="h-full overflow-y-auto">
                  <div className="space-y-4 p-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Captions
                    </h2>
                    {activeSlide.slideId && (
                      <CaptionTextEditor
                        slide={activeSlide.slide}
                        slideId={activeSlide.slideId}
                      />
                    )}
                    <CaptionControls />
                  </div>
                </div>
              )}
              <div
                className={
                  active === "ai" ? "h-full" : "hidden h-0 overflow-hidden"
                }
              >
                <AIDock
                  projectId={projectId}
                  slideId={activeSlide.slideId}
                  slideIds={project.root.slides}
                  slides={project.slides}
                />
              </div>
              {active === "project" && <ProjectPanel project={project} />}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePrimitive.Group>

      <MobileToolbar active={active} onChange={setActive} />
    </div>
  );
}
