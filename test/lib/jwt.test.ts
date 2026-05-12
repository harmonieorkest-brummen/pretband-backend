import assert from "node:assert/strict";
import test from "node:test";
import { requireAuth, signToken, verifyToken } from "../../api/_lib/jwt.js";
import { withEnvAsync } from "../helpers/env.js";
import { createRequest, createResponse } from "../helpers/http.js";

test("signToken creates a verifiable admin token with the configured secret", async () => {
	await withEnvAsync({ JWT_SECRET: "test-secret" }, async () => {
		const token = await signToken();
		const payload = await verifyToken(token);

		assert.equal(payload.admin, true);
		assert.equal(payload.iss, "pretband-api");
		assert.equal(payload.aud, "pretband-admin");
		assert.equal(typeof payload.iat, "number");
		assert.equal(typeof payload.exp, "number");
		assert.ok((payload.exp ?? 0) > (payload.iat ?? 0));
	});
});

test("signToken rejects when JWT_SECRET is missing", async () => {
	await withEnvAsync({ JWT_SECRET: undefined }, async () => {
		await assert.rejects(signToken, /JWT_SECRET env var is not set/);
	});
});

test("verifyToken rejects tokens signed with a different secret", async () => {
	const token = await withEnvAsync({ JWT_SECRET: "first-secret" }, signToken);

	await withEnvAsync({ JWT_SECRET: "second-secret" }, async () => {
		await assert.rejects(() => verifyToken(token));
	});
});

test("verifyToken rejects tampered tokens", async () => {
	await withEnvAsync({ JWT_SECRET: "test-secret" }, async () => {
		const token = await signToken();
		const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

		await assert.rejects(() => verifyToken(tampered));
	});
});

test("requireAuth responds 401 when the Authorization header is missing", async () => {
	const req = createRequest({ headers: {} });
	const res = createResponse();

	const payload = await requireAuth(req, res);

	assert.equal(payload, null);
	assert.equal(res.statusCode, 401);
	assert.deepEqual(res.jsonBody, { error: "Missing authorization token" });
});

test("requireAuth responds 401 when the Authorization header is not Bearer", async () => {
	const req = createRequest({ headers: { authorization: "Basic abc" } });
	const res = createResponse();

	const payload = await requireAuth(req, res);

	assert.equal(payload, null);
	assert.equal(res.statusCode, 401);
	assert.deepEqual(res.jsonBody, { error: "Missing authorization token" });
});

test("requireAuth responds 401 when the token is invalid", async () => {
	await withEnvAsync({ JWT_SECRET: "test-secret" }, async () => {
		const req = createRequest({
			headers: { authorization: "Bearer not-a-token" },
		});
		const res = createResponse();

		const payload = await requireAuth(req, res);

		assert.equal(payload, null);
		assert.equal(res.statusCode, 401);
		assert.deepEqual(res.jsonBody, { error: "Invalid or expired token" });
	});
});

test("requireAuth returns the token payload without writing a response for valid tokens", async () => {
	await withEnvAsync({ JWT_SECRET: "test-secret" }, async () => {
		const token = await signToken();
		const req = createRequest({
			headers: { authorization: `Bearer ${token}` },
		});
		const res = createResponse();

		const payload = await requireAuth(req, res);

		assert.equal(payload?.admin, true);
		assert.equal(res.statusCode, undefined);
		assert.equal(res.jsonBody, undefined);
		assert.equal(res.ended, false);
	});
});
