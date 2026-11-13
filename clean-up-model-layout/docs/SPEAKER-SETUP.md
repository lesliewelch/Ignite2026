# Ignite Speaker Setup

This guide is for a presenter using their own Windows machine and VS Code. The PBIP build is local and does not need Copilot skills or MCP servers. Set those up only if the presentation includes AI-assisted Fabric or Power BI workflows.

## Required for the Report Demo

1. Install Git, Node.js 20.11 or later, VS Code, and Power BI Desktop.
2. Clone this repository and open its root folder in VS Code.
3. Sign into GitHub Copilot if you plan to use the shared Copilot instructions.
4. Install the pinned project tools and build/validate the report:

   ```powershell
   npm ci
   npm run demo:prepare
   ```

5. Open the generated report in Power BI Desktop:

   ```powershell
   npm run desktop:open
   ```

   Refresh the model if Desktop prompts you.

The repository's `.github/copilot-instructions.md` gives Copilot project-specific guidance. `.vscode/extensions.json` recommends Copilot and Copilot Chat. These files do not grant Copilot licenses or sign the presenter in.

## Optional Fabric Skills and Agents

Install the Microsoft Fabric plugin bundles in VS Code. In Copilot Chat, run:

```text
/plugin marketplace add microsoft/skills-for-fabric
/plugin install fabric-skills@fabric-collection
/plugin install powerbi-authoring@fabric-collection
```

Alternatively, open Extensions and search for `@agentPlugins`, or open **Chat: Open Customizations** from the Command Palette and install from the Microsoft marketplace. Review the publisher and requested tools and accept the trust prompt. Reload VS Code if prompted.

Use **Chat: Configure Skills** to confirm installed skills are enabled. Use **MCP: List Servers** to inspect the servers supplied by the plugins.

The `fabric-skills` bundle includes FabricIQ, Power BI modeling, and SQL endpoint MCP connections. The `powerbi-authoring` bundle also supplies Power BI modeling support. If the MCP server list shows duplicate Power BI modeling servers after installing both bundles, disable the duplicate in **MCP: List Servers**; the report build itself does not depend on either one.

Plugin availability and names can change. Browse the Microsoft marketplace and check the plugin description/version at setup time:

- [Microsoft Skills for Fabric](https://github.com/microsoft/skills-for-fabric)
- [VS Code agent plugins](https://code.visualstudio.com/docs/agent-customization/agent-plugins)

## Optional Standalone Power BI Modeling MCP

Use this only if the `powerbi-authoring` or `fabric-skills` plugin has not already installed the modeling server. In VS Code, run **MCP: Add Server**, select a local command (stdio), then enter:

- Command: `npx`
- Arguments: `-y`, `@microsoft/powerbi-modeling-mcp@latest`, `--start`
- Save target: **User** (personal profile), not this repository

Review and trust the server before starting it. It may connect to local Power BI Desktop or Fabric models and can expose authoring tools. For supported setup and authentication behavior, consult the [Power BI Modeling MCP repository](https://github.com/microsoft/powerbi-modeling-mcp).

## Sign-In and Fabric Access

Each speaker must use their own approved identities and access:

- GitHub account with Copilot entitlement for Copilot features.
- Power BI Desktop sign-in for local report use as required by the organization's licensing.
- Microsoft Fabric / Power BI permissions for any live models, workspaces, or data accessed through MCP.
- Any required tenant admin consent or organizational approval for MCP services.

Never commit access tokens, API keys, tenant-specific endpoints, personal MCP configuration, or local Copilot plugin caches. Do not copy another presenter's profile or credentials. The demo data in this repository is fictional, and its build does not require Fabric access.

## Troubleshooting

- `npm ci` or `npm run demo:prepare` fails: verify Node.js is 20.11+ and rerun `npm ci` from the repository root.
- Skills do not appear: open **Chat: Configure Skills**, confirm the plugin is installed/enabled, then reload VS Code.
- MCP tools do not appear: run **MCP: List Servers**, start the intended server, review its output log, and complete any sign-in/consent prompt.
- Power BI Desktop cannot open the PBIP: confirm Desktop is installed, run `npm run build`, then open `build/LEGO Sets 2025.pbip` from the repository.
