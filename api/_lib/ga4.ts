import { importPKCS8, SignJWT } from "jose";

/**
 * Minimal Google Analytics 4 (Data API) traffic reader.
 *
 * Configuration (Vercel env, all optional — absent = "not connected"):
 *   GA4_PROPERTY_ID  — numeric GA4 property id, e.g. "123456789"
 *   GA4_SA_KEY       — the full service-account JSON key, as one string
 *
 * Always fails safe: any misconfiguration or API error yields
 * { connected: false }, so the dashboard never breaks because of GA.
 */

export type TrafficStats =
	| { connected: false; reason: string }
	| { connected: true; rangeDays: number; activeUsers: number; pageViews: number };

type ServiceAccount = { client_email: string; private_key: string };
type FetchImpl = typeof fetch;
type GetToken = (sa: ServiceAccount) => Promise<string>;

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const RANGE_DAYS = 28;

/** Exchange a service-account key for a short-lived OAuth access token. */
async function fetchAccessToken(
	sa: ServiceAccount,
	fetchImpl: FetchImpl,
): Promise<string> {
	const key = await importPKCS8(sa.private_key, "RS256");
	const now = Math.floor(Date.now() / 1000);
	const assertion = await new SignJWT({ scope: SCOPE })
		.setProtectedHeader({ alg: "RS256", typ: "JWT" })
		.setIssuer(sa.client_email)
		.setSubject(sa.client_email)
		.setAudience(TOKEN_URL)
		.setIssuedAt(now)
		.setExpirationTime(now + 3600)
		.sign(key);

	const res = await fetchImpl(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion,
		}),
	});
	if (!res.ok) throw new Error(`token request failed: ${res.status}`);
	const json = (await res.json()) as { access_token?: string };
	if (!json.access_token) throw new Error("no access_token in response");
	return json.access_token;
}

type Ga4Report = {
	rows?: { metricValues?: { value?: string }[] }[];
};

function parseReport(data: Ga4Report): TrafficStats {
	const values = data.rows?.[0]?.metricValues ?? [];
	return {
		connected: true,
		rangeDays: RANGE_DAYS,
		activeUsers: Number.parseInt(values[0]?.value ?? "0", 10) || 0,
		pageViews: Number.parseInt(values[1]?.value ?? "0", 10) || 0,
	};
}

/**
 * Builds a traffic reader. `getToken` and `fetchImpl` are injectable so the
 * report-parsing path can be tested without real Google credentials.
 */
export function createTrafficReader(
	deps: { fetchImpl?: FetchImpl; getToken?: GetToken } = {},
) {
	const fetchImpl = deps.fetchImpl ?? fetch;
	const getToken = deps.getToken ?? ((sa) => fetchAccessToken(sa, fetchImpl));

	return async function getTraffic(): Promise<TrafficStats> {
		const propertyId = process.env.GA4_PROPERTY_ID;
		const saRaw = process.env.GA4_SA_KEY;
		if (!propertyId || !saRaw) {
			return { connected: false, reason: "not_configured" };
		}
		try {
			const sa = JSON.parse(saRaw) as ServiceAccount;
			const token = await getToken(sa);
			const res = await fetchImpl(
				`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${token}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						dateRanges: [{ startDate: `${RANGE_DAYS}daysAgo`, endDate: "today" }],
						metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
					}),
				},
			);
			if (!res.ok) throw new Error(`runReport failed: ${res.status}`);
			return parseReport((await res.json()) as Ga4Report);
		} catch (err) {
			return {
				connected: false,
				reason: err instanceof Error ? err.message : "error",
			};
		}
	};
}

export const getTraffic = createTrafficReader();
