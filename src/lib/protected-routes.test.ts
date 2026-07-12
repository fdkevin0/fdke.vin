import { describe, expect, it } from "vitest";
import { getRequiredApiScope, routeNeedsAuth } from "@/lib/protected-routes";

describe("routeNeedsAuth", () => {
	it("protects auth, dashboard, protected tools, and API routes", () => {
		for (const pathname of [
			"/auth",
			"/api/tokens",
			"/api/tokens/abc",
			"/api/ping",
			"/api/dlsite/foo",
			"/api/exhentai/bar",
			"/api/emails",
			"/api/feed/items",
			"/api/ap/notes",
			"/api/ap/notes/01ABC",
			"/api/ap/blocklist",
			"/api/ap/interactions/01ABC",
			"/dashboard",
			"/dashboard/feeds",
			"/dashboard/notes",
			"/tools/access",
			"/tools/mail/inbox",
		]) {
			expect(routeNeedsAuth(pathname), pathname).toBe(true);
		}
	});

	it("leaves public routes open", () => {
		for (const pathname of [
			"/",
			"/posts/terminal/",
			"/rss.xml",
			"/tools",
			"/tools/camera",
			"/api/ap/media/avatars/abc.jpg",
			"/notes/01ABC/",
		]) {
			expect(routeNeedsAuth(pathname), pathname).toBe(false);
		}
	});
});

describe("getRequiredApiScope", () => {
	it("maps token-capable API routes to their scope", () => {
		expect(getRequiredApiScope("/api/ping")).toBe("api.ping");
		expect(getRequiredApiScope("/api/dlsite/works/1")).toBe("api.dlsite.read");
		expect(getRequiredApiScope("/api/exhentai/gallery")).toBe("api.exhentai.read");
	});

	it("returns null for auth-only routes", () => {
		expect(getRequiredApiScope("/api/tokens")).toBeNull();
		expect(getRequiredApiScope("/dashboard")).toBeNull();
	});

	it("every scoped route also requires auth", () => {
		for (const pathname of ["/api/ping", "/api/dlsite/x", "/api/exhentai/x"]) {
			expect(getRequiredApiScope(pathname)).not.toBeNull();
			expect(routeNeedsAuth(pathname)).toBe(true);
		}
	});
});
