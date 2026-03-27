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
