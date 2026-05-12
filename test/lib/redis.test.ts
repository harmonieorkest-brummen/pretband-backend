import assert from "node:assert/strict";
import test from "node:test";
import { createRedisStore } from "../../api/_lib/redis.js";

type Call =
	| ["keys", string]
	| ["sMembers", string]
	| ["del", string[]]
	| ["sAdd", string, string[]]
	| ["hGetAll", string]
	| ["ttl", string]
	| ["hSet", string, Record<string, string>]
	| ["expireAt", string, number];

class FakeRedisClient {
	calls: Call[] = [];
	keyResults = new Map<string, string[]>();
	memberResults = new Map<string, string[]>();
	hashResults = new Map<string, Record<string, string>>();
	ttlResults = new Map<string, number>();

	async keys(pattern: string): Promise<string[]> {
		this.calls.push(["keys", pattern]);
		return this.keyResults.get(pattern) ?? [];
	}

	async sMembers(key: string): Promise<string[]> {
		this.calls.push(["sMembers", key]);
		return this.memberResults.get(key) ?? [];
	}

	async del(keys: string[]): Promise<void> {
		this.calls.push(["del", keys]);
	}

	async sAdd(key: string, members: string[]): Promise<void> {
		this.calls.push(["sAdd", key, members]);
	}

	async hGetAll(key: string): Promise<Record<string, string>> {
		this.calls.push(["hGetAll", key]);
		return this.hashResults.get(key) ?? {};
	}

	async ttl(key: string): Promise<number> {
		this.calls.push(["ttl", key]);
		return this.ttlResults.get(key) ?? -1;
	}

	async hSet(key: string, data: Record<string, string>): Promise<void> {
		this.calls.push(["hSet", key, data]);
	}

	async expireAt(key: string, timestamp: number): Promise<void> {
		this.calls.push(["expireAt", key, timestamp]);
	}
}

function createStore(client: FakeRedisClient) {
	return createRedisStore(() => client);
}

test("getMembers returns an empty sections array when Redis has no member keys", async () => {
	const client = new FakeRedisClient();
	const store = createStore(client);

	const members = await store.getMembers();

	assert.deepEqual(members, { sections: [] });
	assert.deepEqual(client.calls, [["keys", "section:*:members"]]);
});

test("getMembers maps section keys to section names and member lists", async () => {
	const client = new FakeRedisClient();
	client.keyResults.set("section:*:members", [
		"section:trumpets:members",
		"section:drums:members",
	]);
	client.memberResults.set("section:trumpets:members", ["Ada", "Ben"]);
	client.memberResults.set("section:drums:members", ["Chris"]);
	const store = createStore(client);

	const members = await store.getMembers();

	assert.deepEqual(members, {
		sections: [
			{ key: "trumpets", names: ["Ada", "Ben"] },
			{ key: "drums", names: ["Chris"] },
		],
	});
	assert.deepEqual(client.calls, [
		["keys", "section:*:members"],
		["sMembers", "section:trumpets:members"],
		["sMembers", "section:drums:members"],
	]);
});

test("setMembers replaces existing member keys and writes only non-empty sections", async () => {
	const client = new FakeRedisClient();
	client.keyResults.set("section:*:members", [
		"section:old-a:members",
		"section:old-b:members",
	]);
	const store = createStore(client);

	await store.setMembers({
		sections: [
			{ key: "trumpets", names: ["Ada", "Ben"] },
			{ key: "empty", names: [] },
			{ key: "drums", names: ["Chris"] },
		],
	});

	assert.deepEqual(client.calls, [
		["keys", "section:*:members"],
		["del", ["section:old-a:members", "section:old-b:members"]],
		["sAdd", "section:trumpets:members", ["Ada", "Ben"]],
		["sAdd", "section:drums:members", ["Chris"]],
	]);
});

test("setMembers skips deletion when there are no existing keys", async () => {
	const client = new FakeRedisClient();
	const store = createStore(client);

	await store.setMembers({
		sections: [{ key: "sax", names: ["Dana"] }],
	});

	assert.deepEqual(client.calls, [
		["keys", "section:*:members"],
		["sAdd", "section:sax:members", ["Dana"]],
	]);
});

test("getAgenda returns an empty events array when Redis has no event keys", async () => {
	const client = new FakeRedisClient();
	const store = createStore(client);

	const agenda = await store.getAgenda();

	assert.deepEqual(agenda, { events: [] });
	assert.deepEqual(client.calls, [["keys", "event:*"]]);
});

test("getAgenda maps hashes, sorts events by date, and adds deletion countdowns for positive TTLs", async () => {
	const client = new FakeRedisClient();
	client.keyResults.set("event:*", ["event:late", "event:early"]);
	client.hashResults.set("event:late", {
		date: "2026-08-20",
		title: "Late show",
		location: "Rotterdam",
	});
	client.hashResults.set("event:early", {
		date: "2026-01-10",
		title: "Early show",
		location: "Amsterdam",
	});
	client.ttlResults.set("event:late", 2 * 24 * 60 * 60 + 3600);
	client.ttlResults.set("event:early", -1);
	const store = createStore(client);

	const agenda = await store.getAgenda();

	assert.deepEqual(agenda, {
		events: [
			{
				id: "early",
				date: "2026-01-10",
				title: "Early show",
				location: "Amsterdam",
			},
			{
				id: "late",
				date: "2026-08-20",
				title: "Late show",
				location: "Rotterdam",
				daysUntilDeletion: 2,
			},
		],
	});
	assert.deepEqual(client.calls, [
		["keys", "event:*"],
		["hGetAll", "event:late"],
		["ttl", "event:late"],
		["hGetAll", "event:early"],
		["ttl", "event:early"],
	]);
});

test("getAgenda supplies empty strings for missing hash fields", async () => {
	const client = new FakeRedisClient();
	client.keyResults.set("event:*", ["event:minimal"]);
	client.hashResults.set("event:minimal", {});
	const store = createStore(client);

	const agenda = await store.getAgenda();

	assert.deepEqual(agenda, {
		events: [{ id: "minimal", date: "", title: "", location: "" }],
	});
});

test("setAgenda replaces existing events, writes event hashes, and expires valid dated events one month later", async () => {
	const client = new FakeRedisClient();
	client.keyResults.set("event:*", ["event:old"]);
	const store = createStore(client);
	const expiryDate = new Date("2026-03-15");
	expiryDate.setMonth(expiryDate.getMonth() + 1);

	await store.setAgenda({
		events: [
			{
				id: "spring",
				date: "2026-03-15",
				title: "Spring show",
				location: "Utrecht",
			},
			{
				id: "draft",
				date: "",
				title: "Draft show",
				location: "",
			},
		],
	});

	assert.deepEqual(client.calls, [
		["keys", "event:*"],
		["del", ["event:old"]],
		[
			"hSet",
			"event:spring",
			{ date: "2026-03-15", title: "Spring show", location: "Utrecht" },
		],
		["expireAt", "event:spring", Math.floor(expiryDate.getTime() / 1000)],
		["hSet", "event:draft", { date: "", title: "Draft show", location: "" }],
	]);
});

test("setAgenda writes invalid dates without scheduling expiration", async () => {
	const client = new FakeRedisClient();
	const store = createStore(client);

	await store.setAgenda({
		events: [
			{
				id: "bad-date",
				date: "not-a-date",
				title: "Mystery",
				location: "Unknown",
			},
		],
	});

	assert.deepEqual(client.calls, [
		["keys", "event:*"],
		[
			"hSet",
			"event:bad-date",
			{ date: "not-a-date", title: "Mystery", location: "Unknown" },
		],
	]);
});
