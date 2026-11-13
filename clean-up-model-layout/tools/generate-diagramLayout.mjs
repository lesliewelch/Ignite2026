import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const spec = JSON.parse(fs.readFileSync(path.join(projectRoot, '_brief', 'report-spec.json'), 'utf8'));
const modelDir = path.join(projectRoot, 'build', `${spec.report.name}.SemanticModel`);
const modelDefinition = path.join(modelDir, 'definition');
const tablesDir = path.join(modelDefinition, 'tables');
const reportDir = path.join(projectRoot, 'build', `${spec.report.name}.Report`);
const layoutPath = path.join(modelDir, 'diagramLayout.json');

const tableRoles = {
  facts: ['Inventory', 'Reviews', 'Sales'],
  dimensions: ['Date', 'Designer', 'Promotion', 'Set', 'Store', 'Theme']
};

const geometry = {
  leftMargin: 0,
  topMargin: 0,
  horizontalGap: 16,
  verticalGap: 56,
  tableWidth: 234,
  headerHeight: 80,
  fieldHeight: 24,
  minimumHeight: 152,
  zoomValue: 80
};

function readModelTables() {
  return fs.readdirSync(tablesDir)
    .filter((fileName) => fileName.endsWith('.tmdl'))
    .map((fileName) => {
      const filePath = path.join(tablesDir, fileName);
      const text = fs.readFileSync(filePath, 'utf8');
      const declaration = text.match(/^\s*table\s+(.+)\s*$/m)?.[1]?.trim();
      if (!declaration) throw new Error(`Table declaration not found in ${filePath}`);
      const name = declaration.replace(/^'(.*)'$/, '$1');
      const fieldCount = (text.match(/^\s*(?:column|measure)\s+/gm) ?? []).length;
      if (fieldCount === 0) throw new Error(`No layout fields found for table ${name}`);
      return { name, fieldCount };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }));
}

function sortNames(names) {
  return [...names].sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }));
}

function fieldTable(field) {
  if (!Array.isArray(field)) return undefined;
  return field[0];
}

function pageTableNames(page) {
  const names = new Set();
  for (const slicer of page.slicers ?? []) names.add(fieldTable(slicer.field));
  for (const card of page.cards ?? []) names.add(fieldTable(card.field));
  for (const visual of page.visuals ?? []) {
    for (const roleFields of Object.values(visual.roles ?? {})) {
      for (const field of roleFields) {
        for (const descriptor of [field.column, field.measure]) {
          if (Array.isArray(descriptor)) names.add(descriptor[0]);
        }
      }
    }
    if (Array.isArray(visual.sortBy)) names.add(visual.sortBy[0]);
  }
  names.delete(undefined);
  return names;
}

function rowHeight(tables) {
  return Math.max(
    geometry.minimumHeight,
    ...tables.map((table) => geometry.headerHeight + geometry.fieldHeight * table.fieldCount)
  );
}

function buildDiagram(name, includedNames, tablesByName, ordinal) {
  const facts = sortNames([...includedNames].filter((tableName) => tableRoles.facts.includes(tableName)))
    .map((tableName) => tablesByName.get(tableName));
  const dimensions = sortNames([...includedNames].filter((tableName) => tableRoles.dimensions.includes(tableName)))
    .map((tableName) => tablesByName.get(tableName));
  const missingRoles = [...includedNames].filter((tableName) => !tableRoles.facts.includes(tableName) && !tableRoles.dimensions.includes(tableName));
  if (missingRoles.length > 0) throw new Error(`${name} contains tables without documented roles: ${missingRoles.join(', ')}`);
  if (facts.length + dimensions.length !== includedNames.size) throw new Error(`${name} contains a table more than once in the role definitions`);

  const dimensionHeight = dimensions.length > 0 ? rowHeight(dimensions) : geometry.minimumHeight;
  const factHeight = facts.length > 0 ? rowHeight(facts) : geometry.minimumHeight;
  const factY = geometry.topMargin + dimensionHeight + geometry.verticalGap;
  const nodes = [];
  let zIndex = 1;
  let factX = geometry.leftMargin;

  for (const table of facts) {
    nodes.push({
      location: { x: factX, y: factY },
      nodeIndex: table.name,
      size: { height: factHeight, width: geometry.tableWidth },
      zIndex: zIndex++
    });
    factX += geometry.tableWidth + geometry.horizontalGap;
  }

  let dimensionX = facts.length > 0 ? factX : geometry.leftMargin;
  for (const table of dimensions) {
    nodes.push({
      location: { x: dimensionX, y: geometry.topMargin },
      nodeIndex: table.name,
      size: { height: dimensionHeight, width: geometry.tableWidth },
      zIndex: zIndex++
    });
    dimensionX += geometry.tableWidth + geometry.horizontalGap;
  }

  return {
    ordinal,
    scrollPosition: { x: 0, y: 0 },
    nodes,
    name,
    zoomValue: geometry.zoomValue,
    pinKeyFieldsToTop: false,
    showExtraHeaderInfo: false,
    hideKeyFieldsWhenCollapsed: false,
    tablesLocked: false
  };
}

function validateDiagram(diagram, includedNames, tablesByName) {
  const nodeNames = new Set(diagram.nodes.map((node) => node.nodeIndex));
  if (nodeNames.size !== includedNames.size || [...includedNames].some((name) => !nodeNames.has(name))) {
    throw new Error(`${diagram.name} does not contain its exact table membership`);
  }

  const facts = diagram.nodes.filter((node) => tableRoles.facts.includes(node.nodeIndex));
  const dimensions = diagram.nodes.filter((node) => tableRoles.dimensions.includes(node.nodeIndex));
  for (const [role, nodes] of [['fact', facts], ['dimension', dimensions]]) {
    const names = nodes.map((node) => node.nodeIndex);
    if (names.join('|') !== sortNames(names).join('|')) throw new Error(`${diagram.name} ${role} tables are not alphabetical`);
    const expectedHeight = rowHeight(nodes.map((node) => tablesByName.get(node.nodeIndex)));
    const expectedY = role === 'fact'
      ? geometry.topMargin + (dimensions.length > 0 ? rowHeight(dimensions.map((node) => tablesByName.get(node.nodeIndex))) : 0) + geometry.verticalGap
      : geometry.topMargin;
    for (const node of nodes) {
      if (node.size.height !== expectedHeight || node.location.y !== expectedY) {
        throw new Error(`${diagram.name} ${role} row height or vertical position is incorrect`);
      }
    }
  }

  if (facts.length > 0) {
    if (facts[0].location.x !== geometry.leftMargin) throw new Error(`${diagram.name} facts do not start at the left margin`);
    for (let index = 1; index < facts.length; index++) {
      if (facts[index].location.x !== facts[index - 1].location.x + facts[index - 1].size.width + geometry.horizontalGap) {
        throw new Error(`${diagram.name} fact table spacing is incorrect`);
      }
    }
  }
  if (dimensions.length > 0) {
    const expectedStart = facts.length > 0
      ? facts[facts.length - 1].location.x + facts[facts.length - 1].size.width + geometry.horizontalGap
      : geometry.leftMargin;
    if (dimensions[0].location.x !== expectedStart) throw new Error(`${diagram.name} dimension row offset is incorrect`);
    for (let index = 1; index < dimensions.length; index++) {
      if (dimensions[index].location.x !== dimensions[index - 1].location.x + dimensions[index - 1].size.width + geometry.horizontalGap) {
        throw new Error(`${diagram.name} dimension table spacing is incorrect`);
      }
    }
  }

  for (let leftIndex = 0; leftIndex < diagram.nodes.length; leftIndex++) {
    const left = diagram.nodes[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < diagram.nodes.length; rightIndex++) {
      const right = diagram.nodes[rightIndex];
      const overlaps = left.location.x < right.location.x + right.size.width
        && right.location.x < left.location.x + left.size.width
        && left.location.y < right.location.y + right.size.height
        && right.location.y < left.location.y + left.size.height;
      if (overlaps) throw new Error(`${diagram.name} has overlapping nodes: ${left.nodeIndex} and ${right.nodeIndex}`);
    }
  }
}

function readRelationships() {
  const text = fs.readFileSync(path.join(modelDefinition, 'relationships.tmdl'), 'utf8');
  return [...text.matchAll(/^relationship\s+[^\r\n]+\s*\r?\n\s*fromColumn:\s*'?([^'.\s]+)'?\.[^\r\n]+\r?\n\s*toColumn:\s*'?([^'.\s]+)'?\.[^\r\n]+/gm)]
    .map((match) => ({ from: match[1], to: match[2] }));
}

const tables = readModelTables();
const tablesByName = new Map(tables.map((table) => [table.name, table]));
const roleNames = new Set([...tableRoles.facts, ...tableRoles.dimensions]);
const unclassifiedTables = tables.filter((table) => !roleNames.has(table.name));
if (unclassifiedTables.length > 0) {
  throw new Error(`Add explicit fact/dimension roles for: ${unclassifiedTables.map((table) => table.name).join(', ')}`);
}
for (const roleName of roleNames) {
  if (!tablesByName.has(roleName)) console.warn(`Ignoring documented role for table not in this model: ${roleName}`);
}

const relationships = readRelationships();
for (const relationship of relationships) {
  if (!tablesByName.has(relationship.from) || !tablesByName.has(relationship.to)) {
    throw new Error(`Relationship references a table outside the model: ${relationship.from} -> ${relationship.to}`);
  }
}
const allTableNames = new Set(tables.map((table) => table.name));
const allTablesDiagram = buildDiagram('All Tables', allTableNames, tablesByName, 0);
const pageDiagrams = spec.pages.map((page, index) => {
  const specifiedNames = pageTableNames(page);
  const includedNames = new Set([...specifiedNames].filter((tableName) => allTableNames.has(tableName)));
  const omittedNames = [...specifiedNames].filter((tableName) => !allTableNames.has(tableName));
  if (omittedNames.length > 0) {
    console.warn(`${page.name}: ignoring specification table(s) absent from the current model: ${omittedNames.join(', ')}`);
  }
  if (includedNames.size === 0) throw new Error(`${page.name} has no tables in the current model`);
  return buildDiagram(page.name, includedNames, tablesByName, index + 1);
});

const layout = {
  version: '1.1.0',
  diagrams: [allTablesDiagram, ...pageDiagrams],
  selectedDiagram: 'All Tables',
  defaultDiagram: 'All Tables'
};

for (let index = 0; index < layout.diagrams.length; index++) {
  const diagram = layout.diagrams[index];
  const includedNames = index === 0 ? allTableNames : new Set(diagram.nodes.map((node) => node.nodeIndex));
  validateDiagram(diagram, includedNames, tablesByName);
}

fs.writeFileSync(layoutPath, `${JSON.stringify(layout, null, 2)}\n`, 'utf8');
console.log(`Wrote ${layoutPath}`);
console.log(`Views: ${layout.diagrams.map((diagram) => `${diagram.name} (${diagram.nodes.length} tables)`).join(', ')}`);