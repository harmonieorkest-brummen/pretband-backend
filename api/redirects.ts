import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors.js";
import { requireAuth } from "./_lib/jwt.js";
import { getRedirects, setRedirects } from "./_lib/redis.js";
import type { RedirectsData } from "./_lib/types.js";

type RedirectsDependencies = {
	handleCors: typeof handleCors;
	requireAuth: typeof requireAuth;
	getRedirects: typeof getRedirects;
	setRedirects: typeof setRedirects;
};

const defaultDependencies: RedirectsDependencies = {
	handleCors,
	requireAuth,
	getRedirects,
	setRedirects,
};

const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;

/** Validates the PUT payload. Returns an error string, or null when valid. */
export function validateRedirectsPayload(body: unknown): string | null {
	if (
		!body ||
		typeof body !== "object" ||
		!Array.isArray((body as { redirects?: unknown }).redirects)
	) {
		return "Invalid redirects payload: expected { redirects: [...] }";
	}

	const seen = new Set<string>();
	for (const entry of (body as RedirectsData).redirects) {
		if (!entry || typeof entry !== "object") {
			return "Each redirect must be an object";
		}
		const { slug, url } = entry;

		if (typeof slug !== "string" || !SLUG_PATTERN.test(slug)) {
			return `Invalid slug "${String(slug)}": use only lowercase letters, numbers and dashes`;
		}
		if (seen.has(slug)) {
			return `Duplicate slug "${slug}"`;
		}
		seen.add(slug);

		if (typeof url !== "string" || url.trim() === "") {
			return `Missing destination URL for "${slug}"`;
		}
		let parsed: URL;
		try {
			parsed = new URL(url);
		} catch {
			return `Invalid URL for "${slug}": must be absolute (start with http:// or https://)`;
		}
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return `Invalid URL for "${slug}": only http and https are allowed`;
		}
	}

	return null;
}

export function createRedirectsHandler(dependencies = defaultDependencies) {
	return async function handler(req: VercelRequest, res: VercelResponse) {
		if (dependencies.handleCors(req, res)) return;

		// ── GET — public (config is not secret; scan counts included) ──
		if (req.method === "GET") {
			const redirects = await dependencies.getRedirects();
			return res.status(200).json(redirects);
		}

		// ── PUT — protected ───────────────────────────────────
		if (req.method === "PUT") {
			const auth = await dependencies.requireAuth(req, res);
			if (!auth) return; // requireAuth already sent 401

			const error = validateRedirectsPayload(req.body);
			if (error) {
				return res.status(400).json({ error });
			}

			const body = req.body as RedirectsData;
			await dependencies.setRedirects({
				redirects: body.redirects.map((r) => ({
					slug: r.slug,
					url: r.url,
					label: r.label ?? "",
				})),
			});
			return res.status(200).json({ ok: true });
		}

		return res.status(405).json({ error: "Method not allowed" });
	};
}

export default createRedirectsHandler();
