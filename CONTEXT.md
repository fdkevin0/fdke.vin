# fdke.vin

A personal multilingual blog (Astro on Cloudflare Workers). Posts exist in up to three languages; the site picks the best translation for each visitor.

## Language

### Content

**Post**:
A blog article stored as one markdown file per language under `src/content/post/`. Translations of the same article are distinct Posts sharing one Post slug.
_Avoid_: article, entry

**Note**:
A short-form piece under `src/content/note/`, not translated and not part of post resolution.

**Post grammar**:
The `{date}-{slug}-{lang}` filename convention every Post file must follow (e.g. `2026-03-27-terminal-en`). The single source of a Post's identity: publish date, Post slug, and SiteLang.
_Avoid_: naming convention, filename format

**Post slug**:
The language-independent identifier shared by all translations of a Post, extracted from the Post grammar. It is the `/posts/{slug}/` URL segment.
_Avoid_: post id (that's the full filename), permalink

### Languages

**SiteLang**:
One of the site's supported languages: `zh`, `en`, `ja`. Every Post declares exactly one.
_Avoid_: locale, language code

**Post resolution**:
Choosing which Post translation to serve for a given Post slug and requested SiteLang, applying fallback priority when the exact language is missing.
_Avoid_: post lookup, language negotiation

**Fallback priority**:
The order tried during post resolution: requested SiteLang, then the default SiteLang (`en`), then the remaining SiteLangs.
_Avoid_: language fallback chain
