#!/usr/bin/env node
// Read-only check: can a Power BI Project (PBIP) use the model layout view rules?
// Usage: node check-layout-compatibility.mjs [path-to-project-folder] [--json]
// Uses only Node.js built-in modules. Never writes to the project.

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? '.');

const AUTO_DATE = /^(LocalDateTable_|DateTableTemplate_)/;
const TALL_CARD_FIELDS = 40;
const results = [];
const add = (level, check, message, fix = '') => results.push({ level, check, message, fix });

// ---------- helpers ----------
function findDirs(dir, suffix, depth = 4, found = []) {
  if (depth < 0 || !fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || ['node_modules', '.git', '.pbi'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.endsWith(suffix)) found.push(full);
    else findDirs(full, suffix, depth - 1, found);
  }
  return found;
}

function unquote(name) {
  const s = name.trim();
  return s.startsWith("'") ? s.slice(1, -1).replace(/''/g, "'") : s;
}

// Reads the object name after a TMDL keyword: 'Quoted ''Name''' or Bare
function readName(rest) {
  const m = rest.match(/^('(?:[^']|'')*'|[^\s=]+)/);
  return m ? unquote(m[1]) : rest.trim();
}

// 'My Table'.Column or Table.Column -> table name
function tableOfColumnRef(ref) {
  const s = ref.trim();
  if (s.startsWith("'")) {
    const m = s.match(/^'((?:[^']|'')*)'\./);
    return m ? m[1].replace(/''/g, "'") : s;
  }
  return s.split('.')[0];
}

function parseTable(file) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const t = { name: '', columns: 0, hiddenColumns: 0, measures: 0, calcGroup: false, fieldParameter: false };
  let inColumn = false;
  for (const line of lines) {
    const depth = line.match(/^\t*/)[0].length;
    const s = line.trim();
    if (depth === 0 && s.startsWith('table ')) t.name = readName(s.slice(6));
    if (depth === 1) {
      inColumn = s.startsWith('column ');
      if (inColumn) t.columns++;
      if (s.startsWith('measure ')) t.measures++;
      if (s === 'calculationGroup' || s.startsWith('calculationGroup')) t.calcGroup = true;
    }
    if (inColumn && depth === 2 && s === 'isHidden') t.hiddenColumns++;
  }
  if (text.includes('ParameterMetadata')) t.fieldParameter = true;
  return t;
}

function parseRelationships(file) {
  if (!fs.existsSync(file)) return [];
  const rels = [];
  let cur = null;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const s = line.trim();
    if (s.startsWith('relationship ')) {
      cur = { name: readName(s.slice(13)), from: '', to: '', fromCard: 'many', toCard: 'one', active: true };
      rels.push(cur);
    } else if (cur) {
      const [key, ...v] = s.split(':');
      const value = v.join(':').trim();
      if (key === 'fromColumn') cur.from = tableOfColumnRef(value);
      if (key === 'toColumn') cur.to = tableOfColumnRef(value);
      if (key === 'fromCardinality') cur.fromCard = value;
      if (key === 'toCardinality') cur.toCard = value;
      if (key === 'isActive' && value === 'false') cur.active = false;
    }
  }
  return rels;
}

function collectEntities(node, out) {
  if (Array.isArray(node)) node.forEach((n) => collectEntities(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'Entity' && typeof v === 'string') out.add(v);
      else collectEntities(v, out);
    }
  }
  return out;
}

function readPages(reportDir, tableNames) {
  const pagesDir = path.join(reportDir, 'definition', 'pages');
  if (!fs.existsSync(pagesDir)) return null;
  const pages = [];
  for (const entry of fs.readdirSync(pagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pageDir = path.join(pagesDir, entry.name);
    const pageFile = path.join(pageDir, 'page.json');
    if (!fs.existsSync(pageFile)) continue;
    const page = JSON.parse(fs.readFileSync(pageFile, 'utf8'));
    const tables = new Set();
    const visualsDir = path.join(pageDir, 'visuals');
    if (fs.existsSync(visualsDir)) {
      for (const v of fs.readdirSync(visualsDir)) {
        const vf = path.join(visualsDir, v, 'visual.json');
        if (fs.existsSync(vf)) collectEntities(JSON.parse(fs.readFileSync(vf, 'utf8')), tables);
      }
    }
    collectEntities(page.filterConfig ?? {}, tables);
    pages.push({ name: page.displayName ?? entry.name, tables: [...tables].filter((t) => tableNames.has(t)).sort() });
  }
  return pages;
}

// ---------- checks ----------
const models = findDirs(root, '.SemanticModel');
if (models.length === 0) {
  add('FAIL', 'Project', `No *.SemanticModel folder found under ${root}.`, 'Save the report as a Power BI project (.pbip) and point this script at that folder.');
}
if (models.length > 1) {
  add('WARN', 'Project', `Found ${models.length} semantic models. Checking each one.`, 'Keep one model per folder so Copilot edits the right one.');
}

const summaries = [];
for (const modelDir of models) {
  const label = path.basename(modelDir);
  const definition = path.join(modelDir, 'definition');
  const tablesDir = path.join(definition, 'tables');

  if (!fs.existsSync(tablesDir)) {
    const bim = fs.existsSync(path.join(modelDir, 'model.bim'));
    add('FAIL', label, bim ? 'Model is saved as model.bim, not TMDL.' : 'No definition/tables folder found.',
      'In Power BI Desktop, turn on Options > Preview features > Store semantic model using TMDL format, then save again.');
    continue;
  }
  add('PASS', label, 'Model is saved as TMDL.');

  const all = fs.readdirSync(tablesDir).filter((f) => f.endsWith('.tmdl')).map((f) => parseTable(path.join(tablesDir, f)));
  const autoDate = all.filter((t) => AUTO_DATE.test(t.name));
  const tables = all.filter((t) => !AUTO_DATE.test(t.name));
  const tableNames = new Set(tables.map((t) => t.name));

  if (autoDate.length) {
    add('WARN', label, `${autoDate.length} auto date/time table(s) found. They are skipped but clutter the model.`,
      'Turn off Options > Current File > Data Load > Auto date/time, save, and run this check again.');
  }

  // Relationships and roles
  const rels = parseRelationships(path.join(definition, 'relationships.tmdl'))
    .filter((r) => tableNames.has(r.from) && tableNames.has(r.to));
  if (rels.length === 0) {
    add('FAIL', label, 'No relationships found, so facts and dimensions cannot be worked out.',
      'Add relationships, or list every table as fact or dimension in the layout rules.');
  }

  const manySide = new Set(); const oneSide = new Set();
  for (const r of rels) {
    if (r.fromCard === 'many' && r.toCard === 'many') {
      add('WARN', label, `Many-to-many relationship: ${r.from} to ${r.to}.`, 'Decide which row each table belongs in and list it in the layout rules.');
      continue;
    }
    if (r.fromCard === 'one' && r.toCard === 'one') {
      add('WARN', label, `One-to-one relationship: ${r.from} to ${r.to}.`, 'Decide which row each table belongs in and list it in the layout rules.');
      continue;
    }
    const many = r.fromCard === 'many' ? r.from : r.to;
    const one = many === r.from ? r.to : r.from;
    manySide.add(many); oneSide.add(one);
  }

  const roles = {};
  for (const t of tables) {
    const visibleColumns = t.columns - t.hiddenColumns;
    if (t.calcGroup) roles[t.name] = 'other: calculation group';
    else if (t.fieldParameter) roles[t.name] = 'other: field parameter';
    else if (manySide.has(t.name) && oneSide.has(t.name)) roles[t.name] = 'both';
    else if (manySide.has(t.name)) roles[t.name] = 'fact';
    else if (oneSide.has(t.name)) roles[t.name] = 'dimension';
    else if (t.measures > 0 && visibleColumns === 0) roles[t.name] = 'other: measure table';
    else roles[t.name] = 'other: no relationships';
  }

  const both = Object.keys(roles).filter((n) => roles[n] === 'both');
  if (both.length) {
    add('WARN', label, `Snowflaked or bridge table(s), on both sides of relationships: ${both.join(', ')}.`,
      'List each one as fact or dimension in the layout rules overrides. Most snowflaked lookups belong in the dimension row.');
  }
  const other = Object.keys(roles).filter((n) => roles[n].startsWith('other'));
  if (other.length) {
    add('WARN', label, `Table(s) that are neither fact nor dimension: ${other.map((n) => `${n} (${roles[n].slice(7)})`).join(', ')}.`,
      'Decide where these go, for example a third row, and add them to the layout rules.');
  }
  if (rels.length && !both.length && !other.length && !rels.some((r) => r.fromCard === r.toCard)) {
    add('PASS', label, 'Every table is clearly a fact or a dimension.');
  }

  // Card heights
  const tall = tables.filter((t) => t.columns + t.measures > TALL_CARD_FIELDS);
  if (tall.length) {
    add('WARN', label, `Very tall cards: ${tall.map((t) => `${t.name} (${t.columns + t.measures} fields)`).join(', ')}.`,
      'Fully expanded cards will be long. Consider hiding unused columns first.');
  }

  // Existing layout
  if (fs.existsSync(path.join(modelDir, 'diagramLayout.json'))) {
    add('INFO', label, 'diagramLayout.json already exists and will be replaced.', 'Commit your current files first so you can undo.');
  }

  // Report pages
  const reportDir = path.join(path.dirname(modelDir), label.replace(/\.SemanticModel$/, '.Report'));
  let pages = null;
  if (!fs.existsSync(reportDir)) {
    add('INFO', label, 'No matching .Report folder. Only the All Tables view can be created.');
  } else {
    pages = readPages(reportDir, tableNames);
    if (pages === null) {
      add('WARN', label, 'Report is in the older single-file format, so per-page views cannot be worked out.',
        'Turn on Options > Preview features > Store reports using enhanced metadata format (PBIR), then save again.');
    } else {
      add('PASS', label, `Report has ${pages.length} page(s); table use per page was read from the visuals.`);
      for (const p of pages.filter((pg) => pg.tables.length === 0)) {
        add('WARN', label, `Page "${p.name}" uses no model tables.`, 'It would get an empty view. Exclude it in the layout rules.');
      }
    }
  }

  summaries.push({ model: label, roles, relationships: rels.length, pages });
}

// ---------- output ----------
if (asJson) {
  console.log(JSON.stringify({ root, results, summaries }, null, 2));
} else {
  console.log(`\nLayout compatibility check: ${root}\n`);
  for (const r of results) {
    console.log(`[${r.level}] ${r.check}: ${r.message}`);
    if (r.fix) console.log(`        Fix: ${r.fix}`);
  }
  for (const s of summaries) {
    console.log(`\nDetected roles for ${s.model}:`);
    for (const [name, role] of Object.entries(s.roles).sort(([a], [b]) => a.localeCompare(b, undefined, { sensitivity: 'base' }))) {
      console.log(`  ${role.padEnd(26)} ${name}`);
    }
    if (s.pages) {
      console.log('\nTables used per report page:');
      for (const p of s.pages) console.log(`  ${p.name}: ${p.tables.join(', ') || '(none)'}`);
    }
  }
  const fails = results.filter((r) => r.level === 'FAIL').length;
  const warns = results.filter((r) => r.level === 'WARN').length;
  console.log(`\nResult: ${fails ? 'NOT COMPATIBLE' : warns ? 'COMPATIBLE WITH CHANGES' : 'COMPATIBLE'} (${fails} fail, ${warns} warn)\n`);
}
process.exitCode = results.some((r) => r.level === 'FAIL') ? 1 : 0;
