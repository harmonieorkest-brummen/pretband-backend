// Structural characters that must never appear in a Redis-key segment:
// control chars, colon (our namespace separator), the glob metacharacters used
// by KEYS (* ? [ ]), backslash, and any whitespace.
const UNSAFE_KEY_CHARS = /[\x00-\x1f\x7f:*?[\]\\\s]/;

/**
 * A Redis-key-safe segment.
 *
 * Member section keys and agenda event ids are concatenated into Redis keys
 * (`section:<key>:members`, `event:<id>`). This rejects characters that would
 * let a value break out of that layout or interfere with the glob patterns
 * used by KEYS.
 *
 * It is deliberately permissive otherwise — ordinary ids/keys made of letters
 * (including accented), digits, dashes, underscores and dots all pass, so this
 * does not reject the values the admin UI generates
 * (`event_<timestamp>`, `sectie_<timestamp>`).
 */
export function isSafeKeySegment(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length > 0 &&
		value.length <= 128 &&
		!UNSAFE_KEY_CHARS.test(value)
	);
}
