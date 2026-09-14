import { expect, it } from "vitest";
import { renderDataTable } from "./table";

it("keeps full text and zero values, escapes upstream text, and marks missing cells", () => {
	const markup = renderDataTable(
		'Health "now"',
		["ASN", "Count", "Cause"],
		[["<script>alert(1)</script>", 0, null]],
	);
	expect(markup).toContain('tabindex="0"');
	expect(markup).toContain('scope="col"');
	expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
	expect(markup).toMatch(/>0<\/td><td[^>]*>—<\/td>/);
	expect(markup).toContain('aria-label="Health &quot;now&quot;"');
	expect(renderDataTable("Empty", ["ASN"], [])).toBe("");
});
