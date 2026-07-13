import type { VercelRequest } from "@vercel/node";

export const RATE_LIMIT_WINDOW_SECONDS = 900; // 15 minutes
export const RATE_LIMIT_MAX_ATTEMPTS = 10; // per identifier per window

/** Best-effort client IP from Vercel's forwarding headers. */
export function clientIp(req: VercelRequest): string {
	const forwarded = req.headers["x-forwarded-for"];
	if (typeof forwarded === "string" && forwarded.length > 0) {
		return forwarded.split(",")[0].trim();
	}
	if (Array.isArray(forwarded) && forwarded.length > 0) {
		return forwarded[0];
	}
	return req.socket?.remoteAddress ?? "unknown";
}

type HitCounter = (identifier: string, windowSeconds: number) => Promise<number>;

/**
 * Builds a per-IP login throttle from a fixed-window counter.
 * Returns a predicate: true = allow the request, false = reject (429).
 *
 * Fails OPEN — if the counter backend errors (e.g. Redis is down) the request
 * is allowed, so an infra hiccup never locks the admin out of their own site.
 */
export function createLoginRateLimiter(hit: HitCounter) {
	return async function checkRateLimit(req: VercelRequest): Promise<boolean> {
		try {
			const count = await hit(clientIp(req), RATE_LIMIT_WINDOW_SECONDS);
			return count <= RATE_LIMIT_MAX_ATTEMPTS;
		} catch {
			return true;
		}
	};
}
