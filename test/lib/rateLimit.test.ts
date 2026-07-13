import assert from "node:assert/strict";
import test from "node:test";
import type { VercelRequest } from "@vercel/node";
import {
	clientIp,
	createLoginRateLimiter,
	RATE_LIMIT_MAX_ATTEMPTS,
} from "../../api/_lib/rateLimit.js";

function reqWith(headers: Record<string, unknown>, socket?: unknown): VercelRequest {
	return { headers, socket } as unknown as VercelRequest;
}

test("clientIp reads the first x-forwarded-for entry (string)", () => {
	assert.equal(
		clientIp(reqWith({ "x-forwarded-for": "203.0.113.5, 70.41.3.18" })),
		"203.0.113.5",
	);
});

test("clientIp reads the first x-forwarded-for entry (array)", () => {
	assert.equal(clientIp(reqWith({ "x-forwarded-for": ["198.51.100.9"] })), "198.51.100.9");
});

test("clientIp falls back to the socket address, then to 'unknown'", () => {
	assert.equal(clientIp(reqWith({}, { remoteAddress: "10.0.0.1" })), "10.0.0.1");
	assert.equal(clientIp(reqWith({})), "unknown");
});

test("createLoginRateLimiter allows up to the max, then rejects", async () => {
	let count = 0;
	const check = createLoginRateLimiter(async () => {
		count += 1;
		return count;
	});
	const req = reqWith({ "x-forwarded-for": "1.2.3.4" });

	for (let i = 0; i < RATE_LIMIT_MAX_ATTEMPTS; i++) {
		assert.equal(await check(req), true, `attempt ${i + 1} should be allowed`);
	}
	// The (max + 1)th hit returns max+1, which exceeds the limit.
	assert.equal(await check(req), false, "over-limit attempt should be rejected");
});

test("createLoginRateLimiter fails OPEN when the counter throws", async () => {
	const check = createLoginRateLimiter(async () => {
		throw new Error("redis down");
	});

	assert.equal(await check(reqWith({ "x-forwarded-for": "1.2.3.4" })), true);
});
