import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors";
import { requireAuth } from "./_lib/jwt";
import { getMembers, setMembers } from "./_lib/redis";
import type { MembersData } from "./_lib/types";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (handleCors(req, res)) return;

	// ── GET — public ──────────────────────────────────────
	if (req.method === "GET") {
		const members = await getMembers();
		return res.status(200).json(members);
	}

	// ── PUT — protected ───────────────────────────────────
	if (req.method === "PUT") {
		const auth = await requireAuth(req, res);
		if (!auth) return; // requireAuth already sent 401

		const body = req.body as Partial<MembersData>;

		if (!body?.sections || !Array.isArray(body.sections)) {
			return res.status(400).json({
				error: "Invalid members payload: expected { sections: [...] }",
			});
		}

		await setMembers({ sections: body.sections });
		return res.status(200).json({ ok: true });
	}

	return res.status(405).json({ error: "Method not allowed" });
}
