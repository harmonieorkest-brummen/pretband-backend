import { createClient } from "redis";
import type { AgendaData, MembersData } from "./types.js";

type RedisClient = {
	keys(pattern: string): Promise<string[]>;
	sMembers(key: string): Promise<string[]>;
	del(keys: string[]): Promise<unknown>;
	sAdd(key: string, members: string[]): Promise<unknown>;
	hGetAll(key: string): Promise<Record<string, string>>;
	ttl(key: string): Promise<number>;
	hSet(key: string, data: Record<string, string>): Promise<unknown>;
	expireAt(key: string, timestamp: number): Promise<unknown>;
};

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
	};
}

const store = createRedisStore(getClient);

export const { getMembers, setMembers, getAgenda, setAgenda } = store;
