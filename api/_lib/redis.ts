import { createClient } from "redis";
import type { AgendaData, MembersData, RedirectsData } from "./types.js";

type RedisClient = {
	keys(pattern: string): Promise<string[]>;
	sMembers(key: string): Promise<string[]>;
	del(keys: string[]): Promise<unknown>;
	sAdd(key: string, members: string[]): Promise<unknown>;
	hGetAll(key: string): Promise<Record<string, string>>;
	ttl(key: string): Promise<number>;
	hSet(key: string, data: Record<string, string>): Promise<unknown>;
	expireAt(key: string, timestamp: number): Promise<unknown>;
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<unknown>;
	incr(key: string): Promise<number>;
	expire(key: string, seconds: number): Promise<unknown>;
};

const REDIRECT_PREFIX = "redirect:";

let clientPromise: Promise<RedisClient> | null = null;

function getClient(): Promise<RedisClient> {
	clientPromise ??= createClient({ url: process.env.REDIS_URL }).connect();
	return clientPromise;
}

export function createRedisStore(
	resolveClient: () => Promise<RedisClient> | RedisClient,
) {
	return {
		getMembers: async (): Promise<MembersData | null> => {
			const client = await resolveClient();
			const keys = await client.keys("section:*:members");
			if (!keys.length) return { sections: [] };

			const sections: MembersData["sections"] = [];
			for (const key of keys) {
				const names = await client.sMembers(key);
				const sectionKey = key.split(":")[1];
				sections.push({ key: sectionKey, names });
			}

			return { sections };
		},

		setMembers: async (data: MembersData) => {
			const client = await resolveClient();
			const existingKeys = await client.keys("section:*:members");
			if (existingKeys.length > 0) {
				await client.del(existingKeys);
			}

			for (const section of data.sections) {
				if (section.names && section.names.length > 0) {
					const key = `section:${section.key}:members`;
					await client.sAdd(key, section.names);
				}
			}
		},

		getAgenda: async (): Promise<AgendaData | null> => {
			const client = await resolveClient();
			const keys = await client.keys("event:*");
			if (!keys.length) return { events: [] };

			const events: AgendaData["events"] = [];
			for (const key of keys) {
				const id = key.split(":")[1];
				const [data, ttlSeconds] = await Promise.all([
					client.hGetAll(key),
					client.ttl(key),
				]);

				const event: (typeof events)[number] = {
					id,
					date: data.date || "",
					title: data.title || "",
					location: data.location || "",
				};

				if (ttlSeconds > 0) {
					event.daysUntilDeletion = Math.floor(ttlSeconds / (60 * 60 * 24));
				}

				events.push(event);
			}

			// Sort events by date
			events.sort(
				(a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
			);

			return { events };
		},

		setAgenda: async (data: AgendaData) => {
			const client = await resolveClient();
			const existingKeys = await client.keys("event:*");
			if (existingKeys.length > 0) {
				await client.del(existingKeys);
			}

			for (const event of data.events) {
				const key = `event:${event.id}`;
				await client.hSet(key, {
					date: event.date || "",
					title: event.title || "",
					location: event.location || "",
				});

				if (event.date) {
					const dateObj = new Date(event.date);
					if (!Number.isNaN(dateObj.getTime())) {
						dateObj.setMonth(dateObj.getMonth() + 1);
						// Expire 1 month after the event date
						await client.expireAt(key, Math.floor(dateObj.getTime() / 1000));
					}
				}
			}
		},

		getRedirects: async (): Promise<RedirectsData> => {
			const client = await resolveClient();
			const keys = await client.keys(`${REDIRECT_PREFIX}*`);

			const redirects: RedirectsData["redirects"] = [];
			for (const key of keys) {
				const slug = key.slice(REDIRECT_PREFIX.length);
				const data = await client.hGetAll(key);
				if (!data.url) continue;

				const scansRaw = await client.get(`scans:${slug}`);
				redirects.push({
					slug,
					url: data.url,
					label: data.label || "",
					scans: scansRaw ? Number.parseInt(scansRaw, 10) || 0 : 0,
				});
			}

			redirects.sort((a, b) => a.slug.localeCompare(b.slug));
			return { redirects };
		},

		// Single lookup used by the public /r/:slug redirect endpoint.
		getRedirect: async (slug: string): Promise<{ url: string } | null> => {
			const client = await resolveClient();
			const data = await client.hGetAll(`${REDIRECT_PREFIX}${slug}`);
			if (!data?.url) return null;
			return { url: data.url };
		},

		setRedirects: async (data: RedirectsData) => {
			const client = await resolveClient();
			const existingKeys = await client.keys(`${REDIRECT_PREFIX}*`);
			if (existingKeys.length > 0) {
				await client.del(existingKeys);
			}

			for (const redirect of data.redirects) {
				await client.hSet(`${REDIRECT_PREFIX}${redirect.slug}`, {
					url: redirect.url,
					label: redirect.label || "",
				});
			}
			// scans:* counters are intentionally left untouched so scan totals
			// survive config edits. Removed slugs leave a harmless orphan counter.
		},

		// Fire-and-forget scan counter; failures must never block a redirect.
		bumpScan: async (slug: string) => {
			const client = await resolveClient();
			await client.incr(`scans:${slug}`);
		},

		// Fixed-window counter for login throttling. Increments the counter for
		// `identifier` and, on the first hit of a window, sets its expiry.
		// Returns the current count within the window.
		hitLoginRateLimit: async (
			identifier: string,
			windowSeconds: number,
		): Promise<number> => {
			const client = await resolveClient();
			const key = `ratelimit:login:${identifier}`;
			const count = await client.incr(key);
			if (count === 1) {
				await client.expire(key, windowSeconds);
			}
			return count;
		},

		// ── Dashboard stat counters ──────────────────────────
		// Callers pass fixed, trusted keys (never raw user input).

		/** Increment an all-time counter and return the new total. */
		incrementStat: async (key: string): Promise<number> => {
			const client = await resolveClient();
			return client.incr(key);
		},

		/** Increment a windowed counter, setting its TTL on the first hit. */
		incrementStatWithTtl: async (
			key: string,
			ttlSeconds: number,
		): Promise<number> => {
			const client = await resolveClient();
			const count = await client.incr(key);
			if (count === 1) {
				await client.expire(key, ttlSeconds);
			}
			return count;
		},

		/** Read a numeric counter; returns 0 when absent or unparseable. */
		readStat: async (key: string): Promise<number> => {
			const client = await resolveClient();
			const raw = await client.get(key);
			return raw ? Number.parseInt(raw, 10) || 0 : 0;
		},

		/** Store a raw string value (e.g. a timestamp). */
		setStat: async (key: string, value: string): Promise<void> => {
			const client = await resolveClient();
			await client.set(key, value);
		},

		/** Read a raw string value; null when absent. */
		readRawStat: async (key: string): Promise<string | null> => {
			const client = await resolveClient();
			return client.get(key);
		},
	};
}

const store = createRedisStore(getClient);

export const {
	getMembers,
	setMembers,
	getAgenda,
	setAgenda,
	getRedirects,
	getRedirect,
	setRedirects,
	bumpScan,
	hitLoginRateLimit,
	incrementStat,
	incrementStatWithTtl,
	readStat,
	setStat,
	readRawStat,
} = store;
