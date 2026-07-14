import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors.js";
import { incrementStat } from "./_lib/redis.js";
import { TRACKABLE_EVENTS } from "./_lib/stats.js";

type TrackDependencies = {
	handleCors: typeof handleCors;
	incrementStat: typeof incrementStat;
};

const defaultDependencies: TrackDependencies = { handleCors, incrementStat };

/**
 * Public, unauthenticated counter bump for lightweight site events
 * (confetti bursts, contact-form submissions). Only the fixed event names in
 * TRACKABLE_EVENTS are honoured — an arbitrary or inherited property name
 * (e.g. "__proto__") can never select a key.
 */
export function createTrackHandler(dependencies = defaultDependencies) {
	return async function handler(req: VercelRequest, res: VercelResponse) {
		if (dependencies.handleCors(req, res)) return;

		if (req.method !== "POST") {
			return res.status(405).json({ error: "Method not allowed" });
		}

		const { event } = (req.body ?? {}) as { event?: unknown };
		const key =
			typeof event === "string" && Object.hasOwn(TRACKABLE_EVENTS, event)
				? TRACKABLE_EVENTS[event]
				: undefined;

		if (!key) {
			return res.status(400).json({ error: "Unknown event" });
		}

		try {
			await dependencies.incrementStat(key);
		} catch {
			// Best-effort vanity counter — never surface an error to the caller.
		}
		return res.status(202).json({ ok: true });
	};
}

export default createTrackHandler();
