# Agent instructions

Complete the requested change through relevant validation, fixing failures caused by the change and rerunning affected checks without asking at each step. Report unrelated failures and any remaining blocker.

Do not commit without explicit user permission. Local implementation and validation do not authorize deployment or changes to production data.

## Read when relevant

- [CONTRIBUTING.md](CONTRIBUTING.md): development commands, validation, commits, and GitHub issue workflows.
- [README documentation index](README.md#documentation): choose the topic guide for the behavior being changed; terminology and design reasons live alongside that behavior.
- [Cloudflare integration](docs/cloudflare.md): runtime, bindings, deployment, or platform errors. Retrieve current official documentation for the APIs or limits the task depends on.

Update the relevant topic guide when behavior or a significant design constraint changes. Repository skills should follow this layout instead of creating `CONTEXT.md` or `docs/adr/`.
