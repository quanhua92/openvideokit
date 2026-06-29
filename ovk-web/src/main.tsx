import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { router } from "./app/router";
import { enableMocking } from "./shared/api/msw/worker";
import "./styles.css";

async function bootstrap() {
	try {
		await enableMocking();
	} catch (error) {
		console.error("[bootstrap] mocking failed:", error);
	}

	const rootElement = document.getElementById("app");
	if (!rootElement || rootElement.innerHTML) return;

	const root = ReactDOM.createRoot(rootElement);
	root.render(<RouterProvider router={router} />);
}

void bootstrap();
