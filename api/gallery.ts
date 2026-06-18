import { del, list, put } from "@vercel/blob";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handleCors } from "./_lib/cors.js";
import { requireAuth } from "./_lib/jwt.js";

type GalleryDependencies = {
	handleCors: typeof handleCors;
	requireAuth: typeof requireAuth;
};

const defaultDependencies: GalleryDependencies = {
	handleCors,
	requireAuth,
};

export function createGalleryHandler(dependencies = defaultDependencies) {
	return async function handler(req: VercelRequest, res: VercelResponse) {
		if (dependencies.handleCors(req, res)) return;

		// ── GET — public ──────────────────────────────────────
		if (req.method === "GET") {
			try {
				const { blobs } = await list({ prefix: "gallery/" });
				
				// Sort by uploadedAt descending (newest first)
				const sortedBlobs = blobs.sort((a, b) => 
					b.uploadedAt.getTime() - a.uploadedAt.getTime()
				);
				
				return res.status(200).json({ images: sortedBlobs.map(b => b.url) });
			} catch (error) {
				console.error("Error listing blobs:", error);
				return res.status(500).json({ error: "Failed to list gallery images" });
			}
		}

		// ── POST — protected (upload) ─────────────────────────
		if (req.method === "POST") {
			const auth = await dependencies.requireAuth(req, res);
			if (!auth) return; // requireAuth already sent 401

			try {
				const { filename, contentType, content } = req.body;
				
				if (!filename || !contentType || !content) {
					return res.status(400).json({ error: "Missing filename, contentType, or content" });
				}

				// Basic validation
				const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
				if (!allowedTypes.includes(contentType)) {
					return res.status(400).json({ error: "Unsupported file type" });
				}

				// The content is a base64 encoded string from the frontend
				const buffer = Buffer.from(content, "base64");
				
				// Generate a safe unique filename to avoid overwrites
				const uniqueFilename = `gallery/${Date.now()}-${filename.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

				const blob = await put(uniqueFilename, buffer, {
					access: "public",
					contentType: contentType,
				});

				return res.status(200).json({ url: blob.url });
			} catch (error) {
				console.error("Error uploading blob:", error);
				return res.status(500).json({ error: "Failed to upload image" });
			}
		}

		// ── DELETE — protected ────────────────────────────────
		if (req.method === "DELETE") {
			const auth = await dependencies.requireAuth(req, res);
			if (!auth) return;

			try {
				const { url } = req.body;
				if (!url) {
					return res.status(400).json({ error: "Missing url" });
				}

				await del(url);
				return res.status(200).json({ ok: true });
			} catch (error) {
				console.error("Error deleting blob:", error);
				return res.status(500).json({ error: "Failed to delete image" });
			}
		}

		return res.status(405).json({ error: "Method not allowed" });
	};
}

export default createGalleryHandler();
