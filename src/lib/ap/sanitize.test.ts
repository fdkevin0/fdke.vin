import { describe, expect, it } from "vitest";
import { sanitizeRemoteHtml } from "@/lib/ap/sanitize";

describe("sanitizeRemoteHtml", () => {
	it("keeps benign inline formatting", async () => {
		const html = await sanitizeRemoteHtml(
			"<p>Hello <strong>bold</strong> and <em>italic</em><br>next</p>",
		);
		expect(html).toContain("<p>");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<em>italic</em>");
		expect(html).toContain("<br>");
	});

	it("keeps safe anchor links", async () => {
		const html = await sanitizeRemoteHtml('<p><a href="https://example.com/x">link</a></p>');
		expect(html).toContain('href="https://example.com/x"');
		expect(html).toContain(">link</a>");
	});

	it("strips <script> elements and their content", async () => {
		const html = await sanitizeRemoteHtml('<p>ok</p><script>alert("xss")</script>');
		expect(html).not.toContain("<script");
		expect(html).not.toContain("alert(");
		expect(html).toContain("<p>ok</p>");
	});

	it("strips inline event handlers", async () => {
		const html = await sanitizeRemoteHtml('<p onclick="steal()">hi</p>');
		expect(html).not.toContain("onclick");
		expect(html).toContain("hi");
	});

	it("drops javascript: URLs on links", async () => {
		const html = await sanitizeRemoteHtml('<a href="javascript:alert(1)">x</a>');
		expect(html).not.toContain("javascript:");
	});

	it("removes dangerous elements like iframe and style", async () => {
		const html = await sanitizeRemoteHtml(
			'<iframe src="https://evil.example"></iframe><style>*{}</style><p>keep</p>',
		);
		expect(html).not.toContain("<iframe");
		expect(html).not.toContain("<style");
		expect(html).toContain("<p>keep</p>");
	});

	it("returns an empty string for empty or whitespace input", async () => {
		expect(await sanitizeRemoteHtml("")).toBe("");
		expect(await sanitizeRemoteHtml("   ")).toBe("");
	});

	it("strips img elements (avatars/images are proxied, not inlined from replies)", async () => {
		const html = await sanitizeRemoteHtml('<p>hi<img src="https://evil.example/x.png"></p>');
		expect(html).not.toContain("<img");
		expect(html).toContain("hi");
	});
});
