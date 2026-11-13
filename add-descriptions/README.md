# Add Descriptions Demo

GitHub Copilot applies business descriptions from a CSV to a Power BI semantic model.

## Setup
1. Open this folder (not the repo root) in VS Code so Copilot picks up `.github/`.
2. The model starts with no descriptions. Descriptions are in `descriptions/model-descriptions.csv`.

## Run
1. In Copilot Chat (agent mode), run `/add-descriptions`.
2. Review the diff: each object gets a `///` line.
3. Open `LEGO Sets 2025.pbip` in Power BI Desktop and hover over a field to see its description.

## Reset
Discard the changes to the `.tmdl` files in GitHub Desktop.
