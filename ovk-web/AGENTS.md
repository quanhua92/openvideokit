# AGENTS.md — ovk-web

> Guide for AI agents working on the ovk-web SPA (the scene-based video editor frontend).

## What is ovk-web?

A **scene-based, AI-assisted HTML-slide video editor** — a CapCut / Google Vids class tool delivered as a browser SPA. Users edit slides (title, body, background, image, voiceover), see a live preview, and export to MP4. AI can propose edits (Tier-1 JSON patches, Tier-2 HTML swaps) that humans accept or reject.

**Tech stack:** TanStack Router · React 19 · Tailwind v4 · shadcn/ui · Vite 8 · Zustand · TanStack Query · zod · MSW · dnd-kit · CodeMirror 6 · Biome · Vitest · js-sha256 · idb-keyval

## Quick start

```bash
cd ovk-web
pnpm install
pnpm dev          # serve on http://localhost:3000
```

## Commands

| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Build | `pnpm build` |
| Test | `pnpm test` |
| Lint + format | `pnpm check` |
| Lint + fix | `pnpm exec biome check --write` |
| Caption token CI check | `pnpm run check:caption-token` |
| Generate route tree | `pnpm run generate-routes` |

## Project structure

```
ovk-web/
├── src/
│   ├── app/                          # App-level wiring
│   │   ├── router.ts                 # Single createRouter source
│   │   ├── layout/
│   │   │   └── AppShell.tsx          # Top bar + overflow menu + Export dialog
│   │   └── providers/
│   │       ├── QueryProvider.tsx     # TanStack Query client + devtools
│   │       └── RendererProvider.tsx  # SlideRenderer DI (MockRenderer stub)
│   │
│   ├── features/                     # One folder per editor surface
│   │   ├── studio/                   # Responsive layout shell
│   │   │   ├── Studio.tsx            # Desktop/Mobile switch
│   │   │   ├── StudioDesktop.tsx     # 4-zone resizable panel grid + tabs
│   │   │   ├── StudioMobile.tsx      # CapCut layout (stage + toolbar + sheets)
│   │   │   ├── TransportBar.tsx      # Play/pause + scrub slider + time
│   │   │   ├── MobileToolbar.tsx     # 6 tool buttons
│   │   │   ├── panels.ts            # PanelId union + PANELS table
│   │   │   └── EmptySlot.tsx         # Placeholder for unfilled panels
│   │   │
│   │   ├── stage/
│   │   │   ├── StageCanvas.tsx       # 1920×1080 scaled preview + image bg
│   │   │   └── lib/scale.ts          # scaleToFit helper
│   │   │
│   │   ├── timeline/
│   │   │   ├── TimelinePanel.tsx     # Clips + audio lane + dnd-kit reorder
│   │   │   └── lib/cumulativeStarts.ts
│   │   │
│   │   ├── properties/
│   │   │   └── PropertiesPanel.tsx   # Fields + background + assets + voiceover
│   │   │
│   │   ├── captions/
│   │   │   ├── components/
│   │   │   │   ├── CaptionLayer.tsx       # Word spans + rAF + CSS class toggle
│   │   │   │   ├── CaptionControls.tsx    # Preset picker + all style controls
│   │   │   │   ├── CaptionTextEditor.tsx  # Editable voiceover text
│   │   │   │   └── CaptionStylePicker.tsx # Standalone style select (legacy)
│   │   │   ├── lib/
│   │   │   │   ├── timeWordsByCharRatio.ts  # Per-word timing
│   │   │   │   └── lintCaption.ts           # Banned pattern enforcer
│   │   │   └── styles/base.css             # One CSS driven by custom properties
│   │   │
│   │   ├── html-editor/
│   │   │   ├── HtmlEditor.tsx        # CodeMirror + LintGate
│   │   │   ├── CodeMirrorLazy.tsx    # Dynamic import wrapper
│   │   │   └── LintGate.tsx          # R1–R4 result + Accept/Revert
│   │   │
│   │   ├── ai/
│   │   │   ├── AIDock.tsx            # Chat surface with real dispatch
│   │   │   ├── lib/applyPatch.ts     # RFC 6902 → EditBus ops
│   │   │   └── providers/
│   │   │       ├── EchoProvider.ts   # Keyword-routed mock
│   │   │       └── registry.ts       # Echo + OpenAI/Anthropic/Ollama stubs
│   │   │
│   │   ├── assets/
│   │   │   ├── components/
│   │   │   │   ├── AssetDropzone.tsx  # Drag-drop + SHA-256 + dispatch
│   │   │   │   └── AssetLibrary.tsx   # Grid + search + thumbnails
│   │   │   ├── hooks/useAssetUrl.ts   # Load blob from IndexedDB by ref
│   │   │   └── lib/assetStore.ts      # SHA-256 store (idb-keyval + js-sha256)
│   │   │
│   │   ├── voiceover/
│   │   │   ├── hooks/useVoiceover.ts  # Debounced batch TTS pipeline
│   │   │   └── lib/text.ts            # splitSentences, textHash, mockDuration
│   │   │
│   │   └── export/
│   │       ├── components/ExportDialog.tsx  # 6-step progress UI
│   │       └── hooks/useExportJob.ts        # Mock pipeline simulator
│   │
│   ├── shared/                       # Cross-feature primitives
│   │   ├── ai/
│   │   │   ├── types.ts              # AIProvider, EditProposal, AIStreamEvent
│   │   │   └── AIProviderContext.tsx  # Provider DI context
│   │   │
│   │   ├── api/
│   │   │   ├── client.ts             # Typed fetch + zod parse
│   │   │   ├── queries/
│   │   │   │   ├── useProject.ts     # TanStack Query hook
│   │   │   │   └── useActiveSlide.ts # Derive active slide from playhead
│   │   │   ├── schemas/
│   │   │   │   ├── rootIndex.ts      # RFC §5.2 zod schema
│   │   │   │   └── slideIndex.ts     # RFC §5.3 zod schema
│   │   │   └── msw/
│   │   │       ├── fixtures.ts       # 3-slide fixture project
│   │   │       ├── handlers.ts       # GET /projects, /slides
│   │   │       ├── handlers.tts.ts   # POST /api/tts (mock durations)
│   │   │       └── worker.ts         # MSW browser worker (always on)
│   │   │
│   │   ├── edit/
│   │   │   ├── EditBus.ts            # EditOp union + EditEvent type
│   │   │   ├── EditBusProvider.tsx   # dispatch + subscribe + cache mutation
│   │   │   ├── applyOp.ts            # Pure reducer: (project, op) → project
│   │   │   ├── inverseOp.ts          # Pure: (op, before) → inverse op
│   │   │   ├── ops.ts                # Op creator functions
│   │   │   └── useUndoRedo.ts        # ⌘Z / ⌘⇧Z keyboard + past/future stacks
│   │   │
│   │   ├── renderer/
│   │   │   ├── types.ts              # SlideRenderer interface (RFC §9)
│   │   │   └── MockRenderer.ts       # P2 stub (real HF lands later)
│   │   │
│   │   ├── store/
│   │   │   ├── playhead.ts           # Zustand: t, playing, duration
│   │   │   ├── usePlaybackClock.ts   # rAF loop drives playhead forward
│   │   │   ├── history.ts            # Zustand: past/future undo stacks
│   │   │   ├── captionSettings.ts    # Zustand: preset + custom caption settings
│   │   │   └── view-mode.ts          # Zustand: default/desktop/mobile override
│   │   │
│   │   └── lib/
│   │       ├── theme.ts              # Light/dark/system persistence
│   │       ├── useTheme.ts           # React binding for theme
│   │       ├── useMediaQuery.ts      # SSR-safe media query + useIsDesktop
│   │       ├── useStudioLayout.ts    # Combines viewport + view-mode override
│   │       ├── lintHtml.ts           # R1–R4 bare <template> lint
│   │       ├── placeholders.ts       # __FIELD__ stamping (stampSafe)
│   │       └── aHash.ts              # Perceptual hash + Hamming distance
│   │
│   ├── routes/                       # TanStack Router file-based routes
│   │   ├── __root.tsx                # Providers + AppShell + Toaster
│   │   ├── index.tsx                 # / (home)
│   │   ├── settings.tsx              # /settings (theme, view mode, AI provider)
│   │   ├── projects.tsx              # /projects (layout)
│   │   ├── projects.$projectId.tsx   # /projects/:id (layout)
│   │   ├── projects.$projectId.index.tsx    # /projects/:id (dashboard)
│   │   └── projects.$projectId.editor.tsx   # /projects/:id/editor (studio)
│   │
│   ├── components/ui/                # shadcn/ui generated (not hand-rolled)
│   ├── lib/utils.ts                  # cn() helper
│   ├── styles.css                    # Tailwind v4 @theme tokens + caption-active
│   └── main.tsx                      # Entry: enableMocking → RouterProvider
│
├── public/
│   └── mockServiceWorker.js          # MSW service worker
├── scripts/
│   └── check-caption-token.sh        # CI grep: #ffea00 only in captions/**
├── vercel.json                       # SPA rewrite rule
├── biome.json                        # Formatter (tabs, double quotes) + linter
├── components.json                   # shadcn/ui config
├── tsconfig.json                     # Path aliases: @/* and #/* → ./src/*
└── vite.config.ts                    # Vite + tailwind + tanstackRouter + react
```

## Architectural invariants

### 1. EditBus is the single mutation path
Every edit (human keyboard, drag, AI Accept) dispatches through `useEditBus().dispatch(op)`. No component writes to the TanStack Query cache directly. This ensures undo/redo, system pings, and audit logging work uniformly.

### 2. AI is just another client
AI proposals produce the same `EditOp` shapes as human edits. Accept dispatches via the same `editBus.dispatch(op, 'ai:echo')`. No backdoor. Tier-2 HTML proposals pass through `lintHtml()` before Accept is enabled.

### 3. Playhead writes via getState() — never React state
The rAF loop in `usePlaybackClock` writes `playhead.t` via `usePlayhead.getState().seek()`. Components opt into re-renders via `usePlayhead(s => s.t)`. The Properties panel doesn't subscribe → no per-frame re-render.

### 4. MSW always on (no backend yet)
`enableMocking()` runs in all environments unless `VITE_USE_MSW=false`. When the real backend lands, set that env var and swap MSW handlers for real `fetch` calls.

### 5. shadcn/ui is the design system
No hand-rolled Button/Dialog/Tooltip/etc. Add via `pnpm dlx shadcn@latest add <name>`. The `--caption-active` color token is reserved for `features/captions/**` only (CI grep enforced).

## Key conventions

| Convention | Detail |
|---|---|
| **`__FIELD__` stamping** | `stampSafe(html, id, value)` uses function-form `replaceAll` — never the string form (corrupts on `$&`) |
| **Caption rules** | Never use `transform`, `scale()`, `font-size`, or `text-shadow` on `.word--active`. GSAP `className:` tweens banned. `lintCaptionCSS` enforces. |
| **Bare `<template>`** | Slide HTML must be a bare `<template>` — no `<html>`/`<head>`/`<body>` wrapper. `lintHtml` R1–R4 enforces. |
| **Voiceover voice IDs** | Must end in `Neural` (e.g. `en-US-AriaNeural`, `vi-VN-HoaiMyNeural`). zod schema enforces. |
| **SHA-256 refs** | Assets stored as `sha256:<64 hex>` refs in `slide.assets`. Uses `js-sha256` (pure JS, works on LAN without HTTPS). |

## Responsive model

ONE `<Studio>` component with internal breakpoint switch:
- **Desktop (≥1024px):** 4-zone resizable grid (rail | stage+timeline | right tabs)
- **Mobile (<1024px):** CapCut layout (stage + transport + one active panel + bottom toolbar)
- **Override:** Settings → Studio layout (default/desktop/mobile) for testing

## State management

| Concern | Tool |
|---|---|
| Server state (project, slides) | TanStack Query → MSW → zod |
| Playhead (60fps writes) | Zustand (`usePlayhead`) |
| Undo/redo stacks | Zustand (`useHistory`) |
| Caption display settings | Zustand + localStorage (`useCaptionSettings`) |
| Theme (light/dark/system) | localStorage + inline FOUC script |
| View mode override | Zustand + localStorage (`useViewMode`) |
| Mutations (all edits) | EditBus → `applyOp` → `queryClient.setQueryData` |
| SlideRenderer | React Context DI (`RendererProvider`) |

## Deployment

Vercel deploys from `ovk-web/`. The `vercel.json` rewrites all non-asset paths to `index.html` for SPA routing. MSW runs in production so the app works without a backend.

## What's deferred (post-MVP)

- Real HyperFrames renderer (MockRenderer stub currently)
- Real AI provider HTTP wiring (EchoProvider mock currently)
- Real backend (FastAPI — swap MSW handlers for `fetch`)
- Real TTS pipeline (edge-tts + ffprobe + ffmpeg)
- Real `npx hyperframes render` subprocess for export
- IndexedDB quota management / purge UI
- Native shell (pywebview / Electron / Tauri)
