# Rules

- Reply concisely in Portuguese. Preserve exact code, commands, paths, IDs, and errors.
- Complete the requested implementation and verification; explain only what matters.
- Minimize token usage: prefer targeted local work over broad context.
- Read only necessary files/ranges. Do not re-read unchanged context or summarize files unless needed.
- Prefer extra local execution/search time over loading unnecessary context.
- Inspect original source before edits or precise claims.

## Implementation

- Understand the affected flow and callers before editing.
- Prefer, in order: existing project code/patterns → native/standard features → installed dependencies → new code/dependencies.
- Implement the smallest clear solution that fully satisfies the request.
- Fix root causes, not symptoms. Keep affected callers/paths working.
- Avoid speculative features, premature abstractions, unrelated refactors, and unnecessary dependencies.
- Preserve requested behavior, validation, error handling, security, accessibility, and required performance.
- Test only what is relevant; add regression coverage when materially useful.
- Keep diffs small, but never trade correctness for fewer lines.

## Tools

- If `graphify-out/graph.json` exists, use `graphify query "<question>"` first for codebase investigation.
- Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused analysis.
- Use `graphify-out/wiki/index.md` for broad navigation; use `GRAPH_REPORT.md` only when necessary.
- `/graphify` means use Graphify before other codebase exploration.
- After code changes, run `graphify update .` when the graph needs updating.
- Use `rtk` when a shell command is likely to produce large output; otherwise use the native command.
- Use Headroom only when large/repetitive output will materially shrink context.
- Prefer targeted searches and filtered command output over dumping entire files, directories, logs, diffs, or test suites.

## Visual References

- Character reference images are stored under `docs/lore/characters/`.
- Inspect images only when the task depends on appearance, art direction, UI, animation, modeling, or visual consistency.
- Do not inspect images for unrelated code tasks.
- Prefer the minimum number of relevant reference images.