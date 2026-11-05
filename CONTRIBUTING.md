# Contributing

## Development

Use Node.js 24 (matching CI) and pnpm. Install dependencies with `pnpm install`; postinstall rebuilds `sharp`.

| Command              | Purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `pnpm run dev`       | Generate icons and binding types, build, then start the Astro dev server        |
| `pnpm start`         | Start Astro directly without the setup/build steps                              |
| `pnpm test`          | Run Vitest tests in Node                                                        |
| `pnpm astro check`   | Check TypeScript and Astro component types                                      |
| `pnpm run check`     | Generate icons, then run Astro, Biome, and Prettier checks without source fixes |
| `pnpm run lint`      | Apply Biome fixes and organize imports                                          |
| `pnpm run format`    | Format the repository with Prettier                                             |
| `pnpm run build`     | Build the site; the `postbuild` lifecycle script generates the Pagefind index   |
| `pnpm run postbuild` | Regenerate Pagefind for an existing `dist/` build                               |
| `pnpm run preview`   | Serve the built site for manual checks                                          |
| `pnpm run types`     | Regenerate Cloudflare binding types                                             |

Scripts are defined in [package.json](package.json). The lint and format commands write across the repository; for a focused edit, pass changed paths directly to `pnpm exec biome check --write` or `pnpm exec prettier --write`.

## Validation

Choose checks that exercise the change:

- Documentation: check Markdown formatting and referenced paths or commands.
- Application code: run affected Vitest tests and `pnpm astro check`; build to catch prerender and integration failures. The full CI checks are `pnpm run check`, `pnpm test`, and `pnpm run build`.
- Content or search: build, confirm Pagefind completed, and inspect affected posts, tags, and search results in preview. Run `pnpm run postbuild` separately if lifecycle hooks did not run.
- UI: inspect affected pages in development or preview, including relevant responsive and keyboard behavior.
- Bindings: run `pnpm run types` after changing `wrangler.jsonc` or `.dev.vars`.

Vitest uses `src/**/*.test.ts` with no Workers runtime. Binding-dependent tests use injected dependencies; examples live in `src/lib/api/exchange/`, with a shared D1 stand-in at `src/lib/testing/fake-d1.ts`.

## Commits and pull requests

Use Conventional Commit subjects and a body explaining the changes and intent. Format and lint changed files before staging; keep unrelated edits out of the commit.

For code changes, run `pnpm run check`, `pnpm test`, and `pnpm run build` before committing or opening a PR. For documentation-only changes, check formatting and references. For content or search changes, verify the Pagefind index; for visual changes, inspect the affected pages and include screenshots.

PR descriptions should state the resulting behavior, related issue if any, validation performed, and known limitations.

## Maintaining documentation

Use the topic guides linked from [README](README.md#documentation) for current behavior, terminology, constraints, and significant design reasons. Update the relevant guide alongside behavior changes. Keep discussion history in issues, PRs, and Git history; this project no longer maintains a separate domain glossary or numbered decision records.

Read only the topics relevant to the task. Preserve documented invariants when changing code, and explain any intentional change to them. Add a topic file only when existing guides cannot reasonably hold the material.

## Issue tracker

Issues and PRDs live in GitHub Issues. Use `gh` from this clone so it infers the repository. External PRs are not part of the triage queue for this personal site.

- To fetch a ticket, use `gh issue view <number> --comments`; include its labels when assessing status.
- To find work, use `gh issue list` with relevant state and label filters.
- When the requested workflow includes publishing a spec or ticket, create a GitHub issue. Use `--body-file <path>` for multiline issue bodies and comments.
- Apply the [triage labels](#triage-labels) when classifying issues.

Reading an issue does not authorize posting comments, changing labels, or closing it. Make those updates when included in the user's request or an explicitly invoked workflow; existing authorization covers its necessary steps without repeated confirmation.

## Triage labels

Use these labels when classifying GitHub issues:

| Label             | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| `needs-triage`    | Maintainer needs to evaluate the issue                  |
| `needs-info`      | Waiting on the reporter for more information            |
| `ready-for-agent` | Fully specified and ready for autonomous implementation |
| `ready-for-human` | Requires human implementation                           |
| `wontfix`         | Will not be actioned                                    |

When a skill refers to an "AFK-ready" label, use `ready-for-agent`.
