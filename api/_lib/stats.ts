// Fixed Redis keys for the admin dashboard counters. Centralised so the
// public /track endpoint, the auth handler, and the /stats reader agree.
export const STAT_KEYS = {
	confetti: "stats:confetti",
	contactSubmits: "stats:contact_submits",
	failedLogins24h: "stats:login_fail_24h",
	lastLogin: "stats:last_login",
} as const;

export const FAILED_LOGIN_TTL_SECONDS = 24 * 60 * 60;

/**
 * Public events the /api/track endpoint accepts, mapped to their counter keys.
 * Only these fixed names are honoured — arbitrary keys can never be incremented.
 */
export const TRACKABLE_EVENTS: Record<string, string> = {
	confetti: STAT_KEYS.confetti,
	contact_submit: STAT_KEYS.contactSubmits,
};
