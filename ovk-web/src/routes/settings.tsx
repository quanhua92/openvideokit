import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Check,
	Laptop,
	Laptop2,
	LaptopMinimal,
	Monitor,
	Moon,
	Sun,
} from "lucide-react";
import type { ComponentType } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Theme } from "@/shared/lib/theme";
import { useStudioLayout } from "@/shared/lib/useStudioLayout";
import { useTheme } from "@/shared/lib/useTheme";
import type { ViewMode } from "@/shared/store/view-mode";
import { viewModeLabel } from "@/shared/store/view-mode";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

interface ThemeOption {
	value: Theme;
	label: string;
	icon: ComponentType<{ className?: string }>;
}

const THEME_OPTIONS: ThemeOption[] = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
];

interface ViewModeOption {
	value: ViewMode;
	label: string;
	icon: ComponentType<{ className?: string }>;
}

const VIEW_MODE_OPTIONS: ViewModeOption[] = [
	{ value: "default", label: "Default", icon: LaptopMinimal },
	{ value: "desktop", label: "Desktop", icon: Laptop2 },
	{ value: "mobile", label: "Mobile", icon: Laptop },
];

function SettingsPage() {
	return (
		<div className="h-full overflow-auto">
			<div className="mx-auto max-w-2xl space-y-5 p-6">
				<header className="space-y-1">
					<h1 className="text-xl font-bold">Settings</h1>
					<p className="text-xs text-muted-foreground">
						Saved to this browser automatically.
					</p>
				</header>

				<section className="space-y-2">
					<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						Appearance
					</h2>
					<ThemeCard />
					<ViewModeCard />
				</section>
			</div>
		</div>
	);
}

function ThemeCard() {
	const { theme, setTheme } = useTheme();
	return (
		<Card>
			<CardHeader className="px-4 py-3">
				<CardTitle className="text-sm">Theme</CardTitle>
			</CardHeader>
			<CardContent className="px-4 pb-4">
				<OptionRow>
					{THEME_OPTIONS.map((opt) => (
						<OptionChip
							key={opt.value}
							label={opt.label}
							icon={opt.icon}
							selected={theme === opt.value}
							onClick={() => setTheme(opt.value)}
						/>
					))}
				</OptionRow>
			</CardContent>
		</Card>
	);
}

function ViewModeCard() {
	const { mode, setMode } = useStudioLayout();
	return (
		<Card>
			<CardHeader className="px-4 py-3">
				<CardTitle className="text-sm">
					Studio layout
					<span className="ml-2 text-xs font-normal text-muted-foreground">
						currently {viewModeLabel(mode).toLowerCase()}
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="px-4 pb-4">
				<OptionRow>
					{VIEW_MODE_OPTIONS.map((opt) => (
						<OptionChip
							key={opt.value}
							label={opt.label}
							icon={opt.icon}
							selected={mode === opt.value}
							onClick={() => setMode(opt.value)}
						/>
					))}
				</OptionRow>
			</CardContent>
		</Card>
	);
}

function OptionRow({ children }: { children: React.ReactNode }) {
	return <div className="flex flex-wrap gap-2">{children}</div>;
}

function OptionChip({
	label,
	icon: Icon,
	selected,
	onClick,
}: {
	label: string;
	icon: ComponentType<{ className?: string }>;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-pressed={selected}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
				"hover:bg-accent hover:text-accent-foreground",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				selected
					? "border-primary bg-primary/10 text-primary"
					: "border-border text-muted-foreground",
			)}
		>
			<Icon className="size-3.5" />
			{label}
			{selected && <Check className="size-3" />}
		</button>
	);
}

export function SettingsLink() {
	return <Link to="/settings">Settings</Link>;
}
