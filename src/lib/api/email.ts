import { env } from "cloudflare:workers";

export interface EmailMetadata {
	name: string;
	date: string;
	type: string;
	contentType: string;
	from: string;
	to: string;
	subject: string;
}

export interface EmailSummary {
	key: string;
	size: number;
	from: string;
	to: string;
	subject: string;
	date: string;
	metadata: EmailMetadata;
}

export async function listEmails(): Promise<EmailSummary[]> {
	const bucket = getEmailBucket();
	const listed = await bucket.list({ prefix: "emails/" });

	return listed.objects.map((object) => {
		const metadata = object.customMetadata as unknown as EmailMetadata | undefined;
		const keyParts = object.key.split("/")[1]?.split(".");
		const dateStr = metadata?.date || "";
		const parsedDate = new Date(dateStr);
		const isValidDate = !Number.isNaN(parsedDate.getTime());

		return {
			key: keyParts?.[0] || object.key,
			size: object.size,
			from: metadata?.from || "",
			to: metadata?.to || "",
			subject: metadata?.subject || "",
			date: isValidDate ? parsedDate.toISOString() : "Unknown",
			metadata: metadata || {
				name: object.key,
				contentType: "application/octet-stream",
				type: "unknown",
				date: "",
				from: "",
				to: "",
				subject: "",
			},
		};
	});
}

export async function getEmailContent(key: string): Promise<string | null> {
	const bucket = getEmailBucket();
	const object = await bucket.get(`emails/${key}.eml`);
	if (!object) {
		return null;
	}

	return object.text();
}

function getEmailBucket(): R2Bucket {
	if (!env.EMAIL_BUCKET) {
		throw new Error("R2 bucket not configured");
	}

	return env.EMAIL_BUCKET;
}
