import assert from "node:assert/strict";
import test from "node:test";
import { createGalleryHandler } from "../../api/gallery.js";
import { createRequest, createResponse } from "../helpers/http.js";

test("gallery handler stops on CORS preflight", async () => {
	const handler = createGalleryHandler({
		handleCors: () => true,
		requireAuth: async () => null,
		list: async () => { throw new Error("Should not be called"); },
		put: async () => { throw new Error("Should not be called"); },
		del: async () => { throw new Error("Should not be called"); },
	});
	const req = createRequest({ method: "OPTIONS" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, undefined);
});

test("gallery GET returns list of sorted blob urls", async () => {
	let listCalls = 0;
	const handler = createGalleryHandler({
		handleCors: () => false,
		requireAuth: async () => null,
		list: async () => {
			listCalls++;
			return {
				blobs: [
					{ url: "img1.jpg", uploadedAt: new Date("2023-01-01") },
					{ url: "img2.jpg", uploadedAt: new Date("2024-01-01") },
				],
			} as any;
		},
		put: async () => { throw new Error("Should not be called"); },
		del: async () => { throw new Error("Should not be called"); },
	});
	const req = createRequest({ method: "GET" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.equal(listCalls, 1);
	// Sorted descending by date
	assert.deepEqual(res.jsonBody, { images: ["img2.jpg", "img1.jpg"] });
});

test("gallery POST handles missing auth", async () => {
	const handler = createGalleryHandler({
		handleCors: () => false,
		requireAuth: async (_req, res) => {
			res.status(401).json({ error: "Unauthorized" });
			return null;
		},
		list: async () => { throw new Error("Should not be called"); },
		put: async () => { throw new Error("Should not be called"); },
		del: async () => { throw new Error("Should not be called"); },
	});
	const req = createRequest({ method: "POST" });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 401);
});

test("gallery POST validates input payload", async () => {
	const handler = createGalleryHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		list: async () => { throw new Error("Should not be called"); },
		put: async () => { throw new Error("Should not be called"); },
		del: async () => { throw new Error("Should not be called"); },
	});
	
	const req = createRequest({
		method: "POST",
		body: { filename: "test.jpg", contentType: "image/gif", content: "abc" },
	});
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 400);
	assert.deepEqual(res.jsonBody, { error: "Unsupported file type" });
});

test("gallery POST uploads valid file and returns URL", async () => {
	let putCalls = 0;
	const handler = createGalleryHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		list: async () => { throw new Error("Should not be called"); },
		put: async (filename, _buffer, _options) => {
			putCalls++;
			return { url: `https://blob/${filename}` } as any;
		},
		del: async () => { throw new Error("Should not be called"); },
	});
	
	const req = createRequest({
		method: "POST",
		body: { filename: "test.png", contentType: "image/png", content: "dGVzdA==" },
	});
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.equal(putCalls, 1);
	assert.equal((res.jsonBody as any).url.startsWith("https://blob/gallery/"), true);
});

test("gallery DELETE deletes an existing blob in the gallery/ namespace", async () => {
	let delCalls = 0;
	const url = "https://abc.public.blob.vercel-storage.com/gallery/123-test.png";
	const handler = createGalleryHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		list: async () => { throw new Error("Should not be called"); },
		put: async () => { throw new Error("Should not be called"); },
		del: async (target) => {
			assert.equal(target, url);
			delCalls++;
		},
	});

	const req = createRequest({ method: "DELETE", body: { url } });
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 200);
	assert.equal(delCalls, 1);
	assert.deepEqual(res.jsonBody, { ok: true });
});

test("gallery DELETE refuses a blob outside the gallery/ namespace", async () => {
	let delCalls = 0;
	const handler = createGalleryHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		list: async () => { throw new Error("Should not be called"); },
		put: async () => { throw new Error("Should not be called"); },
		del: async () => {
			delCalls++;
		},
	});

	const req = createRequest({
		method: "DELETE",
		body: { url: "https://abc.public.blob.vercel-storage.com/secrets/prod.env" },
	});
	const res = createResponse();

	await handler(req, res);

	assert.equal(res.statusCode, 400);
	assert.equal(delCalls, 0);
	assert.deepEqual(res.jsonBody, {
		error: "Refusing to delete a blob outside the gallery/ namespace",
	});
});

test("gallery DELETE rejects a missing or malformed url", async () => {
	const handler = createGalleryHandler({
		handleCors: () => false,
		requireAuth: async () => ({ admin: true }),
		list: async () => { throw new Error("Should not be called"); },
		put: async () => { throw new Error("Should not be called"); },
		del: async () => { throw new Error("Should not be called"); },
	});

	for (const body of [undefined, {}, { url: "" }, { url: "not-a-url" }]) {
		const req = createRequest({ method: "DELETE", body });
		const res = createResponse();
		await handler(req, res);
		assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(body)}`);
	}
});
