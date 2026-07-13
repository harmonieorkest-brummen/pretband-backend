import assert from "node:assert/strict";
import test from "node:test";
import { createMembersHandler } from "../../api/members.js";
import type { MembersData } from "../../api/_lib/types.js";
import { createRequest, createResponse } from "../helpers/http.js";

const members: MembersData = {
	sections: [
		{ key: "trumpets", names: ["Ada", "Ben"] },
		{ key: "drums", names: ["Chris"] },
	],
};

test("members handler stops on CORS preflight before touching data or auth", async () => {
	let authCalls = 0;
	let getCalls = 0;
	let setCalls = 0;
	const handler = createMembersHandler({
		handleCors: () => true,
		requireAuth: async () => {
			authCalls += 1;
			return { admin: true };
		},
		getMembers: async () => {
			getCalls += 1;
			return members;
		},
		setMembers: async () => {
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

test("members handler returns public members data for GET without requiring auth", async () => {
	let authCalls = 0;
	const handler = createMembersHandler({
		handleCors: () => false,
		requireAuth: async () => {
			authCalls += 1;
			return null;
		},
		getMembers: async () => members,
		setMembers: async () => {
			throw new Error("setMembers should not be called");
		},
	});
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.jsonBody, members);
	assert.equal(authCalls, 0);
});

test("members handler lets requireAuth send the unauthorized PUT response", async () => {
	let setCalls = 0;
	const handler = createMembersHandler({
		handleCors: () => false,
		requireAuth: async (_req, res) => {
			res.status(401).json({ error: "Invalid or expired token" });
			return null;
		},
		getMembers: async () => members,
		setMembers: async () => {
			setCalls += 1;
		},
	});
	const req = createRequest({ method: "PUT", body: members });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 401);
	assert.deepEqual(res.jsonBody, { error: "Invalid or expired token" });
	assert.equal(setCalls, 0);
});

test("members handler rejects invalid PUT payloads after successful auth", async () => {
	const handler = createMembersHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getMembers: async () => members,
		setMembers: async () => {
			throw new Error("setMembers should not be called");
		},
	});

	for (const body of [
		undefined,
		{},
		{ sections: "not-array" },
		{ events: [] },
	]) {
		const req = createRequest({ method: "PUT", body });
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 400);
		assert.deepEqual(res.jsonBody, {
			error: "Invalid members payload: expected { sections: [...] }",
		});
	}
});

test("members handler rejects section keys and names that are unsafe", async () => {
	const handler = createMembersHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getMembers: async () => members,
		setMembers: async () => {
			throw new Error("setMembers should not be called");
		},
	});

	const badBodies = [
		{ sections: [{ key: "bad:key", names: [] }] }, // colon in key
		{ sections: [{ key: "has space", names: [] }] }, // whitespace in key
		{ sections: [{ key: "", names: [] }] }, // empty key
		{ sections: [{ key: "ok", names: [123] }] }, // non-string name
		{ sections: [{ key: "ok", names: "nope" }] }, // names not an array
	];

	for (const body of badBodies) {
		const req = createRequest({ method: "PUT", body });
		const res = createResponse();
		await handler(req, res);
		assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(body)}`);
	}
});

test("members handler stores valid PUT payloads and returns ok", async () => {
	const stored: MembersData[] = [];
	const handler = createMembersHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getMembers: async () => ({ sections: [] }),
		setMembers: async (data) => {
			stored.push(data);
		},
	});
	const req = createRequest({
		method: "PUT",
		body: members,
	});
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.jsonBody, { ok: true });
	assert.deepEqual(stored, [members]);
});

test("members handler rejects unsupported methods", async () => {
	const handler = createMembersHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getMembers: async () => members,
		setMembers: async () => {
			throw new Error("setMembers should not be called");
		},
	});
	const req = createRequest({ method: "PATCH" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 405);
	assert.deepEqual(res.jsonBody, { error: "Method not allowed" });
});
