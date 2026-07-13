import type { VercelRequest, VercelResponse } from "@vercel/node";

const PROD_ORIGIN = "https://pretband.nl";
const DEV_ORIGIN = "http://localhost:5173";

/** The local dev origin is only a legitimate caller outside production. */
function allowedOrigins(): string[] {
	return process.env.VERCEL_ENV === "production"
		? [PROD_ORIGIN]
		: [PROD_ORIGIN, DEV_ORIGIN];
}

/** Call at the top of every handler. Returns true if the request was an
 *  OPTIONS preflight that has already been answered — in that case just return. */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
	const origin = req.headers.origin || "";

	// The response body/permissions depend on the Origin, so any cache must key
	// on it rather than serving one origin's CORS headers to another.
	res.setHeader("Vary", "Origin");

	// Only reflect the Origin when it is explicitly allowed. A disallowed or
	// absent origin gets NO Access-Control-Allow-Origin header, so the browser
	// blocks the cross-origin read instead of us echoing a permissive default.
	if (allowedOrigins().includes(origin)) {
		res.setHeader("Access-Control-Allow-Origin", origin);
	}

	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	res.setHeader("Access-Control-Max-Age", "86400");

	if (req.method === "OPTIONS") {
		res.status(204).end();
		return true;
	}
	return false;
}
