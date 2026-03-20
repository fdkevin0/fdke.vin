export const prerender = false;

interface EmailMetadata {
	name: string;
	date: string;
	type: string;
	contentType: string;
	from: string;
	to: string;
	subject: string;
}

export async function GET({ locals }: { locals: App.Locals }): Promise<Response> {
	try {
		const env = locals.runtime.env;

		if (!env.EMAIL_BUCKET) {
			return new Response(JSON.stringify({ error: "R2 bucket not configured" }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			});
		}

		const listed = await env.EMAIL_BUCKET.list({
			prefix: "emails/",
		});

		const emails = await Promise.all(
			listed.objects.map(async (object) => {
				const metadata = object.customMetadata as unknown as EmailMetadata | undefined;

				const keyParts = object.key.split("/")[1]?.split(".");
				return {
					key: keyParts?.[0] || object.key,
					size: object.size,
					from: metadata?.from || "",
					to: metadata?.to || "",
					subject: metadata?.subject || "",
					date: new Date(metadata?.date || "").toISOString(),
					metadata: metadata || {
						name: object.key,
						contentType: "application/octet-stream",
						type: "unknown",
					},
				};
			}),
		);

		return new Response(JSON.stringify({ emails }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	} catch (error) {
		console.error("Error fetching emails:", error);
		return new Response(JSON.stringify({ error: "Failed to fetch emails" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
