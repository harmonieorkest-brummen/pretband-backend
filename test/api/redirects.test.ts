import assert from "node:assert/strict";
import test from "node:test";
import {
	createRedirectsHandler,
	validateRedirectsPayload,
} from "../../api/redirects.js";
import type { RedirectsData } from "../../api/_lib/types.js";
import { createRequest, createResponse } from "../helpers/http.js";

const redirects: RedirectsData = {
	redirects: [
		{ slug: "flyer", url: "https://pretband.nl/#/#agenda", label: "Flyer" },
	],
};

test("redirects handler stops on CORS preflight before touching data or auth", async () => {
	let authCalls = 0;
	let getCalls = 0;
	let setCalls = 0;
	const handler = createRedirectsHandler({
		handleCors: () => true,
		requireAuth: async () => {
			authCalls += 1;
			return { admin: true };
		},
		getRedirects: async () => {
			getCalls += 1;
			return redirects;
		},
		setRedirects: async () => {
			setCalls += 1;
		},
	});
	const req = createRequest({ method: "OPTIONS" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(authCalls, 0);
	assert.equal(getCalls, 0);
	assert.equal(setCalls, 0);
	assert.equal(res.statusCode, undefined);
});

test("redirects handler returns public config for GET without requiring auth", async () => {
	let authCalls = 0;
	const handler = createRedirectsHandler({
		handleCors: () => false,
		requireAuth: async () => {
			authCalls += 1;
			return null;
		},
		getRedirects: async () => redirects,
		setRedirects: async () => {
			throw new Error("setRedirects should not be called");
		},
	});
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.jsonBody, redirects);
	assert.equal(authCalls, 0);
});

test("redirects handler lets requireAuth send the unauthorized PUT response", async () => {
	let setCalls = 0;
	const handler = createRedirectsHandler({
		handleCors: () => false,
		requireAuth: async (_req, res) => {
			res.status(401).json({ error: "Missing authorization token" });
			return null;
		},
		getRedirects: async () => redirects,
		setRedirects: async () => {
			setCalls += 1;
		},
	});
	const req = createRequest({ method: "PUT", body: redirects });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 401);
	assert.deepEqual(res.jsonBody, { error: "Missing authorization token" });
	assert.equal(setCalls, 0);
});

test("redirects handler rejects invalid PUT payloads after successful auth", async () => {
	const handler = createRedirectsHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getRedirects: async () => redirects,
		setRedirects: async () => {
			throw new Error("setRedirects should not be called");
		},
	});

	const invalidBodies = [
		undefined,
		{},
		{ redirects: "not-array" },
		{ redirects: [{ slug: "Has Spaces", url: "https://x.nl" }] },
		{ redirects: [{ slug: "ok", url: "ftp://x.nl" }] },
		{ redirects: [{ slug: "ok", url: "javascript:alert(1)" }] },
		{ redirects: [{ slug: "ok", url: "" }] },
		{
			redirects: [
				{ slug: "dup", url: "https://a.nl" },
				{ slug: "dup", url: "https://b.nl" },
			],
		},
	];

	for (const body of invalidBodies) {
		const req = createRequest({ method: "PUT", body });
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(body)}`);
	}
});

test("redirects handler stores valid PUT payloads and returns ok", async () => {
	const stored: RedirectsData[] = [];
	const handler = createRedirectsHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getRedirects: async () => ({ redirects: [] }),
		setRedirects: async (data) => {
			stored.push(data);
		},
	});
	const req = createRequest({ method: "PUT", body: redirects });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.jsonBody, { ok: true });
	assert.deepEqual(stored, [
		{
			redirects: [
				{ slug: "flyer", url: "https://pretband.nl/#/#agenda", label: "Flyer" },
			],
		},
	]);
});

test("redirects handler rejects unsupported methods", async () => {
	const handler = createRedirectsHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getRedirects: async () => redirects,
		setRedirects: async () => {
			throw new Error("setRedirects should not be called");
		},
	});
	const req = createRequest({ method: "DELETE" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 405);
	assert.deepEqual(res.jsonBody, { error: "Method not allowed" });
});

test("validateRedirectsPayload accepts a valid payload and rejects bad slugs and schemes", () => {
	assert.equal(validateRedirectsPayload(redirects), null);
	assert.equal(
		validateRedirectsPayload({ redirects: [] }),
		null,
		"empty list is valid",
	);
	assert.match(
		validateRedirectsPayload({ redirects: [{ slug: "UP", url: "https://x.nl" }] }) ??
			"",
		/Invalid slug/,
	);
	assert.match(
		validateRedirectsPayload({
			redirects: [{ slug: "ok", url: "data:text/html,x" }],
		}) ?? "",
		/only http and https/,
	);
});
