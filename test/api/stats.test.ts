import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createStatsHandler } from "../../api/stats.js";
import { STAT_KEYS } from "../../api/_lib/stats.js";
import type { RedirectsData } from "../../api/_lib/types.js";
import { createRequest, createResponse } from "../helpers/http.js";

const redirects: RedirectsData = {
	redirects: [
		{ slug: "flyer", url: "https://pretband.nl", label: "Flyer", scans: 12 },
		{ slug: "poster", url: "https://youtu.be/x", label: "Poster", scans: 30 },
		{ slug: "card", url: "https://pretband.nl/agenda", label: "Card", scans: 0 },
	],
};

function makeHandler(overrides = {}) {
	const statValues: Record<string, number> = {
		[STAT_KEYS.confetti]: 999,
		[STAT_KEYS.contactSubmits]: 7,
		[STAT_KEYS.failedLogins24h]: 3,
	};
	return createStatsHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getRedirects: async () => redirects,
		readStat: async (key) => statValues[key] ?? 0,
		readRawStat: async () => "2026-07-14T09:00:00.000Z",
		getTraffic: async () => ({ connected: false, reason: "not_configured" }),
		...overrides,
	});
}

test("stats handler stops on CORS preflight before auth or data", async () => {
	let authCalls = 0;
	const handler = makeHandler({
		handleCors: () => true,
		requireAuth: async () => {
			authCalls += 1;
			return { admin: true };
		},
	});
	const req = createRequest({ method: "OPTIONS" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(authCalls, 0);
	assert.equal(res.statusCode, undefined);
});

test("stats handler rejects non-GET methods", async () => {
	const handler = makeHandler();
	const req = createRequest({ method: "POST" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 405);
});

test("stats handler lets requireAuth reject unauthenticated callers", async () => {
	let dataFetched = false;
	const handler = makeHandler({
		requireAuth: async (_req: VercelRequest, res: VercelResponse) => {
			res.status(401).json({ error: "Missing authorization token" });
			return null;
		},
		getRedirects: async () => {
			dataFetched = true;
			return redirects;
		},
	});
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 401);
	assert.equal(dataFetched, false);
});

test("stats handler aggregates scans, counters, security and traffic", async () => {
	const handler = makeHandler();
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	const body = res.jsonBody as {
		qr: {
			totalScans: number;
			topCode: { slug: string; scans: number } | null;
			codes: { slug: string; scans: number }[];
		};
		confetti: { bursts: number };
		contact: { submissions: number };
		security: { failedLogins24h: number; lastLogin: string | null };
		traffic: { connected: boolean };
	};

	assert.equal(body.qr.totalScans, 42);
	assert.equal(body.qr.topCode?.slug, "poster");
	// Sorted by scans descending.
	assert.deepEqual(
		body.qr.codes.map((c) => c.slug),
		["poster", "flyer", "card"],
	);
	assert.equal(body.confetti.bursts, 999);
	assert.equal(body.contact.submissions, 7);
	assert.equal(body.security.failedLogins24h, 3);
	assert.equal(body.security.lastLogin, "2026-07-14T09:00:00.000Z");
	assert.equal(body.traffic.connected, false);
});

test("stats handler reports no top code when every code has zero scans", async () => {
	const handler = makeHandler({
		getRedirects: async () => ({
			redirects: [{ slug: "a", url: "https://x.nl", label: "", scans: 0 }],
		}),
	});
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	const body = res.jsonBody as { qr: { totalScans: number; topCode: unknown } };
	assert.equal(body.qr.totalScans, 0);
	assert.equal(body.qr.topCode, null);
});

test("stats handler returns 500 when a data source throws", async () => {
	const previousError = console.error;
	console.error = () => {};
	try {
		const handler = makeHandler({
			getRedirects: async () => {
				throw new Error("redis down");
			},
		});
		const req = createRequest({ method: "GET" });
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 500);
		assert.deepEqual(res.jsonBody, { error: "Failed to build stats" });
	} finally {
		console.error = previousError;
	}
});
