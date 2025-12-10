# Repository Guidelines

## Project Structure & Module Organization
- `src/pages` holds route entries, with `src/layouts` for shared shells and `src/components` for reusable UI. Styles live in `src/styles`, split by blocks/components.
- `src/content/{post,note,tag}` stores markdown content; filenames become slugs. `src/data` centralizes content metadata, `src/utils` contains helpers, and `src/plugins` houses remark plugins. Static assets belong in `public/`.
- Site-wide settings sit in `src/site.config.ts`; Astro and Tailwind configuration are in `astro.config.ts` and `tailwind.config.ts`.

## Build, Test, and Development Commands
- `npm install` (or `pnpm install`) installs dependencies; postinstall rebuilds `sharp` for your platform.
- `npm run dev` (alias `start`) launches the Astro dev server with HMR.
- `npm run build` produces `dist/`; run `npm run postbuild` afterward to generate the Pagefind search index.
- `npm run preview` serves the built site for QA.
- `npm run check` runs `astro check` plus `biome check` (no writes); `npm run lint` fixes with Biome; `npm run format` runs Prettier across the repo.

## Coding Style & Naming Conventions
- Biome enforces tabs, 100-character lines, semicolons, trailing commas, and self-closing HTML where applicable.
- Use PascalCase for components/layouts, camelCase for utilities, and kebab-case for content slugs and new directories.
- Keep Astro components small; colocate component-specific styles under `src/styles/*` when practical, and prefer named exports in TypeScript utilities.

## Testing & Quality
- There is no automated test suite yet; run `npm run check`, `npm run build && npm run postbuild`, and `npm run preview` before opening a PR.
- Manually verify new content renders with the expected frontmatter and that Pagefind still indexes posts/notes after changes.
- When adding new utility logic, include inline docs or a temporary reproduction page under `src/pages/dev/` (remove before merging) to demonstrate behavior.

## Content & Assets
- Blog content lives in `src/content/post`, notes in `src/content/note`, and tags in `src/content/tag`; keep frontmatter aligned with schemas in `src/content.config.ts`.
- Place shared images in `public/`; reference cover/OG images from frontmatter. Update social links and metadata in `src/site.config.ts` when branding changes.

## Commit & Pull Request Guidelines
- Use concise, imperative commit subjects (e.g., `Add note tag cards`); group related changes together.
- PRs should include a brief summary, linked issue (if any), local test commands run, and screenshots or gifs for visual changes/OG-image updates.
- Ensure `npm run check` passes and note the Pagefind rebuild in validation steps when content or search logic changes.
