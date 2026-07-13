import assert from "node:assert/strict";
import test from "node:test";
import { handleCors } from "../../api/_lib/cors.js";
import { withEnv } from "../helpers/env.js";
import { createRequest, createResponse } from "../helpers/http.js";

test("handleCors reflects the production origin when allowed", () => {
	const req = createRequest({ headers: { origin: "https://pretband.nl" } });
	const res = createResponse();

	const handled = handleCors(req, res);

	assert.equal(handled, false);
	assert.equal(res.headers["Access-Control-Allow-Origin"], "https://pretband.nl");
	assert.equal(
		res.headers["Access-Control-Allow-Methods"],
		"GET, POST, PUT, DELETE, OPTIONS",
	);
	assert.equal(
		res.headers["Access-Control-Allow-Headers"],
		"Content-Type, Authorization",
	);
	assert.equal(res.headers["Access-Control-Max-Age"], "86400");
	assert.equal(res.headers.Vary, "Origin");
	assert.equal(res.ended, false);
});

test("handleCors reflects the local dev origin outside production", () => {
	const req = createRequest({ headers: { origin: "http://localhost:5173" } });
	const res = createResponse();

	handleCors(req, res);

	assert.equal(res.headers["Access-Control-Allow-Origin"], "http://localhost:5173");
});

test("handleCors sends NO allow-origin header for a disallowed origin", () => {
	const req = createRequest({ headers: { origin: "https://example.invalid" } });
	const res = createResponse();

	const handled = handleCors(req, res);

	assert.equal(handled, false);
	assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
	assert.equal(res.headers.Vary, "Origin");
});

test("handleCors sends NO allow-origin header when the origin is absent", () => {
	const req = createRequest({ headers: {} });
	const res = createResponse();

	handleCors(req, res);

	assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
});

test("handleCors does NOT allow the local dev origin in production", () => {
	withEnv({ VERCEL_ENV: "production" }, () => {
		const req = createRequest({ headers: { origin: "http://localhost:5173" } });
		const res = createResponse();

		handleCors(req, res);

		assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
	});
});

test("handleCors still reflects the production origin in production", () => {
	withEnv({ VERCEL_ENV: "production" }, () => {
		const req = createRequest({ headers: { origin: "https://pretband.nl" } });
		const res = createResponse();

		handleCors(req, res);

		assert.equal(res.headers["Access-Control-Allow-Origin"], "https://pretband.nl");
	});
});

test("handleCors answers OPTIONS preflight requests and stops the caller", () => {
	const req = createRequest({
		method: "OPTIONS",
		headers: { origin: "http://localhost:5173" },
	});
	const res = createResponse();

	const handled = handleCors(req, res);

	assert.equal(handled, true);
	assert.equal(res.statusCode, 204);
	assert.equal(res.ended, true);
	assert.equal(res.headers["Access-Control-Allow-Origin"], "http://localhost:5173");
});
