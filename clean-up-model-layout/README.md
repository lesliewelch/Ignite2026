# LEGO Sets 2025 Power BI Project

This repository contains a deterministic, locally generated Power BI Project (PBIP) and its source specification.

For a presenter cloning this repo onto their own machine, see the [Ignite speaker setup guide](docs/SPEAKER-SETUP.md), including optional Fabric skills and MCP setup.

## Clone Setup

1. Clone the repository and open its root folder in VS Code.
2. Install Node.js 20.11 or later.
3. Run `npm ci` to install the pinned Power BI authoring and Desktop bridge CLIs.
4. Install/sign in to GitHub Copilot and Copilot Chat when prompted. VS Code will offer the workspace extension recommendations.

The workspace instructions are in `.github/copilot-instructions.md`. They are shared by Git; each user still needs their own Copilot access. The generator itself uses only Node.js built-in modules and does not require MCP, a special agent, or a scaffold command.

## Build and Validate

From the repository root, run the complete pre-demo check:

```powershell
npm run demo:prepare
```

Or run individual tasks:

```powershell
npm run build
npm run validate
```

The builder reads [_brief/report-spec.json](_brief/report-spec.json) and creates these committed outputs under `build/`:

- `build/LEGO Sets 2025.pbip`
- `build/LEGO Sets 2025.Report/`
- `build/LEGO Sets 2025.SemanticModel/`

To generate into a separate directory instead, pass the path directly to Node. This does not replace the tracked `build/` outputs:

```powershell
node .\tools\build-report.mjs "C:\temp\lego-build"
```

Each run replaces only those three generated outputs in the selected output directory. `build/` is a conventional build-artifact directory; these PBIP outputs are committed so a clone includes the ready-to-open demo, while remaining reproducible from source. Keep model, data, theme, and page changes in `report-spec.json`; do not hand-edit generated PBIR or TMDL files as the source of truth.

## Open in Power BI Desktop

Install Power BI Desktop, then open the generated project with:

```powershell
npm run desktop:open
```

Refresh the model in Desktop if prompted. Desktop-generated local state and screenshots are excluded from source control.

## Copilot and MCP Scope

This repo shares project-specific Copilot instructions, but it does not provision Copilot licenses, personal Fabric skills/plugins, MCP servers, authentication, or Fabric permissions. Each presenter must set up those account-specific tools on their own machine. MCP is not required to build or validate this local report.
