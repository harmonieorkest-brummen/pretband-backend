import assert from "node:assert/strict";
import test from "node:test";
import { createAuthHandler } from "../../api/auth.js";
import { withEnvAsync } from "../helpers/env.js";
import { createRequest, createResponse } from "../helpers/http.js";

const allowAll = async () => true;

test("auth handler stops on CORS preflight before validating the request", async () => {
	let compared = false;
	const handler = createAuthHandler({
		handleCors: () => true,
		comparePassword: async () => {
			compared = true;
			return true;
		},
		signToken: async () => "token",
		checkRateLimit: allowAll,
	});
	const req = createRequest({ method: "OPTIONS" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(compared, false);
	assert.equal(res.statusCode, undefined);
	assert.equal(res.jsonBody, undefined);
});

test("auth handler rejects non-POST requests", async () => {
	const handler = createAuthHandler({
		handleCors: () => false,
		comparePassword: async () => true,
		signToken: async () => "token",
		checkRateLimit: allowAll,
	});
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 405);
	assert.deepEqual(res.jsonBody, { error: "Method not allowed" });
});

test("auth handler returns 429 when rate limited, without comparing the password", async () => {
	let compared = false;
	const handler = createAuthHandler({
		handleCors: () => false,
		comparePassword: async () => {
			compared = true;
			return true;
		},
		signToken: async () => "token",
		checkRateLimit: async () => false,
	});
	const req = createRequest({ method: "POST", body: { password: "whatever" } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 429);
	assert.deepEqual(res.jsonBody, {
		error: "Too many attempts. Please try again later.",
	});
	assert.equal(res.headers["Retry-After"], "900");
	assert.equal(compared, false);
});

test("auth handler rejects missing password values", async () => {
	const handler = createAuthHandler({
		handleCors: () => false,
		comparePassword: async () => true,
		signToken: async () => "token",
		checkRateLimit: allowAll,
	});

	for (const body of [undefined, {}, { password: "" }, { password: 123 }]) {
		const req = createRequest({ method: "POST", body });
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 400);
		assert.deepEqual(res.jsonBody, { error: "Missing password" });
	}
});

test("auth handler returns server misconfiguration when ADMIN_PASSWORD_HASH is missing", async () => {
	await withEnvAsync({ ADMIN_PASSWORD_HASH: undefined }, async () => {
		const previousError = console.error;
		const errors: unknown[] = [];
		console.error = (...args: unknown[]) => {
			errors.push(args);
		};
		try {
			const handler = createAuthHandler({
				handleCors: () => false,
				comparePassword: async () => true,
				signToken: async () => "token",
				checkRateLimit: allowAll,
			});
			const req = createRequest({
				method: "POST",
				body: { password: "secret" },
			});
			const res = createResponse();

			await handler(req, res);

			assert.equal(res.statusCode, 500);
			assert.deepEqual(res.jsonBody, { error: "Server misconfiguration" });
			assert.equal(errors.length, 1);
		} finally {
			console.error = previousError;
		}
	});
});

test("auth handler rejects invalid passwords without signing a token", async () => {
	await withEnvAsync({ ADMIN_PASSWORD_HASH: "stored-hash" }, async () => {
		const compareCalls: unknown[][] = [];
		let signCalls = 0;
		const handler = createAuthHandler({
			handleCors: () => false,
			comparePassword: async (...args) => {
				compareCalls.push(args);
				return false;
			},
			signToken: async () => {
				signCalls += 1;
				return "token";
			},
			checkRateLimit: allowAll,
		});
		const req = createRequest({
			method: "POST",
			body: { password: "wrong-password" },
		});
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 401);
		assert.deepEqual(res.jsonBody, { error: "Invalid password" });
		assert.deepEqual(compareCalls, [["wrong-password", "stored-hash"]]);
		assert.equal(signCalls, 0);
	});
});

test("auth handler signs and returns a token for a valid password", async () => {
	await withEnvAsync({ ADMIN_PASSWORD_HASH: "stored-hash" }, async () => {
		const compareCalls: unknown[][] = [];
		const handler = createAuthHandler({
			handleCors: () => false,
			comparePassword: async (...args) => {
				compareCalls.push(args);
				return true;
			},
			signToken: async () => "signed-token",
			checkRateLimit: allowAll,
		});
		const req = createRequest({
			method: "POST",
			body: { password: "correct-password" },
		});
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 200);
		assert.deepEqual(res.jsonBody, { token: "signed-token" });
		assert.deepEqual(compareCalls, [["correct-password", "stored-hash"]]);
	});
});

test("auth handler records a failed outcome on an invalid password", async () => {
	await withEnvAsync({ ADMIN_PASSWORD_HASH: "stored-hash" }, async () => {
		const outcomes: boolean[] = [];
		const handler = createAuthHandler({
			handleCors: () => false,
			comparePassword: async () => false,
			signToken: async () => "token",
			checkRateLimit: allowAll,
			recordLoginOutcome: async (success) => {
				outcomes.push(success);
			},
		});
		const req = createRequest({ method: "POST", body: { password: "nope" } });
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 401);
		assert.deepEqual(outcomes, [false]);
	});
});

test("auth handler records a successful outcome on a valid password", async () => {
	await withEnvAsync({ ADMIN_PASSWORD_HASH: "stored-hash" }, async () => {
		const outcomes: boolean[] = [];
		const handler = createAuthHandler({
			handleCors: () => false,
			comparePassword: async () => true,
			signToken: async () => "signed-token",
			checkRateLimit: allowAll,
			recordLoginOutcome: async (success) => {
				outcomes.push(success);
			},
		});
		const req = createRequest({ method: "POST", body: { password: "ok" } });
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 200);
		assert.deepEqual(outcomes, [true]);
	});
});
