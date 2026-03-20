const NO_STORE_HEADERS = {
	"Cache-Control": "no-store",
};

export function json(data: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(data), {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {}),
		},
	});
}

export function jsonNoStore(data: unknown, init?: ResponseInit): Response {
	return json(data, {
		...init,
		headers: {
			...NO_STORE_HEADERS,
			...(init?.headers ?? {}),
		},
	});
}

export function jsonError(status: number, error: string): Response {
	return jsonNoStore({ error }, { status });
}

export function text(body: BodyInit | null, init?: ResponseInit): Response {
	return new Response(body, {
		...init,
		headers: {
			...NO_STORE_HEADERS,
			...(init?.headers ?? {}),
		},
	});
}

export function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error ? error.message : fallback;
}

export function logApiError(route: string, error: unknown, context?: Record<string, unknown>) {
	console.error(`[api:${route}] request failed`, {
		...(context ?? {}),
		message: getErrorMessage(error, "Unknown error occurred"),
	});
}
