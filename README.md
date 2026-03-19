# fdke.vin

Personal website built with Astro.

## What is here

- Personal homepage and about page
- Blog posts, notes, and tag pages powered by Astro content collections
- Small utility pages, currently:
  - exchange rate monitor
  - camera calculators
- RSS feeds, OG image generation, search, and optional webmentions support

## Project structure

- `src/pages`: route entrypoints
- `src/components`: shared UI and utility components
- `src/layouts`: page and post layouts
- `src/content`: live content collections for posts, notes, and tags
- `src/content.bak`: archived theme example content kept for reference only
- `public`: static assets such as icons and social cards

## Commands

```bash
pnpm install
pnpm run dev
pnpm run check
pnpm run build
pnpm run postbuild
pnpm run preview
```

## Content

Create content in these directories:

- `src/content/post`
- `src/content/note`
- `src/content/tag`

The site currently ships without theme sample posts in production content. If you want reference material, use `src/content.bak` as an archive and copy only the pieces you actually want to keep.

## Personalization checklist

- Replace `public/icon.svg`
- Replace `public/social-card.png`
- Expand social links in `src/components/SocialList.astro`
- Add real posts and notes under `src/content`
- Update any remaining copy in page descriptions as the site evolves
