# Use the Layout Tools with Your Own Semantic Model

This repo includes two scripts that work on any Power BI project, not just the LEGO demo:

| Script | What it does |
|---|---|
| `tools/check-layout-compatibility.mjs` | Read-only. Checks whether your model can use the layout rules and shows what it detected. |
| `tools/layout-model.mjs` | Writes `diagramLayout.json`: an All Tables view plus one view per report page, following [MODEL-LAYOUT-VIEWS.md](MODEL-LAYOUT-VIEWS.md). |

Both use only Node.js built-in modules. You need [Node.js](https://nodejs.org) 20.11 or later, and nothing else to install.

## Before you start

- **Save your model as a Power BI project (.pbip) in TMDL format.** In Power BI Desktop, use **File > Save as > Power BI project files**. If the `.SemanticModel` folder has `model.bim` instead of a `definition` folder, turn on **Options > Preview features > Store semantic model using TMDL format** and save again.
- **For per-page views, save the report in PBIR format.** Turn on **Options > Preview features > Store reports using enhanced metadata format (PBIR)**. Without it, you only get the All Tables view.
- **Work on a copy or a branch, and commit first.** The layout script writes into your project folder.
- **Close Power BI Desktop.** Desktop doesn't reload files changed on disk, and saving from Desktop overwrites them.
- **Turn off Auto date/time** under **Options > Current File > Data Load**. Its hidden tables are skipped, but they clutter the model.

## Step 1: Check your model

From this repo's `clean-up-model-layout` folder, point the checker at your project folder:

```powershell
node tools/check-layout-compatibility.mjs "C:\path\to\your\project"
```

You get a verdict, a list of what to fix, the role detected for each table, and the tables each report page uses.

- **FAIL**: fix it before going further. The output says how.
- **WARN**: the layout still works, but check it. Most warnings are tables that need a role override (Step 3).

## Step 2: Preview the views

```powershell
node tools/layout-model.mjs "C:\path\to\your\project" --dry-run
```

This shows the facts, dimensions, and views it would create, without writing anything.

## Step 3: Add overrides (only if needed)

Roles are worked out from relationships:

| Table | Row |
|---|---|
| Many side of one-to-many relationships | Fact (bottom row) |
| One side of one-to-many relationships | Dimension (top row) |
| Both sides, such as a snowflaked lookup | Dimension, with a note |
| Calculation group, field parameter, or measure-only table | Left out, with a note |
| No one-to-many relationships | The script stops and asks for an override |

To change any of these, create a `roles.json` file:

```json
{
  "facts": ["Budget"],
  "dimensions": ["Exchange Rates"],
  "exclude": ["Scratch Table"]
}
```

Then add `--roles roles.json` to the commands in Steps 2 and 4.

## Step 4: Write the layout

```powershell
node tools/layout-model.mjs "C:\path\to\your\project"
```

If your project already has a `diagramLayout.json`, the script stops. Commit or back it up first, then add `--force` to replace it.

## Step 5: Check it in Power BI Desktop

Open the `.pbip` and go to **Model view**. Use the view tabs at the bottom to switch between All Tables and the page views. If it looks right, commit `diagramLayout.json`.

## Changing the layout style

Spacing, card width, and row heights are set in the `geometry` block at the top of `tools/layout-model.mjs`. Change them there, then rerun with `--force`.

## Using Copilot instead of the terminal

Open your project folder in VS Code with Copilot Chat in **Agent** mode and ask:

```
Run node <path-to-this-repo>/clean-up-model-layout/tools/check-layout-compatibility.mjs . --json and explain the results. Do not change any files.
```

Copilot runs the check and suggests overrides for any warnings. When you are ready, ask it to run `layout-model.mjs` the same way.

## Limits

- One semantic model per folder. Point the scripts at a folder that contains only one `.SemanticModel`.
- Page views come from the fields used in each page's visuals and page filters. A page that uses no model fields gets no view.
- Every card is fully expanded, so tables with many fields make tall rows. Hiding unused columns first helps.
