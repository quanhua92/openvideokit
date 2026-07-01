import { useState } from "react";
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable";
import * as ResizablePrimitive from "react-resizable-panels";
import { AIDock } from "@/features/ai/AIDock";
import { AssetLibrary } from "@/features/assets/components/AssetLibrary";
import { CaptionControls } from "@/features/captions/components/CaptionControls";
import { CaptionTextEditor } from "@/features/captions/components/CaptionTextEditor";
import { HtmlEditor } from "@/features/html-editor/HtmlEditor";
import { PropertiesPanel } from "@/features/properties/PropertiesPanel";
import { ProjectPanel } from "@/features/project/ProjectPanel";
import { StageCanvas } from "@/features/stage/StageCanvas";
import { TimelinePanel } from "@/features/timeline/TimelinePanel";
import { EmptySlot } from "./EmptySlot";
import { MobileToolbar } from "./MobileToolbar";
import { getPanel, type PanelId } from "./panels";
import type { StudioData } from "./Studio";
import { TransportBar } from "./TransportBar";

export function StudioDesktop({ data }: { data: StudioData }) {
  const [activeTab, setActiveTab] = useState<PanelId>("ai");
  const { project, active: activeSlide, totalDuration } = data;

  return (
    <div className="flex h-full flex-col">
      <ResizablePrimitive.Group
        orientation="horizontal"
        id="ovk-desktop"
        className="flex flex-1 min-h-0 h-full w-full"
      >
        {/* Left: Stage */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="flex h-full items-center justify-center bg-black">
            <StageCanvas
              slide={activeSlide.slide}
              localTime={activeSlide.localTime}
              activeStart={activeSlide.start}
              captionStyle={project.root.theme.caption_style}
              slideHtml={
                activeSlide.slideId
                  ? project.slideHtml[activeSlide.slideId]
                  : undefined
              }
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Controls */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="flex h-full flex-col bg-background">
            <div className="flex-1 overflow-hidden">
              {activeTab === "props" && (
                <PropertiesPanel
                  slide={activeSlide.slide}
                  slideId={activeSlide.slideId}
                />
              )}
              {activeTab === "timeline" && <TimelinePanel project={project} />}
              {activeTab === "html" && activeSlide.slideId && (
                <HtmlEditor
                  key={activeSlide.slideId}
                  slideId={activeSlide.slideId}
                  prior={project.slideHtml[activeSlide.slideId] ?? ""}
                />
              )}
              {activeTab === "html" && !activeSlide.slideId && (
                <EmptySlot panel={getPanel("html")} />
              )}
              {activeTab === "assets" && activeSlide.slideId ? (
                <div className="h-full">
                  <AssetLibrary slideId={activeSlide.slideId} />
                </div>
              ) : activeTab === "assets" ? (
                <EmptySlot panel={getPanel("assets")} />
              ) : null}
              {activeTab === "captions" && activeSlide.slide && (
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
              {activeTab === "ai" && <AIDock slideId={activeSlide.slideId} />}
              {activeTab === "project" && <ProjectPanel project={project} />}
            </div>

            <TransportBar />
            <MobileToolbar active={activeTab} onChange={setActiveTab} />
          </div>
        </ResizablePanel>
      </ResizablePrimitive.Group>

      {/* Surface total duration for parity with mobile; unused at runtime. */}
      <input type="hidden" value={totalDuration} readOnly />
    </div>
  );
}
