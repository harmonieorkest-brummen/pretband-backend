export type MembersData = {
	sections: {
		key: string;
		names: string[];
	}[];
};

export type AgendaData = {
	events: {
		id: string;
		date: string;
		title: string;
		location: string;
		daysUntilDeletion?: number;
	}[];
};

export type RedirectsData = {
	redirects: {
		/** URL-safe identifier encoded in the QR code, e.g. "flyer". */
		slug: string;
		/** Absolute http(s) destination the QR redirects to. */
		url: string;
		/** Optional human label shown in the admin panel. */
		label?: string;
		/** Read-only scan count; populated by GET, ignored on PUT. */
		scans?: number;
	}[];
};
