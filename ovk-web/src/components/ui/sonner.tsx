import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Resolve the active theme from the documentElement's class list.
 * Avoids pulling in `next-themes` (a Next.js-oriented lib) for this Vite SPA.
 * P1+ may swap in a real ThemeProvider; this hook will continue to work as
 * long as the dark class is toggled on <html>.
 */
function useThemeClass(): ToasterProps["theme"] {
	const [isDark, setIsDark] = useState(false);
	useEffect(() => {
		const observer = new MutationObserver(() => {
			setIsDark(document.documentElement.classList.contains("dark"));
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		setIsDark(document.documentElement.classList.contains("dark"));
		return () => observer.disconnect();
	}, []);
	return isDark ? "dark" : "light";
}

const Toaster = ({ ...props }: ToasterProps) => {
	const theme = useThemeClass();

	return (
		<Sonner
			theme={theme}
			position="top-center"
			className="toaster group"
			icons={{
				success: <CircleCheckIcon className="size-4" />,
				info: <InfoIcon className="size-4" />,
				warning: <TriangleAlertIcon className="size-4" />,
				error: <OctagonXIcon className="size-4" />,
				loading: <Loader2Icon className="size-4 animate-spin" />,
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
