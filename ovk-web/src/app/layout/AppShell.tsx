/**
 * AppShell — top-level layout wrapping every routed page.
 *
 * Header: logo + single overflow menu. Same on every breakpoint.
 *
 * Overflow menu contains:
 *   - Recent projects (link to overview)
 *   - Undo / Redo (project routes only; backed by useUndoRedo + ⌘Z)
 *   - Export (opens ExportDialog)
 *   - Theme submenu (Light / Dark / System) — quick access
 *   - Settings link (full preferences page)
 */

import { Link, Outlet, useParams } from "@tanstack/react-router";
import { Clapperboard, MoreHorizontal, Redo2, Undo2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportDialog } from "@/features/export/components/ExportDialog";
import { FIXTURE_PROJECT_ID } from "@/shared/api/fixtures";
import { useUndoRedo } from "@/shared/edit/useUndoRedo";
import type { Theme } from "@/shared/lib/theme";
import { useTheme } from "@/shared/lib/useTheme";

const PROJECT_TO = "/projects/$projectId" as const;
const PROJECT_PARAMS = { projectId: FIXTURE_PROJECT_ID };

const IS_MAC =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent);
const UNDO_HINT = IS_MAC ? "⌘Z" : "Ctrl+Z";
const REDO_HINT = IS_MAC ? "⌘⇧Z" : "Ctrl+Shift+Z";

const THEME_OPTIONS: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const [exportOpen, setExportOpen] = useState(false);

  // projectId is only present on /projects/$projectId* routes. Undo/redo is
  // project-scoped, so we mount the hook here (keeps the ⌘Z listener alive
  // across the app) and hide the menu items when no project is active.
  const params = useParams({ strict: false });
  const projectId = params.projectId as string | undefined;
  const undoRedo = useUndoRedo(projectId);

  return (
    <div className="flex h-svh flex-col bg-background text-foreground">
      <header className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-5" />
          <span className="text-sm font-semibold">OpenVideoKit</span>
        </div>
        <OverflowMenu
          onExport={() => setExportOpen(true)}
          projectId={projectId ?? FIXTURE_PROJECT_ID}
          showHistory={Boolean(projectId)}
          canUndo={undoRedo.canUndo}
          canRedo={undoRedo.canRedo}
          onUndo={undoRedo.undo}
          onRedo={undoRedo.redo}
        />
      </header>
      <main className="flex-1 overflow-hidden">{children ?? <Outlet />}</main>
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={projectId ?? FIXTURE_PROJECT_ID}
      />
    </div>
  );
}

interface OverflowMenuProps {
  onExport: () => void;
  projectId: string;
  showHistory: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

function OverflowMenu({
  onExport,
  projectId,
  showHistory,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: OverflowMenuProps) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Menu">
          <MoreHorizontal className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Recent projects</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to={PROJECT_TO} params={PROJECT_PARAMS}>
            Eco Bottle Campaign
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>More soon…</DropdownMenuItem>
        {showHistory && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onUndo}
              disabled={!canUndo}
              className="cursor-pointer"
            >
              <Undo2 className="size-4" />
              <span>Undo</span>
              <DropdownMenuShortcut>{UNDO_HINT}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onRedo}
              disabled={!canRedo}
              className="cursor-pointer"
            >
              <Redo2 className="size-4" />
              <span>Redo</span>
              <DropdownMenuShortcut>{REDO_HINT}</DropdownMenuShortcut>
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {showHistory && (
          <DropdownMenuItem asChild>
            <Link to="/projects/$projectId/exports" params={{ projectId }}>
              View Exports
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={onExport} className="cursor-pointer">
          Export as MP4
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <span className="capitalize">{theme}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {THEME_OPTIONS.map(({ value, label }) => (
              <DropdownMenuItem
                key={value}
                onClick={() => setTheme(value)}
                className={theme === value ? "font-medium" : ""}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <Link to="/settings">Settings</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
