import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors";
import { requireAuth } from "./_lib/jwt";
import { getAgenda, setAgenda } from "./_lib/redis";
import type { AgendaData } from "./_lib/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (handleCors(req, res)) return;

	// ── GET — public ──────────────────────────────────────
	if (req.method === "GET") {
		const agenda = await getAgenda();
		return res.status(200).json(agenda);
	}

	// ── PUT — protected ───────────────────────────────────
	if (req.method === "PUT") {
		const auth = await requireAuth(req, res);
		if (!auth) return; // requireAuth already sent 401

		const body = req.body as Partial<AgendaData>;

		if (!body?.events || !Array.isArray(body.events)) {
			return res
				.status(400)
				.json({ error: "Invalid agenda payload: expected { events: [...] }" });
		}

		await setAgenda({ events: body.events });
		return res.status(200).json({ ok: true });
	}

	return res.status(405).json({ error: "Method not allowed" });
}
