---
description: Apply business descriptions from CSV to the Power BI semantic model (TMDL)
---

Read `descriptions/model-descriptions.csv`. Each row has: table, object_type (table, column, or measure), object_name, description.

For each row with a non-blank description, find the matching object in the TMDL files under the `*.SemanticModel/definition/tables` folder and set its `///` description to the CSV text, following the repo instructions.

When finished, report:
1. How many objects you updated, by table.
2. CSV rows that did not match any object in the model.
3. CSV rows skipped because the description was blank.
4. Columns and measures in the model that have no CSV row.
