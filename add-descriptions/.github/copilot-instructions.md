# Copilot instructions for this folder

This folder contains a Power BI Project (PBIP). The semantic model is stored as TMDL under `LEGO Sets 2025.SemanticModel/definition/`.

## Source of descriptions
- Business descriptions live in `descriptions/model-descriptions.csv`.
- Use the description text exactly as written in the CSV. Do not rewrite, shorten, or improve it.
- Never invent a description. If an object has no row in the CSV, leave it alone and report it.

## Descriptions in TMDL
- Descriptions are written as `///` lines directly above the object they describe (table, column, measure).
- Never use `//` for descriptions. That is a plain comment and will not show up in Power BI.
- If an object already has a `///` description, replace it with the CSV text.
- Only add or change `///` lines. Do not modify expressions, data types, names, or formatting.

Example:

```
/// Net sales after discounts for the current filter context.
measure 'Revenue' = SUMX(Sales, Sales[Quantity] * Sales[UnitPrice] * (1 - Sales[DiscountPct]))
    formatString: $#,##0.00
```
