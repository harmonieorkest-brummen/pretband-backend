import type { VercelRequest, VercelResponse } from "@vercel/node";
import { type JWTPayload, jwtVerify, SignJWT } from "jose";

const ISSUER = "pretband-api";
const AUDIENCE = "pretband-admin";
const TTL = "8h"; // token expires after 8 hours

function getSecret(): Uint8Array {
	const secret = process.env.JWT_SECRET;
	if (!secret) throw new Error("JWT_SECRET env var is not set");
	return new TextEncoder().encode(secret);
}

export async function signToken(): Promise<string> {
	return new SignJWT({ admin: true })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setIssuer(ISSUER)
		.setAudience(AUDIENCE)
		.setExpirationTime(TTL)
		.sign(getSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload> {
	const { payload } = await jwtVerify(token, getSecret(), {
		issuer: ISSUER,
		audience: AUDIENCE,
	});
	return payload;
}

/** Middleware: reads Bearer token from Authorization header.
 *  Returns the payload on success, or responds 401 and returns null. */
export async function requireAuth(
	req: VercelRequest,
	res: VercelResponse,
): Promise<JWTPayload | null> {
	const header = req.headers.authorization ?? "";
	const token = header.startsWith("Bearer ") ? header.slice(7) : null;

	if (!token) {
		res.status(401).json({ error: "Missing authorization token" });
		return null;
	}

	try {
		return await verifyToken(token);
	} catch {
		res.status(401).json({ error: "Invalid or expired token" });
		return null;
	}
}
