import { generateCryptoKeyPair } from "@fedify/fedify/sig";
import { beforeAll, describe, expect, it } from "vitest";
import { buildActor, buildWebFinger } from "@/lib/ap/actor";

const ORIGIN = "https://fdke.vin";

describe("buildWebFinger", () => {
	it("resolves the acct handle to the actor via a self link", () => {
		const jrd = buildWebFinger({ origin: ORIGIN });
		expect(jrd.subject).toBe("acct:fdkevin@fdke.vin");
		expect(jrd.aliases).toContain("https://fdke.vin/actor");
		const self = jrd.links.find((l) => l.rel === "self");
		expect(self?.type).toBe("application/activity+json");
		expect(self?.href).toBe("https://fdke.vin/actor");
	});

	it("points a profile-page link at the site", () => {
		const jrd = buildWebFinger({ origin: ORIGIN });
		const profile = jrd.links.find((l) => l.rel === "http://webfinger.net/rel/profile-page");
		expect(profile?.type).toBe("text/html");
		expect(profile?.href).toBe("https://fdke.vin/");
	});

	it("tolerates a trailing slash on the origin", () => {
		const jrd = buildWebFinger({ origin: "https://fdke.vin/" });
		expect(jrd.links.find((l) => l.rel === "self")?.href).toBe("https://fdke.vin/actor");
	});
});

describe("buildActor", () => {
	let publicKey: CryptoKey;

	beforeAll(async () => {
		({ publicKey } = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5"));
	});

	it("produces an AS2 actor with the canonical id and collections", async () => {
		const doc = await buildActor({ origin: ORIGIN, publicKey });
		expect(doc.type).toBe("Application");
		expect(doc.id).toBe("https://fdke.vin/actor");
		expect(doc.preferredUsername).toBe("fdkevin");
		expect(doc.inbox).toBe("https://fdke.vin/inbox");
		expect(doc.outbox).toBe("https://fdke.vin/outbox");
		expect(doc.followers).toBe("https://fdke.vin/followers");
	});

	it("publishes an avatar icon and header image", async () => {
		const doc = await buildActor({ origin: ORIGIN, publicKey });
		const icon = doc.icon as Record<string, unknown>;
		expect(icon.type).toBe("Image");
		expect(icon.url).toBe("https://fdke.vin/icons/icon-512.png");
		const image = doc.image as Record<string, unknown>;
		expect(image.url).toBe("https://fdke.vin/social-card.png");
	});

	it("advertises a shared inbox endpoint", async () => {
		const doc = await buildActor({ origin: ORIGIN, publicKey });
		const endpoints = doc.endpoints as Record<string, unknown>;
		expect(endpoints.sharedInbox).toBe("https://fdke.vin/inbox");
	});

	it("publishes a PEM public key owned by the actor", async () => {
		const doc = await buildActor({ origin: ORIGIN, publicKey });
		const key = doc.publicKey as Record<string, unknown>;
		expect(key.id).toBe("https://fdke.vin/actor#main-key");
		expect(key.owner).toBe("https://fdke.vin/actor");
		expect(String(key.publicKeyPem)).toContain("BEGIN PUBLIC KEY");
	});

	it("includes the ActivityStreams + security JSON-LD context", async () => {
		const doc = await buildActor({ origin: ORIGIN, publicKey });
		const ctx = doc["@context"];
		const flat = Array.isArray(ctx) ? ctx : [ctx];
		expect(flat).toContain("https://www.w3.org/ns/activitystreams");
		expect(flat).toContain("https://w3id.org/security/v1");
	});
});
