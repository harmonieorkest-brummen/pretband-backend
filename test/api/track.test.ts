import assert from "node:assert/strict";
import test from "node:test";
import { createTrackHandler } from "../../api/track.js";
import { createRequest, createResponse } from "../helpers/http.js";

function makeHandler() {
	const increments: string[] = [];
	const handler = createTrackHandler({
		handleCors: () => false,
		incrementStat: async (key) => {
			increments.push(key);
			return increments.filter((k) => k === key).length;
		},
	});
	return { handler, increments };
}

test("track handler stops on CORS preflight without incrementing", async () => {
	let incremented = false;
	const handler = createTrackHandler({
		handleCors: () => true,
		incrementStat: async () => {
			incremented = true;
			return 1;
		},
	});
	const req = createRequest({ method: "OPTIONS" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(incremented, false);
	assert.equal(res.statusCode, undefined);
});

test("track handler rejects non-POST methods", async () => {
	const { handler, increments } = makeHandler();
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 405);
	assert.deepEqual(increments, []);
});

test("track handler counts a known confetti event", async () => {
	const { handler, increments } = makeHandler();
	const req = createRequest({ method: "POST", body: { event: "confetti" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 202);
	assert.deepEqual(res.jsonBody, { ok: true });
	assert.deepEqual(increments, ["stats:confetti"]);
});

test("track handler counts a known contact_submit event", async () => {
	const { handler, increments } = makeHandler();
	const req = createRequest({
		method: "POST",
		body: { event: "contact_submit" },
	});
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 202);
	assert.deepEqual(increments, ["stats:contact_submits"]);
});

test("track handler rejects unknown, missing, and prototype-chain event names", async () => {
	for (const body of [
		undefined,
		{},
		{ event: "" },
		{ event: "nope" },
		{ event: "__proto__" },
		{ event: "constructor" },
		{ event: "hasOwnProperty" },
		{ event: 123 },
	]) {
		const { handler, increments } = makeHandler();
		const req = createRequest({ method: "POST", body });
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(body)}`);
		assert.deepEqual(increments, [], `must not increment for ${JSON.stringify(body)}`);
	}
});

test("track handler swallows counter errors and still returns 202", async () => {
	const handler = createTrackHandler({
		handleCors: () => false,
		incrementStat: async () => {
			throw new Error("redis down");
		},
	});
	const req = createRequest({ method: "POST", body: { event: "confetti" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 202);
	assert.deepEqual(res.jsonBody, { ok: true });
});
