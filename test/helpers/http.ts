import type { VercelRequest, VercelResponse } from "@vercel/node";

export type MockResponse = VercelResponse & {
	headers: Record<string, string | number | readonly string[]>;
	statusCode?: number;
	jsonBody?: unknown;
	ended: boolean;
};

export function createRequest(
	overrides: Partial<VercelRequest> = {},
): VercelRequest {
	return {
		method: "GET",
		headers: {},
		body: undefined,
		...overrides,
	} as VercelRequest;
}

export function createResponse(): MockResponse {
	const response: any = {
		headers: {},
		ended: false,
		setHeader(name: string, value: string | number | readonly string[]) {
			this.headers[name] = value;
			return this;
		},
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(body: unknown) {
			this.jsonBody = body;
			this.ended = true;
			return this;
		},
		end() {
			this.ended = true;
			return this;
		},
	};

	return response as unknown as MockResponse;
}
