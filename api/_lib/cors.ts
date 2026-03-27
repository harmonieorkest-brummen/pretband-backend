import type { VercelRequest, VercelResponse } from "@vercel/node";

const ALLOWED_ORIGINS = [
	"https://pretband.nl",
	"http://localhost:5173"
];

/** Call at the top of every handler. Returns true if the request was an
 *  OPTIONS preflight that has already been answered — in that case just return. */
export function handleCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin || "";

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "https://pretband.nl");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
