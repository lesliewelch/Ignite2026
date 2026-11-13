# Repository Guidance

## Source of truth
- `_brief/report-spec.json` is the canonical definition for the model, fictional data, theme, and report pages.
- PBIP, PBIR, and TMDL files under `build/` are committed build outputs. To change the model or report, edit the spec or `tools/build-report.mjs`, then rebuild with `npm run build`. Do not hand-edit generated output, except for the model layout file below.
- The project is local-only and uses fictional LEGO-like data. Do not add publishing steps or credentials.
- The build does not require MCP servers. Personal Fabric MCP connections and account-specific skills are configured by each user and must not be committed.

## Build and open
- Before delivery, run `npm run demo:prepare`. It checks JavaScript syntax, rebuilds the PBIP, and validates the report definition.
- To open the report, run `npm run desktop:open`. Power BI Desktop must be installed.

## Model layout views
- `build/LEGO Sets 2025.SemanticModel/diagramLayout.json` is the one generated file you may create or edit directly. Follow `docs/MODEL-LAYOUT-VIEWS.md` exactly.
- Read table fields from the TMDL files in `build/LEGO Sets 2025.SemanticModel/definition/tables` and page membership from `_brief/report-spec.json`. Do not change either.
- `npm run build` and `npm run demo:prepare` delete `diagramLayout.json`. Never run them after a layout has been created unless asked.
- Prompt files in `.github/prompts` set their own scope. When their limits are narrower than these instructions, follow the prompt.

## Prompt history
- For every commit, create one Markdown file under `prompt_history/` containing the exact text of the user prompts that requested the committed work. Preserve wording, punctuation, and line breaks. If a request spans several turns, include each prompt in order.
- Link the file from the commit body with a repository-relative link, for example `Prompt history: [prompt_history/2026-10-15-example.md](prompt_history/2026-10-15-example.md)`. Do not amend older commits to add links.
- Prompt history files are committed content. Never include credentials, tokens, or other secrets. If a prompt contains sensitive material, stop and ask before recording it.
