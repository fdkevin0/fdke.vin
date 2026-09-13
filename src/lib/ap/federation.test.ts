import { exportJwk, generateCryptoKeyPair } from "@fedify/fedify/sig";
import { describe, expect, it } from "vitest";
import { createFederation } from "@/lib/ap/federation";

async function testEnv(): Promise<Env> {
	const values = new Map<string, string>();
	const kv = {
		async get(key: string, type?: string) {
			const value = values.get(key) ?? null;
			return type === "json" && value ? JSON.parse(value) : value;
		},
		async put(key: string, value: string) {
			values.set(key, value);
		},
		async delete(key: string) {
			values.delete(key);
		},
		async list(options?: { prefix?: string }) {
			return {
				keys: [...values.keys()]
					.filter((key) => key.startsWith(options?.prefix ?? ""))
					.map((name) => ({ name })),
				list_complete: true,
			};
		},
	};
	const { privateKey } = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
	const database = {
		prepare(query: string) {
			const statement = {
				bind() {
					return statement;
				},
				async first() {
					return query.includes("FROM ap_notes")
						? {
								id: "01KM1P8N00SAED8ZJQHD5ZW8D6",
								title: null,
								content: "Hello fediverse.",
								summary: null,
								published_at: "2026-03-19T00:00:00.000Z",
								updated_at: "2026-03-19T00:00:00.000Z",
								created_at: "2026-03-19T00:00:00.000Z",
								source: "telegram",
							}
						: null;
				},
				async all() {
					return { results: [] };
				},
			};
			return statement;
		},
	};
	return {
		AP_FEDIFY_KV: kv,
		AP_DELIVERY_QUEUE: { send: async () => undefined, sendBatch: async () => undefined },
		AP_RSA_PRIVATE_KEY: JSON.stringify(await exportJwk(privateKey)),
		DATABASE: database,
	} as unknown as Env;
}

describe("ActivityPub federation", () => {
	it("serves WebFinger and the fixed actor through Fedify", async () => {
		const env = await testEnv();
		const federation = await createFederation(env);
		const webfinger = await federation.fetch(
			new Request("https://fdke.vin/.well-known/webfinger?resource=acct:fdkevin@fdke.vin"),
			{ contextData: env },
		);
		expect(webfinger.status).toBe(200);
		const descriptor = (await webfinger.json()) as {
			subject: string;
			links: { href: string; rel: string }[];
		};
		expect(descriptor.subject).toBe("acct:fdkevin@fdke.vin");
		expect(descriptor.links).toContainEqual(
			expect.objectContaining({ href: "https://fdke.vin/actor", rel: "self" }),
		);

		const actor = await federation.fetch(
			new Request("https://fdke.vin/actor", {
				headers: { Accept: "application/activity+json" },
			}),
			{ contextData: env },
		);
		expect(actor.status).toBe(200);
		expect(await actor.json()).toMatchObject({
			id: "https://fdke.vin/actor",
			preferredUsername: "fdkevin",
			inbox: "https://fdke.vin/users/fdkevin/inbox",
			outbox: "https://fdke.vin/users/fdkevin/outbox",
			followers: "https://fdke.vin/users/fdkevin/followers",
			publicKey: {
				id: "https://fdke.vin/actor#main-key",
				owner: "https://fdke.vin/actor",
			},
		});
	});

	it("negotiates a Note object and falls through to Astro for HTML", async () => {
		const env = await testEnv();
		const federation = await createFederation(env);
		const url = "https://fdke.vin/notes/01KM1P8N00SAED8ZJQHD5ZW8D6/";
		const activity = await federation.fetch(
			new Request(url, { headers: { Accept: "application/activity+json" } }),
			{ contextData: env },
		);
		expect(activity.status).toBe(200);
		expect(await activity.json()).toMatchObject({
			type: "Note",
			id: url,
			attributedTo: "https://fdke.vin/actor",
		});

		const html = await federation.fetch(new Request(url, { headers: { Accept: "text/html" } }), {
			contextData: env,
			onNotAcceptable: () => new Response("astro"),
		});
		expect(await html.text()).toBe("astro");
	});
});
