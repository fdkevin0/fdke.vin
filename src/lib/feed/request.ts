import { z } from "zod";
import { readJson } from "@/lib/api/http";
import type { FeedSourceCreateInput, FeedSourceInput } from "@/lib/feed/types";

function httpUrlSchema(message: string) {
	return z
		.string(message)
		.trim()
		.min(1, message)
		.transform((value, context) => {
			try {
				const url = new URL(value);
				if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
			} catch {
				// Report the domain-specific validation message below.
			}
			context.addIssue({ code: "custom", message });
			return z.NEVER;
		});
}

const flagsSchema = {
	isActive: z.boolean().optional().default(true),
	aiTranslationEnabled: z.boolean().optional().default(true),
};

const createFeedSourceSchema = z.object({
	feedUrl: httpUrlSchema("A valid feedUrl is required"),
	...flagsSchema,
});

const feedSourceSchema = z.object({
	title: z.string("Feed title is required").trim().min(1, "Feed title is required"),
	feedUrl: httpUrlSchema("A valid feedUrl is required"),
	siteUrl: z
		.union([httpUrlSchema("siteUrl must be a valid http or https URL"), z.literal(""), z.null()])
		.optional()
		.transform((value) => value || null),
	...flagsSchema,
});

export async function readCreateFeedSourceInput(
	request: Request,
): Promise<FeedSourceCreateInput | Response> {
	return readJson(request, createFeedSourceSchema);
}

export async function readFeedSourceInput(request: Request): Promise<FeedSourceInput | Response> {
	return readJson(request, feedSourceSchema);
}
