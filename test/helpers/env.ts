export function withEnv<T>(
	updates: Record<string, string | undefined>,
	callback: () => T,
): T {
	const previous = new Map<string, string | undefined>();

	for (const key of Object.keys(updates)) {
		previous.set(key, process.env[key]);
		const value = updates[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	try {
		return callback();
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

export async function withEnvAsync<T>(
	updates: Record<string, string | undefined>,
	callback: () => Promise<T>,
): Promise<T> {
	const previous = new Map<string, string | undefined>();

	for (const key of Object.keys(updates)) {
		previous.set(key, process.env[key]);
		const value = updates[key];
		if (value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	try {
		return await callback();
	} finally {
		for (const [key, value] of previous) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}
