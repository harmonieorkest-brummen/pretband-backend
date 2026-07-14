import assert from "node:assert/strict";
import test from "node:test";
import { createTrafficReader } from "../../api/_lib/ga4.js";
import { withEnvAsync } from "../helpers/env.js";

const SA = '{"client_email":"svc@example.iam","private_key":"pk"}';

function fakeFetch(response: {
	ok: boolean;
	status?: number;
	json: () => Promise<unknown>;
}) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const impl = (async (url: string | URL, init?: RequestInit) => {
		calls.push({ url: String(url), init });
		return response;
	}) as unknown as typeof fetch;
	return { impl, calls };
}

test("getTraffic reports not-configured when env vars are absent", async () => {
	await withEnvAsync(
		{ GA4_PROPERTY_ID: undefined, GA4_SA_KEY: undefined },
		async () => {
			const getTraffic = createTrafficReader();
			const result = await getTraffic();
			assert.deepEqual(result, { connected: false, reason: "not_configured" });
		},
	);
});

test("getTraffic returns parsed metrics on a successful report", async () => {
	await withEnvAsync(
		{ GA4_PROPERTY_ID: "123456789", GA4_SA_KEY: SA },
		async () => {
			const { impl, calls } = fakeFetch({
				ok: true,
				json: async () => ({
					rows: [{ metricValues: [{ value: "55" }, { value: "321" }] }],
				}),
			});
			const getTraffic = createTrafficReader({
				fetchImpl: impl,
				getToken: async () => "access-token",
			});

			const result = await getTraffic();

			assert.equal(result.connected, true);
			if (result.connected) {
				assert.equal(result.activeUsers, 55);
				assert.equal(result.pageViews, 321);
				assert.equal(result.rangeDays, 28);
			}
			// Called the runReport endpoint for the configured property, with the token.
			assert.match(calls[0].url, /properties\/123456789:runReport$/);
			assert.equal(
				(calls[0].init?.headers as Record<string, string>).Authorization,
				"Bearer access-token",
			);
		},
	);
});

test("getTraffic defaults missing metric values to zero", async () => {
	await withEnvAsync(
		{ GA4_PROPERTY_ID: "1", GA4_SA_KEY: SA },
		async () => {
			const { impl } = fakeFetch({ ok: true, json: async () => ({ rows: [] }) });
			const getTraffic = createTrafficReader({
				fetchImpl: impl,
				getToken: async () => "t",
			});
			const result = await getTraffic();
			assert.equal(result.connected, true);
			if (result.connected) {
				assert.equal(result.activeUsers, 0);
				assert.equal(result.pageViews, 0);
			}
		},
	);
});

test("getTraffic fails safe when the report request is not ok", async () => {
	await withEnvAsync(
		{ GA4_PROPERTY_ID: "1", GA4_SA_KEY: SA },
		async () => {
			const { impl } = fakeFetch({ ok: false, status: 403, json: async () => ({}) });
			const getTraffic = createTrafficReader({
				fetchImpl: impl,
				getToken: async () => "t",
			});
			const result = await getTraffic();
			assert.equal(result.connected, false);
			if (!result.connected) assert.match(result.reason, /runReport failed: 403/);
		},
	);
});

test("getTraffic fails safe when token retrieval throws", async () => {
	await withEnvAsync(
		{ GA4_PROPERTY_ID: "1", GA4_SA_KEY: SA },
		async () => {
			const { impl } = fakeFetch({ ok: true, json: async () => ({}) });
			const getTraffic = createTrafficReader({
				fetchImpl: impl,
				getToken: async () => {
					throw new Error("bad key");
				},
			});
			const result = await getTraffic();
			assert.equal(result.connected, false);
		},
	);
});

test("getTraffic fails safe when the service-account JSON is invalid", async () => {
	await withEnvAsync(
		{ GA4_PROPERTY_ID: "1", GA4_SA_KEY: "not-json" },
		async () => {
			const getTraffic = createTrafficReader({ getToken: async () => "t" });
			const result = await getTraffic();
			assert.equal(result.connected, false);
		},
	);
});
