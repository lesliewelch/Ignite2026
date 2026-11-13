# Semantic Model Layout Views

This document defines the required diagram layouts for the Power BI semantic model. Treat these rules as source requirements for the model generator; do not preserve manual edits to generated model-layout metadata.

## Required Views

Create these layout views:

1. **All Tables**: include every model table and every relationship whose two endpoints are included.
2. **One view per report page**: include the tables assigned to that page in `_brief/report-spec.json`, plus relationships whose two endpoints are included in that page view. Name each view after its report page.

Do not create additional per-theme, per-fact, or per-dimension views unless the report specification later requests them.

## Table Classification

Use the following model roles to assign rows:

- **Dimensions (top row)**: `Date`, `Designer`, `Promotion`, `Set`, `Store`, `Theme`.
- **Facts (bottom row)**: `Inventory`, `Reviews`, `Sales`.

If tables are added later, classify each as fact or dimension in the report specification before generating layouts. Do not infer row placement from table names alone.

## Ordering and Horizontal Placement

Apply these rules independently in each view, using only that view's included tables:

- Sort table display names alphabetically, case-insensitively, within each role.
- Place facts in the bottom row, left to right, starting at the layout's left margin.
- Place dimensions in the top row, left to right, starting immediately after the right edge of the final fact table plus the standard horizontal gap. This keeps the dimension row offset to the right of all facts.
- Advance each next table by the previous table's rendered width plus the same horizontal gap. Never use a fixed per-table x increment that can cause overlap when table widths differ.
- Use a single configured left margin and horizontal gap consistently across views. Keep these values in the model-layout generator/configuration, not duplicated per view.

## Expanded Table Heights

Every table card must be fully expanded so every field is visible without scrolling or collapsing the table.

- Count all fields displayed in the model layout, including columns and measures.
- Compute each table's expanded content height from its header/chrome plus the height needed for all displayed fields.
- Set every dimension card in a view to the height of the tallest dimension card in that view.
- Set every fact card in a view to the height of the tallest fact card in that view.
- Place the fact row below the dimension row: its y-coordinate is the top-row y-coordinate plus the common dimension-row height plus the configured vertical gap. Do not derive the second-row position from a particular dimension table; use the row maximum.
- Keep each row's cards aligned at a common y-coordinate. A table with fewer fields retains the common row height; do not vertically center it or shrink it.

## Page Membership

The complete-model view contains all tables. Each report-page view contains exactly the tables associated with that page in `_brief/report-spec.json`'s page table usage. When the JSON specification is updated or renamed, update this layout document's classification only if table roles change; page membership should always be read from the JSON specification.

## Generation and Validation

The layout generator should create stable view identities and deterministic positions from the sorted membership, rendered table widths, expanded field counts, and configured margins/gaps. Rebuilding from identical model metadata and JSON specification must produce identical layout metadata.

Validate that:

- The complete-model view includes every table exactly once.
- There is exactly one page view for every report page.
- Each page view has precisely the specified table membership.
- Dimension and fact ordering is alphabetical within each row.
- The leftmost fact begins at the left margin, and the first dimension begins after the final fact plus the horizontal gap.
- All table cards are expanded and use their row group's maximum height.
- The fact row begins after the full dimension-row height plus the vertical gap.
- No table rectangles overlap within a view.
- Every relationship shown has both endpoints present in that view.
