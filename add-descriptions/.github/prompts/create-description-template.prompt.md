---
description: Create a descriptions CSV listing every table, column and measure in the semantic model
---

Read every TMDL file under the `*.SemanticModel/definition/tables` folder.

Create `descriptions/model-descriptions.csv` with the header `table,object_type,object_name,description` and one row for every table, column and measure.

Rules:
- object_type is `table`, `column`, or `measure`.
- Use object names exactly as they appear in TMDL, without surrounding quotes.
- If an object already has a `///` description, put that text in the description column. Otherwise leave it blank.
- Quote any value that contains a comma.
- Order rows by table, then the table row, then measures, then columns.
- Skip tables whose names start with `LocalDateTable_` or `DateTableTemplate_`.
- If the CSV already exists, do not overwrite it. Add rows only for objects that are missing, and leave existing rows unchanged.
- Do not change any TMDL files.

When finished, report how many rows you created and how many already had a description.
