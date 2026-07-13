import assert from "node:assert/strict";
import test from "node:test";
import { createRedirectHandler } from "../../api/r/[slug].js";
import { createRequest, createResponse } from "../helpers/http.js";

const FALLBACK = "https://pretband.nl";

test("redirect handler stops on CORS preflight before touching data", async () => {
	let getCalls = 0;
	const handler = createRedirectHandler({
		handleCors: () => true,
		getRedirect: async () => {
			getCalls += 1;
			return null;
		},
		bumpScan: async () => {},
		fallbackUrl: () => FALLBACK,
	});
	const req = createRequest({ method: "OPTIONS", query: { slug: "flyer" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(getCalls, 0);
	assert.equal(res.statusCode, undefined);
});

test("redirect handler 302s to the configured destination and counts the scan", async () => {
	const scanned: string[] = [];
	const handler = createRedirectHandler({
		handleCors: () => false,
		getRedirect: async (slug) => {
			assert.equal(slug, "flyer");
			return { url: "https://youtu.be/dQw4w9WgXcQ" };
		},
		bumpScan: async (slug) => {
			scanned.push(slug);
		},
		fallbackUrl: () => FALLBACK,
	});
	const req = createRequest({ method: "GET", query: { slug: "flyer" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 302);
	assert.equal(res.headers.Location, "https://youtu.be/dQw4w9WgXcQ");
	assert.deepEqual(scanned, ["flyer"]);
});

test("redirect handler falls back to home for an unknown slug", async () => {
	const handler = createRedirectHandler({
		handleCors: () => false,
		getRedirect: async () => null,
		bumpScan: async () => {
			throw new Error("bumpScan should not run for a missing slug");
		},
		fallbackUrl: () => FALLBACK,
	});
	const req = createRequest({ method: "GET", query: { slug: "does-not-exist" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 302);
	assert.equal(res.headers.Location, FALLBACK);
});

test("redirect handler falls back for a malformed slug without a lookup", async () => {
	let getCalls = 0;
	const handler = createRedirectHandler({
		handleCors: () => false,
		getRedirect: async () => {
			getCalls += 1;
			return null;
		},
		bumpScan: async () => {},
		fallbackUrl: () => FALLBACK,
	});
	const req = createRequest({ method: "GET", query: { slug: "Bad Slug!" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 302);
	assert.equal(res.headers.Location, FALLBACK);
	assert.equal(getCalls, 0);
});

test("redirect handler still redirects when the scan counter fails", async () => {
	const handler = createRedirectHandler({
		handleCors: () => false,
		getRedirect: async () => ({ url: "https://instagram.com/pretband" }),
		bumpScan: async () => {
			throw new Error("redis down");
		},
		fallbackUrl: () => FALLBACK,
	});
	const req = createRequest({ method: "GET", query: { slug: "insta" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 302);
	assert.equal(res.headers.Location, "https://instagram.com/pretband");
});

test("redirect handler rejects non-GET methods", async () => {
	const handler = createRedirectHandler({
		handleCors: () => false,
		getRedirect: async () => ({ url: "https://x.nl" }),
		bumpScan: async () => {},
		fallbackUrl: () => FALLBACK,
	});
	const req = createRequest({ method: "POST", query: { slug: "flyer" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 405);
	assert.deepEqual(res.jsonBody, { error: "Method not allowed" });
});
