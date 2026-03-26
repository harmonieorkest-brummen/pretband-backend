import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED_ORIGIN = "https://pretband.nl";

/** Call at the top of every handler. Returns true if the request was an
 *  OPTIONS preflight that has already been answered — in that case just return. */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
	res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

	if (req.method === "OPTIONS") {
		res.status(204).end();
		return true;
	}
	return false;
}
