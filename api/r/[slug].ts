import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "../_lib/cors.js";
import { bumpScan, getRedirect } from "../_lib/redis.js";

type RedirectDependencies = {
	handleCors: typeof handleCors;
	getRedirect: typeof getRedirect;
	bumpScan: typeof bumpScan;
	fallbackUrl: () => string;
};

const defaultDependencies: RedirectDependencies = {
	handleCors,
	getRedirect,
	bumpScan,
	fallbackUrl: () => process.env.SITE_URL || "https://pretband.nl",
};

const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

/** Only http(s) destinations may be emitted as a Location. */
function isHttpUrl(value: string): boolean {
	try {
		const { protocol } = new URL(value);
		return protocol === "http:" || protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Public QR target: GET /r/:slug → 302 to the configured destination.
 *
 * The destination is read *only* from stored config (never from the query
 * string), so this cannot be turned into an open redirect. Unknown or invalid
 * slugs fall back to the site home rather than erroring, so a stale printed QR
 * never lands the visitor on a dead page.
 */
export function createRedirectHandler(dependencies = defaultDependencies) {
	return async function handler(req: VercelRequest, res: VercelResponse) {
		if (dependencies.handleCors(req, res)) return;

		if (req.method !== "GET") {
			return res.status(405).json({ error: "Method not allowed" });
		}

		const fallback = dependencies.fallbackUrl();

		const raw = req.query.slug;
		const slug = Array.isArray(raw) ? raw[0] : raw;

		const redirectTo = (url: string) => {
			res.setHeader("Location", url);
			res.setHeader("Cache-Control", "no-store");
			return res.status(302).end();
		};

		if (!slug || !SLUG_PATTERN.test(slug)) {
			return redirectTo(fallback);
		}

		const entry = await dependencies.getRedirect(slug);
		// Re-validate the stored destination at emit time. Write-time validation
		// already restricts targets to http(s), but this also protects against a
		// value written directly to the datastore out-of-band.
		if (!entry || !isHttpUrl(entry.url)) {
			return redirectTo(fallback);
		}

		// Count the scan, but never let a counter failure break the redirect.
		try {
			await dependencies.bumpScan(slug);
		} catch {
			// ignore — the redirect is what matters
		}

		return redirectTo(entry.url);
	};
}

export default createRedirectHandler();
