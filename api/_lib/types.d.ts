export type MembersData = {
	sections: {
		key: string;
		names: string[];
	}[];
};

export type AgendaData = {
	events: {
		id: string;
		variant: "yellow" | "red";
		date: string;
		title: string;
		location: string;
		status: string;
	}[];
};
