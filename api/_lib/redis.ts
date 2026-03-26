import { createClient } from "redis";
import type { AgendaData, MembersData } from "./types";

const client = createClient({ url: process.env.REDIS_URL });

export const getMembers = async () => {
	const members = await client.get("members");
	if (!members) {
		return null;
	}
	return JSON.parse(members);
};

export const setMembers = async (members: MembersData) => {
	await client.set("members", JSON.stringify(members));
};

export const getAgenda = async () => {
	const agenda = await client.get("agenda");
	if (!agenda) {
		return null;
	}
	return JSON.parse(agenda);
};

export const setAgenda = async (agenda: AgendaData) => {
	await client.set("agenda", JSON.stringify(agenda));
};
