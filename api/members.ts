import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors.js";
import { requireAuth } from "./_lib/jwt.js";
import { getMembers, setMembers } from "./_lib/redis.js";
import type { MembersData } from "./_lib/types.js";

type MembersDependencies = {
	handleCors: typeof handleCors;
	requireAuth: typeof requireAuth;
	getMembers: typeof getMembers;
	setMembers: typeof setMembers;
};

const defaultDependencies: MembersDependencies = {
	handleCors,
	requireAuth,
	getMembers,
	setMembers,
};

export function createMembersHandler(dependencies = defaultDependencies) {
	return async function handler(req: VercelRequest, res: VercelResponse) {
		if (dependencies.handleCors(req, res)) return;

		// ── GET — public ──────────────────────────────────────
		if (req.method === "GET") {
			const members = await dependencies.getMembers();
			return res.status(200).json(members);
		}

		// ── PUT — protected ───────────────────────────────────
		if (req.method === "PUT") {
			const auth = await dependencies.requireAuth(req, res);
			if (!auth) return; // requireAuth already sent 401

			const body = req.body as Partial<MembersData>;

			if (!body?.sections || !Array.isArray(body.sections)) {
				return res.status(400).json({
					error: "Invalid members payload: expected { sections: [...] }",
				});
			}

			await dependencies.setMembers({ sections: body.sections });
			return res.status(200).json({ ok: true });
		}

		return res.status(405).json({ error: "Method not allowed" });
	};
}

export default createMembersHandler();
