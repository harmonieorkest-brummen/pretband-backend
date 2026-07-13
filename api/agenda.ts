import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors.js";
import { requireAuth } from "./_lib/jwt.js";
import { getAgenda, setAgenda } from "./_lib/redis.js";
import type { AgendaData } from "./_lib/types.js";
import { isSafeKeySegment } from "./_lib/validation.js";

type AgendaDependencies = {
	handleCors: typeof handleCors;
	requireAuth: typeof requireAuth;
	getAgenda: typeof getAgenda;
	setAgenda: typeof setAgenda;
};

const defaultDependencies: AgendaDependencies = {
	handleCors,
	requireAuth,
	getAgenda,
	setAgenda,
};

export function createAgendaHandler(dependencies = defaultDependencies) {
	return async function handler(req: VercelRequest, res: VercelResponse) {
		if (dependencies.handleCors(req, res)) return;

		// ── GET — public ──────────────────────────────────────
		if (req.method === "GET") {
			const agenda = await dependencies.getAgenda();
			return res.status(200).json(agenda);
		}

		// ── PUT — protected ───────────────────────────────────
		if (req.method === "PUT") {
			const auth = await dependencies.requireAuth(req, res);
			if (!auth) return; // requireAuth already sent 401

			const body = req.body as Partial<AgendaData>;

			if (!body?.events || !Array.isArray(body.events)) {
				return res
					.status(400)
					.json({ error: "Invalid agenda payload: expected { events: [...] }" });
			}

			for (const event of body.events) {
				if (!event || typeof event !== "object" || !isSafeKeySegment(event.id)) {
					return res.status(400).json({
						error:
							"Invalid event id: 1-128 chars, without ':', whitespace or glob characters",
					});
				}
			}

			await dependencies.setAgenda({ events: body.events });
			return res.status(200).json({ ok: true });
		}

		return res.status(405).json({ error: "Method not allowed" });
	};
}

export default createAgendaHandler();
