import { createClient } from "redis";
import type { AgendaData, MembersData } from "./types.js";

const client = await createClient({ url: process.env.REDIS_URL }).connect();

export const getMembers = async (): Promise<MembersData | null> => {
	const keys = await client.keys("section:*:members");
	if (!keys.length) return { sections: [] };

	const sections: MembersData["sections"] = [];
	for (const key of keys) {
		const names = await client.sMembers(key);
		const sectionKey = key.split(":")[1];
		sections.push({ key: sectionKey, names });
	}

	return { sections };
};

export const setMembers = async (data: MembersData) => {
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
};

export const getAgenda = async (): Promise<AgendaData | null> => {
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
};

export const setAgenda = async (data: AgendaData) => {
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
};
