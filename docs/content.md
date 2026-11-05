# Content

## Authoring posts and tags

Posts live in `src/content/post/`, one Markdown or MDX file per language. Tags live in `src/content/tag/`. Frontmatter must match [the content schemas](../src/content.config.ts); shared static assets live in `public/`, and site metadata in `src/site.config.ts`.

A **Post** is one language version of a blog article. Its filename follows the **Post grammar**, `{date}-{slug}-{lang}`, for example `2026-03-27-terminal-en.md`. The **Post slug** is the language-independent identity shared by translations and used in `/posts/{slug}/`. A post id includes the date and language as well as the slug; do not interchange the two.

Declare `lang` to match the filename (the schema defaults omitted `lang` to `zh`). [post validation](../src/lib/post.ts) enforces the `{date}-{slug}-{lang}` ID pattern (`/^\d{4}-\d{2}-\d{2}-.+-[a-z]{2,3}$/`), requires frontmatter `lang` to match the filename suffix, and rejects duplicate `(slug, lang)` entries. Posts with `draft: true` are excluded in production builds (`import.meta.env.PROD` in [src/data/post.ts](../src/data/post.ts)).

## Translation selection

**SiteLang** is `zh`, `en`, or `ja` (resolved per request from `?lang=`, the `site-language` cookie, or `cf-ipcountry` in [middleware.ts](../src/middleware.ts)). **Post resolution** chooses one translation for a slug. Its **Fallback priority** is the requested SiteLang, then the default (`en`), then the remaining languages in the order defined by [i18n.ts](../src/lib/i18n.ts).

This keeps a shared Post URL usable when a translation is missing. Notes use a separate identity and lifecycle; they are not translated and do not participate in Post resolution. See [ActivityPub](activitypub.md).

## Validation and search

Build after changing content to validate frontmatter and generated pages. Verify the affected language variants and Pagefind results as described in [Contributing](../CONTRIBUTING.md#validation). Site RSS behavior is documented in [Feeds](feeds.md).
