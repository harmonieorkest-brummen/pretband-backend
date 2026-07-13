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
	| ["expireAt", string, number]
	| ["get", string]
	| ["incr", string]
	| ["expire", string, number];

class FakeRedisClient {
	calls: Call[] = [];
	keyResults = new Map<string, string[]>();
	memberResults = new Map<string, string[]>();
	hashResults = new Map<string, Record<string, string>>();
	ttlResults = new Map<string, number>();
	getResults = new Map<string, string | null>();

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

	async get(key: string): Promise<string | null> {
		this.calls.push(["get", key]);
		return this.getResults.get(key) ?? null;
	}

	async incr(key: string): Promise<number> {
		this.calls.push(["incr", key]);
		const next = (Number.parseInt(this.getResults.get(key) ?? "0", 10) || 0) + 1;
		this.getResults.set(key, String(next));
		return next;
	}

	async expire(key: string, seconds: number): Promise<void> {
		this.calls.push(["expire", key, seconds]);
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

test("getRedirects returns an empty list when Redis has no redirect keys", async () => {
	const client = new FakeRedisClient();
	const store = createStore(client);

	const result = await store.getRedirects();

	assert.deepEqual(result, { redirects: [] });
	assert.deepEqual(client.calls, [["keys", "redirect:*"]]);
});

test("getRedirects maps hashes, includes scan counts, and sorts by slug", async () => {
	const client = new FakeRedisClient();
	client.keyResults.set("redirect:*", ["redirect:poster", "redirect:flyer"]);
	client.hashResults.set("redirect:poster", {
		url: "https://youtu.be/abc",
		label: "Poster",
	});
	client.hashResults.set("redirect:flyer", {
		url: "https://pretband.nl/#/#agenda",
		label: "Flyer",
	});
	client.getResults.set("scans:poster", "42");
	// scans:flyer intentionally absent → defaults to 0
	const store = createStore(client);

	const result = await store.getRedirects();

	assert.deepEqual(result, {
		redirects: [
			{
				slug: "flyer",
				url: "https://pretband.nl/#/#agenda",
				label: "Flyer",
				scans: 0,
			},
			{ slug: "poster", url: "https://youtu.be/abc", label: "Poster", scans: 42 },
		],
	});
});

test("getRedirect returns the destination for a known slug and null otherwise", async () => {
	const client = new FakeRedisClient();
	client.hashResults.set("redirect:flyer", { url: "https://x.nl", label: "" });
	const store = createStore(client);

	assert.deepEqual(await store.getRedirect("flyer"), { url: "https://x.nl" });
	assert.equal(await store.getRedirect("missing"), null);
});

test("setRedirects replaces redirect keys but leaves scan counters untouched", async () => {
	const client = new FakeRedisClient();
	client.keyResults.set("redirect:*", ["redirect:old"]);
	const store = createStore(client);

	await store.setRedirects({
		redirects: [
			{ slug: "flyer", url: "https://pretband.nl/#/#agenda", label: "Flyer" },
			{ slug: "insta", url: "https://instagram.com/pretband" },
		],
	});

	assert.deepEqual(client.calls, [
		["keys", "redirect:*"],
		["del", ["redirect:old"]],
		[
			"hSet",
			"redirect:flyer",
			{ url: "https://pretband.nl/#/#agenda", label: "Flyer" },
		],
		["hSet", "redirect:insta", { url: "https://instagram.com/pretband", label: "" }],
	]);
});

test("bumpScan increments the per-slug scan counter", async () => {
	const client = new FakeRedisClient();
	const store = createStore(client);

	await store.bumpScan("flyer");
	await store.bumpScan("flyer");

	assert.deepEqual(client.calls, [
		["incr", "scans:flyer"],
		["incr", "scans:flyer"],
	]);
	assert.equal(client.getResults.get("scans:flyer"), "2");
});

test("hitLoginRateLimit sets an expiry only on the first hit of a window", async () => {
	const client = new FakeRedisClient();
	const store = createStore(client);

	const first = await store.hitLoginRateLimit("1.2.3.4", 900);
	const second = await store.hitLoginRateLimit("1.2.3.4", 900);
	const third = await store.hitLoginRateLimit("1.2.3.4", 900);

	assert.equal(first, 1);
	assert.equal(second, 2);
	assert.equal(third, 3);
	assert.deepEqual(client.calls, [
		["incr", "ratelimit:login:1.2.3.4"],
		["expire", "ratelimit:login:1.2.3.4", 900],
		["incr", "ratelimit:login:1.2.3.4"],
		["incr", "ratelimit:login:1.2.3.4"],
	]);
});
