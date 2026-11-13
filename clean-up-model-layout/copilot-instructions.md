# Repository Guidance

- Treat `_brief/report-spec.json` as the canonical machine-readable definition for the model, fictional data, theme, and report pages.
- Generated PBIP, PBIR, and TMDL files are committed build outputs under `build/`. Change the JSON spec or `tools/build-report.mjs`, then rebuild with `npm run build`; do not hand-edit generated output as the source of truth.
- Before delivery, run `npm run demo:prepare`. It checks JavaScript syntax, rebuilds the PBIP, and validates the report definition.
- The project is local-only and uses fictional LEGO-like/demo data. Do not add publishing steps or credentials.
- The build does not require MCP servers. Any personal Fabric MCP connection or account-specific skills are configured separately by each user and must not be committed.
- To open the generated report, use `npm run desktop:open`; Power BI Desktop must be installed and signed in as needed.
- For every commit, create exactly one Markdown record under the root `prompt_history/` directory containing the exact text of the user prompt(s) that requested the committed work. Preserve wording, punctuation, and line breaks; do not paraphrase. If a single request spans multiple turns, include each relevant user prompt verbatim in order.
- Link the record from the commit body using a repository-relative Markdown link, for example `Prompt history: [prompt_history/2026-10-15-example.md](prompt_history/2026-10-15-example.md)`. Do not amend or rewrite older commits just to add prompt-history links; apply this convention to new commits.
- Treat prompt-history files as committed repository content. Do not put credentials, tokens, or other secrets in them; if a prompt contains sensitive material, stop and ask before recording or committing it verbatim.
