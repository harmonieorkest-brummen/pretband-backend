import assert from "node:assert/strict";
import test from "node:test";
import { isSafeKeySegment } from "../../api/_lib/validation.js";

test("isSafeKeySegment accepts the ids/keys the admin UI generates", () => {
	for (const value of [
		"event_1720000000000",
		"sectie_1720000000000",
		"trumpets",
		"show-1",
		"drums",
		"a.b_c-1",
		"évènement", // accented letters are fine
	]) {
		assert.equal(isSafeKeySegment(value), true, `expected "${value}" to be safe`);
	}
});

test("isSafeKeySegment rejects structural and non-string values", () => {
	for (const value of [
		"", // empty
		"a".repeat(129), // too long
		"foo:bar", // colon = namespace separator
		"has space",
		"glob*", // KEYS metacharacters
		"who?",
		"bracket[",
		"bracket]",
		42,
		null,
		undefined,
		{ key: "x" },
	]) {
		assert.equal(
			isSafeKeySegment(value as unknown),
			false,
			`expected ${JSON.stringify(value)} to be rejected`,
		);
	}
});

test("isSafeKeySegment rejects whitespace, backslash and control characters", () => {
	assert.equal(isSafeKeySegment("tab\tsep"), false, "tab");
	assert.equal(isSafeKeySegment("line\nbreak"), false, "newline");
	assert.equal(isSafeKeySegment("back\\slash"), false, "backslash");
	assert.equal(isSafeKeySegment(`a${String.fromCharCode(0)}b`), false, "NUL");
	assert.equal(isSafeKeySegment(`a${String.fromCharCode(0x7f)}b`), false, "DEL");
	assert.equal(isSafeKeySegment(`a${String.fromCharCode(0x1f)}b`), false, "unit sep");
});
