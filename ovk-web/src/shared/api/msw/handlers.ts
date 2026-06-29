/**
 * MSW handlers — mock the FastAPI control plane (RFC §13) for the v1 local app.
 * P7 swaps these for real `fetch` calls without touching call sites.
 */
import { HttpResponse, http } from "msw";

import { FIXTURE_PROJECT_ID, fixtureBundle, fixtureSlides } from "./fixtures";

export const API_BASE = "/api";

export const handlers = [
	http.get(`${API_BASE}/projects`, () => {
		return HttpResponse.json({
			projects: [{ id: FIXTURE_PROJECT_ID, name: "Eco Bottle Campaign" }],
		});
	}),

	http.get(`${API_BASE}/projects/:projectId`, ({ params }) => {
		const { projectId } = params;
		if (projectId !== FIXTURE_PROJECT_ID) {
			return HttpResponse.json(
				{ message: `project ${projectId} not found` },
				{ status: 404 },
			);
		}
		return HttpResponse.json(fixtureBundle);
	}),

	http.get(`${API_BASE}/projects/:projectId/slides/:slideId`, ({ params }) => {
		const { projectId, slideId } = params as {
			projectId: string;
			slideId: string;
		};
		if (projectId !== FIXTURE_PROJECT_ID) {
			return HttpResponse.json(
				{ message: `project ${projectId} not found` },
				{ status: 404 },
			);
		}
		const slide = fixtureSlides[slideId];
		if (!slide) {
			return HttpResponse.json(
				{ message: `slide ${slideId} not found` },
				{ status: 404 },
			);
		}
		return HttpResponse.json(slide);
	}),
];
