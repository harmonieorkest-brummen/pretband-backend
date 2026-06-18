import assert from "node:assert/strict";
import test from "node:test";
import { handleCors } from "../../api/_lib/cors.js";
import { createRequest, createResponse } from "../helpers/http.js";

test("handleCors echoes the production origin when allowed", () => {
	const req = createRequest({
		headers: { origin: "https://pretband.nl" },
	});
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
	assert.equal(res.ended, false);
});

test("handleCors echoes the local development origin when allowed", () => {
	const req = createRequest({
		headers: { origin: "http://localhost:5173" },
	});
	const res = createResponse();

	const handled = handleCors(req, res);

	assert.equal(handled, false);
	assert.equal(
		res.headers["Access-Control-Allow-Origin"],
		"http://localhost:5173",
	);
});

test("handleCors falls back to the production origin for unknown origins", () => {
	const req = createRequest({
		headers: { origin: "https://example.invalid" },
	});
	const res = createResponse();

	const handled = handleCors(req, res);

	assert.equal(handled, false);
	assert.equal(res.headers["Access-Control-Allow-Origin"], "https://pretband.nl");
});

test("handleCors falls back to the production origin when the origin is absent", () => {
	const req = createRequest({ headers: {} });
	const res = createResponse();

	const handled = handleCors(req, res);

	assert.equal(handled, false);
	assert.equal(res.headers["Access-Control-Allow-Origin"], "https://pretband.nl");
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
	assert.equal(
		res.headers["Access-Control-Allow-Origin"],
		"http://localhost:5173",
	);
});
