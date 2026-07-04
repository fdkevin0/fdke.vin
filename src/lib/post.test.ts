import { describe, expect, it } from "vitest";
import type { SiteLang } from "@/lib/i18n";
import {
	getPostFallbackLangs,
	getPostPath,
	getPostSlug,
	parsePostId,
	resolvePostBySlug,
	resolvePostsByLang,
	resolveTranslationsByLang,
	validatePosts,
} from "@/lib/post";

function post(id: string) {
	const { lang } = parsePostId(id);
	return { data: { lang: lang as SiteLang }, id };
}

describe("parsePostId", () => {
	it("parses date, slug, and lang from the post grammar", () => {
		expect(parsePostId("2026-03-27-terminal-en")).toEqual({
			date: "2026-03-27",
			lang: "en",
			slug: "terminal",
		});
	});

	it("keeps hyphenated slugs intact", () => {
		expect(parsePostId("2018-05-17-how-to-ruin-your-exs-wedding-zh").slug).toBe(
			"how-to-ruin-your-exs-wedding",
		);
	});

	it("rejects ids that break the grammar", () => {
		expect(() => parsePostId("terminal-en")).toThrow(/naming convention/);
		expect(() => parsePostId("2026-03-27-terminal")).toThrow(/naming convention/);
	});
});

describe("validatePosts", () => {
	it("accepts a well-formed collection", () => {
		const posts = [post("2026-01-01-a-en"), post("2026-01-01-a-zh")];
		expect(validatePosts(posts)).toBe(posts);
	});

	it("rejects a frontmatter lang that contradicts the filename", () => {
		expect(() =>
			validatePosts([{ data: { lang: "ja" as SiteLang }, id: "2026-01-01-a-en" }]),
		).toThrow(/filename lang/);
	});

	it("rejects duplicate locale entries for one slug", () => {
		expect(() =>
			validatePosts([
				{ data: { lang: "en" as SiteLang }, id: "2026-01-01-a-en" },
				{ data: { lang: "en" as SiteLang }, id: "2026-01-02-a-en" },
			]),
		).toThrow(/Duplicate post locale entry "a:en"/);
	});
});

describe("fallback priority", () => {
	it("tries requested lang, then default, then the rest", () => {
		expect(getPostFallbackLangs("ja")).toEqual(["ja", "en", "zh"]);
	});

	it("skips the default duplicate when it is requested", () => {
		expect(getPostFallbackLangs("en")).toEqual(["en", "zh", "ja"]);
	});
});

describe("resolvePostsByLang", () => {
	const posts = [
		post("2026-01-01-alpha-en"),
		post("2026-01-01-alpha-ja"),
		post("2026-02-01-beta-zh"),
	];

	it("returns one post per slug in the requested lang when available", () => {
		const resolved = resolvePostsByLang(posts, "ja");
		expect(resolved.map((p) => p.id)).toEqual(["2026-01-01-alpha-ja", "2026-02-01-beta-zh"]);
	});

	it("falls back through the priority order for missing translations", () => {
		const resolved = resolvePostsByLang(posts, "zh");
		expect(resolved.map((p) => p.id)).toEqual(["2026-01-01-alpha-en", "2026-02-01-beta-zh"]);
	});
});

describe("resolvePostBySlug", () => {
	const posts = [post("2026-01-01-alpha-en"), post("2026-01-01-alpha-ja")];

	it("returns the requested translation", () => {
		expect(resolvePostBySlug(posts, "ja", "alpha")?.id).toBe("2026-01-01-alpha-ja");
	});

	it("falls back to the default lang", () => {
		expect(resolvePostBySlug(posts, "zh", "alpha")?.id).toBe("2026-01-01-alpha-en");
	});

	it("returns undefined for an unknown slug", () => {
		expect(resolvePostBySlug(posts, "en", "missing")).toBeUndefined();
	});
});

describe("resolveTranslationsByLang", () => {
	it("maps every site lang to its translation or undefined", () => {
		const en = post("2026-01-01-alpha-en");
		const ja = post("2026-01-01-alpha-ja");
		const translations = resolveTranslationsByLang([en, ja, post("2026-02-01-beta-zh")], en);
		expect(translations.en).toBe(en);
		expect(translations.ja).toBe(ja);
		expect(translations.zh).toBeUndefined();
	});
});

describe("post paths", () => {
	it("derives the slug for URLs", () => {
		expect(getPostSlug({ id: "2026-03-27-terminal-en" })).toBe("terminal");
	});

	it("builds the post path, with the lang query only when explicit", () => {
		const p = post("2026-03-27-terminal-ja");
		expect(getPostPath(p)).toBe("/posts/terminal/");
		expect(getPostPath(p, true)).toBe("/posts/terminal/?lang=ja");
	});
});
