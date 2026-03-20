export const prerender = false;

export async function GET({
	params,
	locals,
}: {
	params: { key: string };
	locals: App.Locals;
}): Promise<Response> {
	try {
		const env = locals.runtime.env;

		if (!env.EMAIL_BUCKET) {
			return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}

		const key = `emails/${params.key}.eml`;
		const object = await env.EMAIL_BUCKET.get(key);

		if (!object) {
			return new Response(JSON.stringify({ error: "Email not found" }), {
				status: 404,
				headers: { "Content-Type": "application/json" },
			});
		}

		const content = await object.text();

		return new Response(content, {
			status: 200,
			headers: { "Content-Type": "message/rfc822" },
		});
	} catch (error) {
		console.error("Error fetching email:", error);
		return new Response(JSON.stringify({ error: "Failed to fetch email" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
