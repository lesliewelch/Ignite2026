---
description: Check whether a Power BI project can use the model layout view rules (read-only)
---

Check the Power BI project at `${input:projectPath:Path to the PBIP project folder, or . for this folder}` for compatibility with the layout rules in `docs/MODEL-LAYOUT-VIEWS.md`.

1. Run this in the terminal, using the path above:
   `node tools/check-layout-compatibility.mjs "<path>" --json`
   If Node.js is not installed, stop and say that Node.js 20.11 or later is required.
2. Do not create, change, or delete any files. Do not commit. This is a read-only check.
3. Report back in this order:
   - **Verdict:** Compatible, Compatible with changes, or Not compatible.
   - **What to fix:** each FAIL and WARN in plain language, with its fix. FAILs first.
   - **Detected roles:** a table of every table and its detected role (fact, dimension, both, or other).
   - **Suggested overrides:** for each table marked `both` or `other`, suggest whether it belongs in the fact row, the dimension row, or a separate row, with a one-line reason. Label these as suggestions for the user to confirm.
   - **Page views:** the tables each report page uses, if the report was readable.

Keep the report short. Do not explain checks that passed.
