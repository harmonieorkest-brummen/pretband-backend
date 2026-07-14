import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors.js";
import { getTraffic } from "./_lib/ga4.js";
import { requireAuth } from "./_lib/jwt.js";
import { getRedirects, readRawStat, readStat } from "./_lib/redis.js";
import { STAT_KEYS } from "./_lib/stats.js";

type StatsDependencies = {
	handleCors: typeof handleCors;
	requireAuth: typeof requireAuth;
	getRedirects: typeof getRedirects;
	readStat: typeof readStat;
	readRawStat: typeof readRawStat;
	getTraffic: typeof getTraffic;
};

const defaultDependencies: StatsDependencies = {
	handleCors,
	requireAuth,
	getRedirects,
	readStat,
	readRawStat,
	getTraffic,
};

/** Admin-only aggregated stats for the dashboard. */
export function createStatsHandler(dependencies = defaultDependencies) {
	return async function handler(req: VercelRequest, res: VercelResponse) {
		if (dependencies.handleCors(req, res)) return;

		if (req.method !== "GET") {
			return res.status(405).json({ error: "Method not allowed" });
		}

		const auth = await dependencies.requireAuth(req, res);
		if (!auth) return; // requireAuth already sent 401

		try {
			const [{ redirects }, confetti, contactSubmits, failedLogins24h, lastLogin, traffic] =
				await Promise.all([
					dependencies.getRedirects(),
					dependencies.readStat(STAT_KEYS.confetti),
					dependencies.readStat(STAT_KEYS.contactSubmits),
					dependencies.readStat(STAT_KEYS.failedLogins24h),
					dependencies.readRawStat(STAT_KEYS.lastLogin),
					dependencies.getTraffic(),
				]);

			const codes = redirects
				.map((r) => ({
					slug: r.slug,
					label: r.label ?? "",
					url: r.url,
					scans: r.scans ?? 0,
				}))
				.sort((a, b) => b.scans - a.scans);
			const totalScans = codes.reduce((sum, c) => sum + c.scans, 0);
			const topCode = codes.length > 0 && codes[0].scans > 0 ? codes[0] : null;

			return res.status(200).json({
				qr: { totalScans, topCode, codes },
				confetti: { bursts: confetti },
				contact: { submissions: contactSubmits },
				security: { failedLogins24h, lastLogin },
				traffic,
			});
		} catch (error) {
			console.error("Failed to build stats:", error);
			return res.status(500).json({ error: "Failed to build stats" });
		}
	};
}

export default createStatsHandler();
