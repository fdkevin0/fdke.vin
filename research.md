# fdke.vin Codebase Research Report

## Executive Summary

This is **Astro Cactus**, an opinionated starter theme for Astro.build, customized for FDKevin's personal website (fdke.vin). It's a static site generator-based blog platform featuring a content collection system for posts, notes, and tags, with comprehensive modern web features.

---

## Technology Stack

| Category | Technology | Version |
|----------|------------|---------|
| Framework | Astro | 5.16.3 |
| CSS Framework | TailwindCSS | 4.1.17 |
| Language | TypeScript | 5.9.3 |
| Deployment | Cloudflare Workers | - |
| Package Manager | pnpm | - |
| Linting/Formatting | Biome | 2.3.8 |
| Search | Pagefind | 1.4.0 |

---

## Project Structure

```
/home/fdkevin/Workspaces/fdke.vin/
├── src/
│   ├── assets/              # Static assets (fonts)
│   ├── components/          # Reusable Astro components
│   │   ├── blog/           # Blog-specific components
│   │   ├── layout/         # Layout components
│   │   └── note/           # Note-specific components
│   ├── content.bak/        # Backup content (posts, notes, tags)
│   ├── data/               # Data fetching utilities
│   ├── layouts/            # Page layouts
│   ├── pages/              # Route definitions
│   ├── plugins/            # Remark plugins
│   ├── styles/             # CSS styles
│   ├── utils/              # Utility functions
│   ├── content.config.ts   # Content collection schema
│   ├── site.config.ts      # Site configuration
│   └── types.ts            # TypeScript type definitions
├── public/                 # Static public assets
├── astro.config.ts         # Astro configuration
├── tailwind.config.ts      # TailwindCSS configuration
├── wrangler.jsonc          # Cloudflare deployment config
└── biome.json              # Biome linting configuration
```

---

## Architecture Deep Dive

### 1. Content Collections System

The project uses Astro's Content Collections (v5) with three main content types:

#### Posts (`src/content/post/`)
- Full blog posts with rich frontmatter support
- Schema includes: title, description, publishDate, updatedDate, tags, coverImage, ogImage, draft, pinned
- Supports pagination (10 posts per page)
- Grouped by year on listing pages
- Draft filtering in production

#### Notes (`src/content/note/`)
- Short-form content (similar to microblogging)
- Schema: title, description (optional), publishDate (ISO 8601 with offset)
- Separate RSS feed
- Paginated listing

#### Tags (`src/content/tag/`)
- Custom tag pages with optional metadata
- Schema: title (optional, max 60 chars), description (optional)
- Tag-specific pages show filtered posts

### 2. Routing Structure

| Route | Description | Implementation |
|-------|-------------|----------------|
| `/` | Home page | `src/pages/index.astro` |
| `/about/` | About page | `src/pages/about.astro` |
| `/posts/` | Blog listing (paginated) | `src/pages/posts/[...page].astro` |
| `/posts/{slug}/` | Individual post | `src/pages/posts/[...slug].astro` |
| `/notes/` | Notes listing | `src/pages/notes/[...page].astro` |
| `/notes/{slug}/` | Individual note | `src/pages/notes/[...slug].astro` |
| `/tags/` | All tags page | `src/pages/tags/index.astro` |
| `/tags/{tag}/` | Tag filter (paginated) | `src/pages/tags/[tag]/[...page].astro` |
| `/exchange/` | Exchange rates | `src/pages/exchange.astro` |
| `/rss.xml` | Blog RSS feed | `src/pages/rss.xml.ts` |
| `/notes/rss.xml` | Notes RSS feed | `src/pages/notes/rss.xml.ts` |
| `/og-image/{slug}.png` | Dynamic OG images | `src/pages/og-image/[...slug].png.ts` |

### 3. Component Architecture

#### Layout Components
- **Base.astro**: Root layout with SEO meta, theme provider, header, footer
- **BlogPost.astro**: Post-specific layout with TOC, webmentions, reading time

#### UI Components
- **ThemeProvider.astro**: Dark/light mode management with localStorage persistence
- **ThemeToggle.astro**: Theme switcher button with custom element
- **Search.astro**: Pagefind integration with modal dialog
- **Header.astro**: Site navigation with mobile hamburger menu
- **Footer.astro**: Copyright and secondary navigation

#### Blog Components
- **PostPreview.astro**: Post listing item with date, title, draft status
- **Masthead.astro**: Post header with cover image, title, date, tags, reading time
- **TOC.astro**: Table of contents with sticky positioning
- **TOCHeading.astro**: Recursive TOC item component

#### Webmentions Components
- **index.astro**: Webmentions container
- **Comments.astro**: Comment/reply display
- **Likes.astro**: Like/mention display with avatar grid

#### Exchange Rates Component
- **ExchangeRates.astro**: Custom web component fetching live FX rates from `/api/exchange/*`
- Features: currency selector, refresh button, rate history table, change indicators

### 4. Custom Remark Plugins

#### remarkReadingTime
- Calculates reading time using `reading-time` package
- Injects into frontmatter for display in Masthead

#### remarkAdmonitions
- Transforms container directives to styled admonition boxes
- Types: `tip`, `note`, `important`, `caution`, `warning`
- Uses GitHub-style syntax: `:::note` ... `:::`
- Each type has distinct color scheme and icon

#### remarkGithubCard
- Transforms `:github[repo]` directive to GitHub repository/user cards
- Fetches live data from GitHub API client-side
- Displays stars, forks, license, language, description
- Loading state with skeleton UI

### 5. Styling System

#### TailwindCSS v4 Configuration
- Custom CSS-based configuration in `src/styles/global.css`
- Uses `@import "tailwindcss"` and `@config` directive
- Custom color variables with OKLCH color space:
  - `--color-global-bg`: Background
  - `--color-global-text`: Text
  - `--color-link`: Links
  - `--color-accent`: Accent
  - `--color-accent-2`: Headings
  - `--color-quote`: Quotes

#### Theme System
- CSS custom properties with `data-theme` attribute
- Dark mode colors override in `[data-theme="dark"]`
- Smooth transitions between themes
- System preference detection via `prefers-color-scheme`

#### Typography
- Uses `@tailwindcss/typography` plugin
- Custom `prose-cactus` variant
- Monospace font stack for body text

### 6. Search Implementation (Pagefind)

- Static search index built in `postbuild` script
- UI integrated in `Search.astro` component
- Keyboard shortcut: `Ctrl+K` / `Cmd+K`
- Search only indexes posts and notes (via `data-pagefind-body`)
- Tag filtering support via `data-pagefind-filter`
- Custom styled CSS in `src/styles/blocks/search.css`

### 7. Open Graph Image Generation

- **Satori** (Vercel) for JSX-to-SVG conversion
- **Resvg** for SVG-to-PNG rendering
- Roboto Mono font (regular + bold)
- Template includes: date, title, site logo, author
- Generated at build time for posts without custom `ogImage`

### 8. Webmentions Integration

- Fetches from webmention.io API
- Environment variables: `WEBMENTION_API_KEY`, `WEBMENTION_URL`, `WEBMENTION_PINGBACK`
- Caching system in `.data/webmentions.json`
- Supports: likes, mentions, replies
- Types: `like-of`, `mention-of`, `in-reply-to`
- Filtered to remove empty content

### 9. Deployment Configuration

#### Cloudflare Workers (wrangler.jsonc)
```json
{
  "main": "dist/_worker.js/index.js",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "binding": "ASSETS", "directory": "./dist" }
}
```

#### SSR External Dependencies
- `@resvg/resvg-js` - Image generation
- `node:child_process`, `node:crypto`, `node:fs`, etc. - Node.js APIs

---

## Data Flow Architecture

### Post Rendering Flow
1. `getStaticPaths` fetches all posts via `getAllPosts()`
2. `render(post)` converts MDX to HTML + metadata
3. `remarkReadingTime` calculates reading time
4. `generateToc` builds table of contents from headings
5. BlogPost layout assembles: Masthead → TOC → Content → Webmentions
6. Base layout wraps with: ThemeProvider → Header → Main → Footer

### Search Indexing Flow
1. Build generates static HTML
2. `postbuild` runs `pagefind --site dist`
3. Pagefind indexes content from `data-pagefind-body` elements
4. Index saved to `dist/pagefind/`
5. Search component loads index client-side via `@pagefind/default-ui`

### Webmentions Flow
1. Build triggers `getWebmentionsForUrl()`
2. Checks `.data/webmentions.json` cache
3. If stale/missing, fetches from webmention.io API
4. Merges with existing cache (deduplicated by `wm-id`)
5. Filters to valid types with content
6. Saves updated cache
7. Components render likes and comments separately

---

## Key Files and Their Purposes

| File | Purpose |
|------|---------|
| `src/site.config.ts` | Central configuration for site metadata, menu links, Expressive Code options |
| `src/content.config.ts` | Zod schemas for content collections (post, note, tag) |
| `src/types.ts` | TypeScript interfaces for SiteConfig, Webmentions, Pagination, etc. |
| `src/data/post.ts` | Content fetching utilities with filtering and grouping |
| `src/utils/date.ts` | Date formatting and sorting utilities |
| `src/utils/webmentions.ts` | Webmention API integration with caching |
| `src/utils/generateToc.ts` | Table of contents generation from headings |
| `src/utils/remark.ts` | Helper for creating mdast nodes |
| `src/utils/domElement.ts` | DOM manipulation utilities for client-side scripts |
| `astro.config.ts` | Main Astro configuration with integrations, markdown, Vite |
| `tailwind.config.ts` | Typography plugin configuration |
| `biome.json` | Linting and formatting rules |

---

## Content Schema Details

### Post Frontmatter Schema
```typescript
{
  title: string (max 60 chars)
  description: string
  publishDate: Date (string or Date)
  updatedDate?: Date (string)
  tags: string[] (lowercase, deduplicated)
  coverImage?: { src: Image, alt: string }
  ogImage?: string (custom OG image path)
  draft: boolean (default: false)
  pinned: boolean (default: false)
}
```

### Note Frontmatter Schema
```typescript
{
  title: string (max 60 chars)
  description?: string
  publishDate: Date (ISO 8601 with offset)
}
```

### Tag Frontmatter Schema
```typescript
{
  title?: string (max 60 chars)
  description?: string
}
```

---

## Environment Variables

| Variable | Context | Access | Purpose |
|----------|---------|--------|---------|
| `WEBMENTION_API_KEY` | server | secret | webmention.io API key |
| `WEBMENTION_URL` | client | public | webmention.io endpoint URL |
| `WEBMENTION_PINGBACK` | client | public | pingback URL |

---

## Build Pipeline

1. **Development**: `astro dev` - HMR server
2. **Build**: `astro build` - Static generation + Cloudflare adapter
3. **Post-build**: `pagefind --site dist` - Search index generation
4. **Preview**: `astro preview` - Local production preview

---

## Performance Optimizations

1. **Speculation Rules**: Prefetch and prerender hints in Base layout
2. **View Transitions**: Native CSS view transitions enabled
3. **Font Loading**: Roboto Mono fonts bundled as assets
4. **Image Optimization**: Astro Image component with constrained layout
5. **Lazy Loading**: Pagefind UI loaded on idle callback
6. **CSS**: Tailwind v4 with minimal custom CSS

---

## Accessibility Features

1. **Semantic HTML**: Proper heading hierarchy, landmarks
2. **ARIA**: Labels, expanded states, current page indicators
3. **Skip Link**: "skip to content" link for keyboard users
4. **Focus Management**: Visible focus indicators, focus trapping in modals
5. **Color Contrast**: OKLCH color space with accessible contrast ratios
6. **Reduced Motion**: Respects `prefers-reduced-motion`

---

## Notable Customizations

1. **Exchange Rates Feature**: Custom component fetching live FX data, not in original Astro Cactus theme
2. **Cloudflare Deployment**: Configured for Cloudflare Workers with assets
3. **Social Links**: Single GitHub link (personalized)
4. **Homepage Content**: Personalized intro with pronunciation guide
5. **Font Stack**: Roboto Mono for OG images, system fonts for UI

---

## Development Workflow

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm postbuild` | Generate search index |
| `pnpm preview` | Preview production build |
| `pnpm check` | Type checking + linting |
| `pnpm lint` | Auto-fix linting issues |
| `pnpm format` | Format with Prettier |

---

## Summary

This is a well-architected, modern static site built with Astro v5. It demonstrates best practices for:
- Content collection management
- Type-safe development
- Component modularity
- Performance optimization
- Accessibility
- Developer experience (Biome, TypeScript, pnpm)

The ExchangeRates component is a unique addition showing integration with external APIs for dynamic content within a static site architecture.
