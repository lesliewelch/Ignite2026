#!/usr/bin/env node
// Generates Power BI model view layouts (diagramLayout.json) for any PBIP,
// following docs/MODEL-LAYOUT-VIEWS.md. Uses only Node.js built-in modules.
//
// Usage:
//   node layout-model.mjs <project-folder> [--roles roles.json] [--dry-run] [--force]
//
//   --roles    JSON file with overrides: { "facts": [], "dimensions": [], "exclude": [] }
//   --dry-run  Print the planned views without writing anything
//   --force    Replace an existing diagramLayout.json

import fs from 'node:fs';
import path from 'node:path';

// ---------- arguments ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--roles');
const root = path.resolve(positional[0] ?? '.');
const dryRun = flag('--dry-run');
const force = flag('--force');
const rolesFile = option('--roles');

function fail(message) { console.error(`\nError: ${message}\n`); process.exit(1); }

// ---------- layout settings (match docs/MODEL-LAYOUT-VIEWS.md) ----------
const geometry = {
  leftMargin: 0, topMargin: 0, horizontalGap: 16, verticalGap: 56,
  tableWidth: 234, headerHeight: 80, fieldHeight: 24, minimumHeight: 152, zoomValue: 80
};
const AUTO_DATE = /^(LocalDateTable_|DateTableTemplate_)/;

// ---------- TMDL parsing ----------
const unquote = (s) => (s.trim().startsWith("'") ? s.trim().slice(1, -1).replace(/''/g, "'") : s.trim());
const readName = (rest) => { const m = rest.match(/^('(?:[^']|'')*'|[^\s=]+)/); return m ? unquote(m[1]) : rest.trim(); };
function tableOfColumnRef(ref) {
  const s = ref.trim();
  if (s.startsWith("'")) { const m = s.match(/^'((?:[^']|'')*)'\./); return m ? m[1].replace(/''/g, "'") : s; }
  return s.split('.')[0];
}

function findModel(dir, depth = 4) {
  const found = [];
  (function walk(d, level) {
    if (level < 0 || !fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (!e.isDirectory() || ['node_modules', '.git', '.pbi'].includes(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.name.endsWith('.SemanticModel')) found.push(full); else walk(full, level - 1);
    }
  })(dir, depth);
  if (found.length === 0) fail(`No *.SemanticModel folder found under ${dir}. Save the report as a .pbip first.`);
  if (found.length > 1) fail(`Found ${found.length} semantic models. Point the script at a folder with only one:\n  ${found.join('\n  ')}`);
  return found[0];
}

function readTables(tablesDir) {
  return fs.readdirSync(tablesDir).filter((f) => f.endsWith('.tmdl')).map((f) => {
    const text = fs.readFileSync(path.join(tablesDir, f), 'utf8');
    const t = { name: '', fieldCount: 0, measures: 0, visibleColumns: 0, calcGroup: false, fieldParameter: text.includes('ParameterMetadata') };
    let inColumn = false;
    for (const line of text.split(/\r?\n/)) {
      const depth = line.match(/^\t*/)[0].length;
      const s = line.trim();
      if (depth === 0 && s.startsWith('table ')) t.name = readName(s.slice(6));
      if (depth === 1) {
        inColumn = s.startsWith('column ');
        if (inColumn) { t.fieldCount++; t.visibleColumns++; }
        if (s.startsWith('measure ')) { t.fieldCount++; t.measures++; }
        if (s.startsWith('calculationGroup')) t.calcGroup = true;
      }
      if (inColumn && depth === 2 && s === 'isHidden') t.visibleColumns--;
    }
    if (!t.name) fail(`No table declaration found in ${f}`);
    return t;
  });
}

function readRelationships(file) {
  if (!fs.existsSync(file)) return [];
  const rels = []; let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (s.startsWith('relationship ')) { cur = { from: '', to: '', fromCard: 'many', toCard: 'one' }; rels.push(cur); continue; }
    if (!cur) continue;
    const [key, ...v] = s.split(':'); const value = v.join(':').trim();
    if (key === 'fromColumn') cur.from = tableOfColumnRef(value);
    if (key === 'toColumn') cur.to = tableOfColumnRef(value);
    if (key === 'fromCardinality') cur.fromCard = value;
    if (key === 'toCardinality') cur.toCard = value;
  }
  return rels;
}

// ---------- report pages (PBIR) ----------
function collectEntities(node, out) {
  if (Array.isArray(node)) node.forEach((n) => collectEntities(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'Entity' && typeof v === 'string') out.add(v); else collectEntities(v, out);
    }
  }
  return out;
}

function readPages(reportDir) {
  const pagesDir = path.join(reportDir, 'definition', 'pages');
  if (!fs.existsSync(pagesDir)) return null;
  let order = [];
  const pagesJson = path.join(pagesDir, 'pages.json');
  if (fs.existsSync(pagesJson)) order = JSON.parse(fs.readFileSync(pagesJson, 'utf8')).pageOrder ?? [];
  const pages = [];
  for (const e of fs.readdirSync(pagesDir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const pageFile = path.join(pagesDir, e.name, 'page.json');
    if (!fs.existsSync(pageFile)) continue;
    const page = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
    const tables = new Set();
    const visualsDir = path.join(pagesDir, e.name, 'visuals');
    if (fs.existsSync(visualsDir)) {
      for (const v of fs.readdirSync(visualsDir)) {
        const vf = path.join(visualsDir, v, 'visual.json');
        if (fs.existsSync(vf)) collectEntities(JSON.parse(fs.readFileSync(vf, 'utf8')), tables);
      }
    }
    collectEntities(page.filterConfig ?? {}, tables);
    pages.push({ id: e.name, name: page.displayName ?? e.name, tables });
  }
  const rank = (id) => { const i = order.indexOf(id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  return pages.sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
}

// ---------- roles ----------
function decideRoles(tables, rels, overrides) {
  const names = new Set(tables.map((t) => t.name));
  for (const list of ['facts', 'dimensions', 'exclude']) {
    for (const n of overrides[list] ?? []) if (!names.has(n)) console.warn(`Note: roles file lists "${n}" under ${list}, but it is not in this model.`);
  }
  const many = new Set(); const one = new Set();
  for (const r of rels) {
    if (!names.has(r.from) || !names.has(r.to) || r.fromCard === r.toCard) continue;
    const m = r.fromCard === 'many' ? r.from : r.to;
    many.add(m); one.add(m === r.from ? r.to : r.from);
  }
  const roles = new Map(); const notes = []; const unresolved = [];
  for (const t of tables) {
    const n = t.name;
    if ((overrides.exclude ?? []).includes(n)) { roles.set(n, 'exclude'); continue; }
    if ((overrides.facts ?? []).includes(n)) { roles.set(n, 'fact'); continue; }
    if ((overrides.dimensions ?? []).includes(n)) { roles.set(n, 'dimension'); continue; }
    if (t.calcGroup || t.fieldParameter) { roles.set(n, 'exclude'); notes.push(`${n}: excluded (${t.calcGroup ? 'calculation group' : 'field parameter'})`); continue; }
    if (many.has(n) && one.has(n)) { roles.set(n, 'dimension'); notes.push(`${n}: placed in the dimension row (snowflaked or bridge table)`); continue; }
    if (many.has(n)) { roles.set(n, 'fact'); continue; }
    if (one.has(n)) { roles.set(n, 'dimension'); continue; }
    if (t.measures > 0 && t.visibleColumns === 0) { roles.set(n, 'exclude'); notes.push(`${n}: excluded (measure table)`); continue; }
    unresolved.push(n);
  }
  if (unresolved.length) {
    fail(`These tables have no one-to-many relationships, so their row can't be worked out: ${unresolved.join(', ')}.\n` +
      `Create a roles file and list each one under "facts", "dimensions" or "exclude", then rerun with --roles <file>.`);
  }
  return { roles, notes };
}

// ---------- layout ----------
const sortNames = (names) => [...names].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
const rowHeight = (tables) => Math.max(geometry.minimumHeight, ...tables.map((t) => geometry.headerHeight + geometry.fieldHeight * t.fieldCount));

function buildDiagram(name, included, byName, roles, ordinal) {
  const facts = sortNames([...included].filter((n) => roles.get(n) === 'fact')).map((n) => byName.get(n));
  const dims = sortNames([...included].filter((n) => roles.get(n) === 'dimension')).map((n) => byName.get(n));
  const dimHeight = dims.length ? rowHeight(dims) : 0;
  const factHeight = facts.length ? rowHeight(facts) : 0;
  const factY = geometry.topMargin + (dims.length ? dimHeight + geometry.verticalGap : 0);
  const nodes = []; let z = 1; let x = geometry.leftMargin;
  for (const t of facts) {
    nodes.push({ location: { x, y: factY }, nodeIndex: t.name, size: { height: factHeight, width: geometry.tableWidth }, zIndex: z++ });
    x += geometry.tableWidth + geometry.horizontalGap;
  }
  for (const t of dims) {
    nodes.push({ location: { x, y: geometry.topMargin }, nodeIndex: t.name, size: { height: dimHeight, width: geometry.tableWidth }, zIndex: z++ });
    x += geometry.tableWidth + geometry.horizontalGap;
  }
  return {
    ordinal, scrollPosition: { x: 0, y: 0 }, nodes, name, zoomValue: geometry.zoomValue,
    pinKeyFieldsToTop: false, showExtraHeaderInfo: false, hideKeyFieldsWhenCollapsed: false, tablesLocked: false
  };
}

function validate(diagram) {
  const n = diagram.nodes;
  for (let i = 0; i < n.length; i++) {
    for (let j = i + 1; j < n.length; j++) {
      const a = n[i], b = n[j];
      if (a.location.x < b.location.x + b.size.width && b.location.x < a.location.x + a.size.width &&
          a.location.y < b.location.y + b.size.height && b.location.y < a.location.y + a.size.height) {
        fail(`${diagram.name}: ${a.nodeIndex} and ${b.nodeIndex} overlap.`);
      }
    }
  }
  if (new Set(n.map((x) => x.nodeIndex)).size !== n.length) fail(`${diagram.name}: a table appears more than once.`);
}

// ---------- main ----------
const modelDir = findModel(root);
const tablesDir = path.join(modelDir, 'definition', 'tables');
if (!fs.existsSync(tablesDir)) fail('Model is not saved as TMDL. In Power BI Desktop, turn on Options > Preview features > Store semantic model using TMDL format, then save again.');

const allTables = readTables(tablesDir);
const skippedAuto = allTables.filter((t) => AUTO_DATE.test(t.name));
const tables = allTables.filter((t) => !AUTO_DATE.test(t.name));
const byName = new Map(tables.map((t) => [t.name, t]));
const rels = readRelationships(path.join(modelDir, 'definition', 'relationships.tmdl'));
const overrides = rolesFile ? JSON.parse(fs.readFileSync(path.resolve(rolesFile), 'utf8')) : {};
const { roles, notes } = decideRoles(tables, rels, overrides);
const placed = new Set(tables.map((t) => t.name).filter((n) => roles.get(n) !== 'exclude'));

const diagrams = [buildDiagram('All Tables', placed, byName, roles, 0)];
const reportDir = path.join(path.dirname(modelDir), path.basename(modelDir).replace(/\.SemanticModel$/, '.Report'));
const pages = fs.existsSync(reportDir) ? readPages(reportDir) : null;
if (pages === null) notes.push(fs.existsSync(reportDir)
  ? 'Report is not in PBIR format, so only the All Tables view was created.'
  : 'No matching .Report folder, so only the All Tables view was created.');
for (const page of pages ?? []) {
  const included = new Set([...page.tables].filter((n) => placed.has(n)));
  if (included.size === 0) { notes.push(`${page.name}: skipped (uses no model tables)`); continue; }
  diagrams.push(buildDiagram(page.name, included, byName, roles, diagrams.length));
}
diagrams.forEach(validate);

const layout = { version: '1.1.0', diagrams, selectedDiagram: 'All Tables', defaultDiagram: 'All Tables' };
const layoutPath = path.join(modelDir, 'diagramLayout.json');

console.log(`\nModel: ${path.basename(modelDir)}`);
console.log(`Facts: ${sortNames([...placed].filter((n) => roles.get(n) === 'fact')).join(', ') || '(none)'}`);
console.log(`Dimensions: ${sortNames([...placed].filter((n) => roles.get(n) === 'dimension')).join(', ') || '(none)'}`);
if (skippedAuto.length) notes.push(`Skipped ${skippedAuto.length} auto date/time table(s). Consider turning off Auto date/time.`);
for (const note of notes) console.log(`Note: ${note}`);
console.log(`Views: ${diagrams.map((d) => `${d.name} (${d.nodes.length})`).join(', ')}`);

if (dryRun) { console.log('\nDry run: nothing written.\n'); process.exit(0); }
if (fs.existsSync(layoutPath) && !force) fail(`${layoutPath} already exists. Commit or back it up, then rerun with --force to replace it.`);
fs.writeFileSync(layoutPath, `${JSON.stringify(layout, null, 2)}\n`, 'utf8');
console.log(`\nWrote ${layoutPath}`);
console.log('Close and reopen the .pbip in Power BI Desktop to see the views.\n');
