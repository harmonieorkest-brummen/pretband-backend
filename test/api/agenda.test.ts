import assert from "node:assert/strict";
import test from "node:test";
import { createAgendaHandler } from "../../api/agenda.js";
import type { AgendaData } from "../../api/_lib/types.js";
import { createRequest, createResponse } from "../helpers/http.js";

const agenda: AgendaData = {
	events: [
		{
			id: "show-1",
			date: "2026-06-01",
			title: "Summer show",
			location: "Amsterdam",
		},
	],
};

test("agenda handler stops on CORS preflight before touching data or auth", async () => {
	let authCalls = 0;
	let getCalls = 0;
	let setCalls = 0;
	const handler = createAgendaHandler({
		handleCors: () => true,
		requireAuth: async () => {
			authCalls += 1;
			return { admin: true };
		},
		getAgenda: async () => {
			getCalls += 1;
			return agenda;
		},
		setAgenda: async () => {
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

test("agenda handler returns public agenda data for GET without requiring auth", async () => {
	let authCalls = 0;
	const handler = createAgendaHandler({
		handleCors: () => false,
		requireAuth: async () => {
			authCalls += 1;
			return null;
		},
		getAgenda: async () => agenda,
		setAgenda: async () => {
			throw new Error("setAgenda should not be called");
		},
	});
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.jsonBody, agenda);
	assert.equal(authCalls, 0);
});

test("agenda handler lets requireAuth send the unauthorized PUT response", async () => {
	let setCalls = 0;
	const handler = createAgendaHandler({
		handleCors: () => false,
		requireAuth: async (_req, res) => {
			res.status(401).json({ error: "Missing authorization token" });
			return null;
		},
		getAgenda: async () => agenda,
		setAgenda: async () => {
			setCalls += 1;
		},
	});
	const req = createRequest({ method: "PUT", body: agenda });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 401);
	assert.deepEqual(res.jsonBody, { error: "Missing authorization token" });
	assert.equal(setCalls, 0);
});

test("agenda handler rejects invalid PUT payloads after successful auth", async () => {
	const handler = createAgendaHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getAgenda: async () => agenda,
		setAgenda: async () => {
			throw new Error("setAgenda should not be called");
		},
	});

	for (const body of [undefined, {}, { events: "not-array" }, { sections: [] }]) {
		const req = createRequest({ method: "PUT", body });
		const res = createResponse();

		await handler(req, res);

		assert.equal(res.statusCode, 400);
		assert.deepEqual(res.jsonBody, {
			error: "Invalid agenda payload: expected { events: [...] }",
		});
	}
});

test("agenda handler stores valid PUT payloads and returns ok", async () => {
	const stored: AgendaData[] = [];
	const handler = createAgendaHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getAgenda: async () => ({ events: [] }),
		setAgenda: async (data) => {
			stored.push(data);
		},
	});
	const req = createRequest({
		method: "PUT",
		body: agenda,
	});
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.deepEqual(res.jsonBody, { ok: true });
	assert.deepEqual(stored, [agenda]);
});

test("agenda handler rejects unsupported methods", async () => {
	const handler = createAgendaHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		getAgenda: async () => agenda,
		setAgenda: async () => {
			throw new Error("setAgenda should not be called");
		},
	});
	const req = createRequest({ method: "DELETE" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 405);
	assert.deepEqual(res.jsonBody, { error: "Method not allowed" });
});
