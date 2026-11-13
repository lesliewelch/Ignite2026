# Add Descriptions to a Power BI Semantic Model with GitHub Copilot

GitHub Copilot reads business descriptions from a CSV file and writes them into a Power BI semantic model. No manual editing of model files.

Companion demo for the Microsoft Ignite 2026 session *Build AI-powered Microsoft Fabric workflows with GitHub Copilot* (November 19, 2026), presented by Leslie Welch and Kevin Pereira.

## What's in this folder

```
add-descriptions/
  .github/
    copilot-instructions.md                  Rules Copilot follows in this folder
    prompts/
      add-descriptions.prompt.md             /add-descriptions: apply the CSV to the model
      create-description-template.prompt.md  /create-description-template: build a CSV from a model
  descriptions/
    model-descriptions.csv                   Business descriptions, one row per object
  build/
    LEGO Sets 2025.pbip                      Demo Power BI project (fictional data)
    LEGO Sets 2025.SemanticModel/            Model as TMDL, starts with no descriptions
    LEGO Sets 2025.Report/
```

## Part 1: Run the demo

### What you need
- Power BI Desktop
- [VS Code](https://code.visualstudio.com/) and [Git](https://git-scm.com/download/win)
- A GitHub account with access to GitHub Copilot

### Set up
1. **Clone the repo.** In VS Code, press `Ctrl+Shift+P`, run **Git: Clone**, and pick this repo. GitHub Desktop works too.
2. **Open this folder, not the repo root.** Use **File > Open Folder** and choose `add-descriptions`. Copilot only reads the `.github` folder at the top of the folder you open.
3. **Sign in to Copilot.** Use the Accounts icon at the bottom left of VS Code. Install the GitHub Copilot extensions if VS Code offers them.

### Run
1. Close Power BI Desktop if it is open.
2. Open Copilot Chat (`Ctrl+Alt+I`) and set the mode to **Agent**.
3. Type `/add-descriptions` and press Enter.
4. Read Copilot's report. It lists what it updated, plus any CSV rows that didn't match the model.
5. Review the changes in the **Source Control** view. Each object gains a `///` line and nothing else changes. Keep or undo the edits from there.
6. Open `build/LEGO Sets 2025.pbip` in Power BI Desktop. Hover over a table, column, or measure in the Data pane to see its description.

### Reset
Discard the changes to the `.tmdl` files in the Source Control view (or in GitHub Desktop). The model goes back to having no descriptions.

## Part 2: Use it with your own semantic model

This works on any model saved as a Power BI Project. Do this in a dev copy or a branch, not your production files.

1. **Save your model as a PBIP.** In Power BI Desktop, use **File > Save as** and choose **Power BI project files (\*.pbip)**. Check that you have a `YourModel.SemanticModel/definition/tables` folder with `.tmdl` files. If you see `model.bim` instead, turn on **Store semantic model using TMDL format** under **Options > Preview features** and save again.
2. **Copy in the Copilot files.** Copy this folder's `.github` folder into your project folder, next to your `.pbip`. The prompts find the `*.SemanticModel` folder by themselves, so you don't need to change any paths. Keep one model per folder.
3. **Create your CSV.** Open your project folder in VS Code, switch Copilot Chat to Agent mode, and run `/create-description-template`. Copilot creates `descriptions/model-descriptions.csv` with a row for every table, column and measure. Descriptions that already exist in your model are filled in.
4. **Fill in the descriptions.** Edit the CSV in Excel or any editor. If you use Excel, save as **CSV UTF-8**. Rows with a blank description are skipped, so you can work in batches.
5. **Apply them.** Close Power BI Desktop, then run `/add-descriptions`. Check the report for rows that didn't match.
6. **Review and commit.** Review the diff, commit, and open a pull request if your team uses them.
7. **Check in Desktop**, then publish through your normal process.

The CSV becomes the place your team maintains descriptions. Update it and rerun `/add-descriptions` whenever they change.

### CSV format

| Column | Value |
|---|---|
| `table` | Table name, as it appears in the model |
| `object_type` | `table`, `column`, or `measure` |
| `object_name` | Object name. For a table row, the table name again |
| `description` | The description text. Leave blank to skip |

## How it works

- **Descriptions in TMDL are `///` lines** directly above the object. A `//` line is only a comment and does not show up in Power BI. Copilot is told about this in `copilot-instructions.md`.
- **`copilot-instructions.md`** holds rules that apply to every chat in the folder: copy the CSV text exactly, never invent a description, and change nothing except `///` lines.
- **Prompt files** in `.github/prompts` become slash commands in Copilot Chat. Edit them to change what each command does.

## Things to watch for

- **Close Power BI Desktop before running Copilot.** Desktop doesn't reload files changed on disk, and saving from Desktop overwrites Copilot's edits.
- **Auto date/time tables.** If auto date/time is on, Desktop adds hidden `LocalDateTable_` tables that will show up as having no descriptions. Turn it off under **Options > Current File > Data Load**, and under **Global > Data Load** for new files.
- **Review before you merge.** Treat Copilot's edits like any other code change. Read the diff and the report before committing.
