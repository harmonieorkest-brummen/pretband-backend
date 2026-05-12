import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { handleCors } from "./_lib/cors.js";
import { signToken } from "./_lib/jwt.js";

type AuthDependencies = {
	handleCors: typeof handleCors;
	comparePassword: typeof bcrypt.compare;
	signToken: typeof signToken;
};

const defaultDependencies: AuthDependencies = {
	handleCors,
	comparePassword: bcrypt.compare,
	signToken,
};

export function createAuthHandler(dependencies = defaultDependencies) {
	return async function handler(req: VercelRequest, res: VercelResponse) {
		if (dependencies.handleCors(req, res)) return;

		if (req.method !== "POST") {
			return res.status(405).json({ error: "Method not allowed" });
		}

		const { password } = (req.body ?? {}) as { password?: string };

		if (!password || typeof password !== "string") {
			return res.status(400).json({ error: "Missing password" });
		}

		const hash = process.env.ADMIN_PASSWORD_HASH;
		if (!hash) {
			console.error("ADMIN_PASSWORD_HASH env var is not set");
			return res.status(500).json({ error: "Server misconfiguration" });
		}

		const valid = await dependencies.comparePassword(password, hash);
		if (!valid) {
			// Consistent timing response to prevent brute-force probing
			return res.status(401).json({ error: "Invalid password" });
		}

		const token = await dependencies.signToken();
		return res.status(200).json({ token });
	};
}

export default createAuthHandler();
