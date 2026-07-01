import { RouterProvider } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { router } from "./app/router";
import "./styles.css";

import "@hyperframes/player";

function bootstrap() {
  const rootElement = document.getElementById("app");
  if (!rootElement || rootElement.innerHTML) return;

  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}

bootstrap();
