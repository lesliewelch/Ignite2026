import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const specPath = path.join(projectRoot, '_brief', 'report-spec.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const outputRoot = path.resolve(process.argv[2] ?? path.join(projectRoot, 'build'));
const reportName = spec.report.name;
const reportDir = path.join(outputRoot, `${reportName}.Report`);
const reportDefinition = path.join(reportDir, 'definition');
const pagesDir = path.join(reportDefinition, 'pages');
const modelDir = path.join(outputRoot, `${reportName}.SemanticModel`);
const modelDefinition = path.join(modelDir, 'definition');
const tablesDir = path.join(modelDefinition, 'tables');
const palette = spec.report.theme.colors;
const font = spec.report.theme.font;
const fontSemibold = spec.report.theme.fontSemibold;

function stableId(value, length = 20) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, length);
}

function mkdir(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function writeText(filePath, content) {
  mkdir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${content.trimEnd()}\n`, 'utf8');
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function dateAtOffset(year, offset) {
  return new Date(Date.UTC(year, 0, 1 + offset)).toISOString().slice(0, 10);
}

function quarterForDate(value) {
  return Math.ceil(Number(value.slice(5, 7)) / 3);
}

function generateDateRows() {
  const year = spec.model.dataYear;
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  return Array.from({ length: days }, (_, index) => {
    const date = dateAtOffset(year, index);
    const monthNo = Number(date.slice(5, 7));
    return [
      date,
      year,
      `Q${Math.ceil(monthNo / 3)}`,
      Math.ceil(monthNo / 3),
      monthNo,
      new Date(Date.UTC(year, monthNo - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })
    ];
  });
}

function generateRows() {
  const { data } = spec;
  const { generation } = data;
  const year = spec.model.dataYear;
  const sets = data.sets.map((set, index) => ({
    ...set,
    key: index + 1,
    number: String(set.number),
    releaseYear: year
  }));
  const salesDates = Array.from({ length: generation.sales.rowCount }, (_, index) => {
    const offset = Math.round(index * generation.sales.dateSpreadDays / (generation.sales.rowCount - 1));
    return dateAtOffset(year, offset);
  });
  const salesRows = salesDates.map((orderDate, index) => {
    const set = sets[index * generation.sales.setStride % sets.length];
    const store = data.stores[index % data.stores.length];
    const noPromotion = index % generation.sales.noPromotionEvery === 0;
    const promotionKey = noPromotion ? 0 : quarterForDate(orderDate);
    return [
      index + 1,
      orderDate,
      set.key,
      store.key,
      promotionKey,
      generation.sales.quantityCycle[index % generation.sales.quantityCycle.length],
      set.retailPrice,
      generation.sales.discountByPromotion[promotionKey]
    ];
  });
  const reviewRows = Array.from({ length: generation.reviews.rowCount }, (_, index) => {
    const set = sets[index % sets.length];
    const rating = generation.reviews.ratingBase
      + ((index * generation.reviews.ratingOffsetMultiplier + set.key) % generation.reviews.ratingModulo);
    const hours = set.pieces / generation.reviews.buildHoursDivisor
      + (index % generation.reviews.buildHourCycle) * generation.reviews.buildHourStep;
    return [
      index + 1,
      salesDates[(index * generation.reviews.reviewDateStride) % salesDates.length],
      set.key,
      rating,
      Number(hours.toFixed(1)),
      generation.reviews.ageGroups[index % generation.reviews.ageGroups.length]
    ];
  });
  const inventoryRows = [];
  let inventoryKey = 1;
  for (const snapshotDate of generation.inventory.snapshotDates) {
    const quarter = quarterForDate(snapshotDate);
    for (const set of sets) {
      for (const store of data.stores) {
        const inventory = generation.inventory;
        const onHand = inventory.onHandBase
          + ((set.key * inventory.setFactor + store.key * inventory.storeFactor + quarter * inventory.quarterFactor) % inventory.onHandModulo);
        const reorderPoint = inventory.reorderBase + ((set.key + store.key) % inventory.reorderModulo);
        inventoryRows.push([
          inventoryKey++,
          snapshotDate,
          set.key,
          store.key,
          onHand,
          reorderPoint,
          Number((set.retailPrice * inventory.unitCostRate).toFixed(2))
        ]);
      }
    }
  }
  const rowsByTable = {
    Sales: salesRows,
    Reviews: reviewRows,
    Inventory: inventoryRows,
    Set: sets.map((set) => [set.key, set.number, set.name, set.themeKey, set.designerKey, set.pieces, set.minifigs, set.retailPrice, set.releaseYear]),
    Theme: data.themes.map((theme) => [theme.key, theme.theme, theme.group]),
    Store: data.stores.map((store) => [store.key, store.name, store.channel, store.city, store.country, store.region]),
    Designer: data.designers.map((designer) => [designer.key, designer.name, designer.studio, designer.specialty]),
    Promotion: data.promotions.map((promotion) => [promotion.key, promotion.name, promotion.type, promotion.start, promotion.end]),
    Date: generateDateRows()
  };
  return { rowsByTable, sets, salesRows, reviewRows, inventoryRows };
}

const generated = generateRows();
const tables = spec.model.tables.map((table) => ({ ...table, rows: generated.rowsByTable[table.name] }));

function modelTableName(name) {
  return name === 'Set' ? "'Set'" : name;
}

function mLiteral(value, type) {
  if (value === null || value === undefined) return 'null';
  if (type === 'string') return `"${String(value).replaceAll('"', '""')}"`;
  if (type === 'date') {
    const [year, month, day] = value.split('-').map(Number);
    return `#date(${year}, ${month}, ${day})`;
  }
  return String(value);
}

function mPartition(table) {
  const schema = table.columns.map((column) => `${column.name} = ${column.mType}`).join(',\n\t\t\t\t');
  const rows = table.rows
    .map((row) => `\t\t\t\t{${row.map((value, index) => mLiteral(value, table.columns[index].valueType)).join(', ')}}`)
    .join(',\n');
  return `\tpartition ${table.name} = m\n\t\tmode: import\n\t\tsource =\n\t\t\tlet\n\t\t\t\tSource = #table(\n\t\t\t\t\ttype table [${schema}],\n\t\t\t\t\t{\n${rows}\n\t\t\t\t\t}\n\t\t\t\t)\n\t\t\tin\n\t\t\t\t\tSource`;
}

function tmdlTable(table) {
  const lines = [`/// ${table.description}`, `table ${modelTableName(table.name)}`, ''];
  for (const measure of table.measures ?? []) {
    lines.push(`\t/// ${measure.description}`, `\tmeasure '${measure.name}' = ${measure.expression}`, `\t\tformatString: ${measure.format}`, '');
  }
  for (const column of table.columns) {
    lines.push(`\t/// ${column.description}`, `\tcolumn ${column.name}`, `\t\tdataType: ${column.dataType}`);
    if (column.hidden) lines.push('\t\tisHidden');
    if (column.summarizeBy) lines.push(`\t\tsummarizeBy: ${column.summarizeBy}`);
    if (column.dataCategory) lines.push(`\t\tdataCategory: ${column.dataCategory}`);
    if (column.sortByColumn) lines.push(`\t\tsortByColumn: ${column.sortByColumn}`);
    lines.push(`\t\tsourceColumn: ${column.name}`, '');
  }
  if (table.dateTable) lines.push('\tannotation PBI_DateTable = true', '');
  lines.push(mPartition(table));
  return lines.join('\n');
}

function validateModelData() {
  const rows = generated.rowsByTable;
  const schemas = new Map(tables.map((table) => [table.name, table.columns]));
  const keySet = (table, index) => new Set(rows[table].map((row) => row[index]));
  const setKeys = keySet('Set', 0);
  const storeKeys = keySet('Store', 0);
  const promotionKeys = keySet('Promotion', 0);
  const themeKeys = keySet('Theme', 0);
  const designerKeys = keySet('Designer', 0);
  const dateValues = keySet('Date', 0);
  const expected = {
    Sales: spec.data.generation.sales.rowCount,
    Reviews: spec.data.generation.reviews.rowCount,
    Inventory: spec.data.generation.inventory.snapshotDates.length * rows.Set.length * rows.Store.length,
    Set: spec.data.sets.length,
    Theme: spec.data.themes.length,
    Store: spec.data.stores.length,
    Designer: spec.data.designers.length,
    Promotion: spec.data.promotions.length,
    Date: rows.Date.length
  };
  for (const table of tables) {
    if (!rows[table.name]) throw new Error(`No row generator for model table ${table.name}`);
    if (rows[table.name].length !== expected[table.name]) throw new Error(`${table.name} row count mismatch`);
    if (rows[table.name].some((row) => row.length !== schemas.get(table.name).length)) throw new Error(`${table.name} row/schema width mismatch`);
  }
  if (new Set(generated.sets.map((set) => set.number)).size !== generated.sets.length) throw new Error('Set numbers must be unique');
  if (generated.sets.some((set) => !themeKeys.has(set.themeKey) || !designerKeys.has(set.designerKey))) throw new Error('Set foreign key is invalid');
  if (generated.salesRows.some((row) => !setKeys.has(row[2]) || !storeKeys.has(row[3]) || !promotionKeys.has(row[4]) || !dateValues.has(row[1]))) throw new Error('Sales foreign key is invalid');
  if (generated.reviewRows.some((row) => !setKeys.has(row[2]) || !dateValues.has(row[1]))) throw new Error('Review foreign key is invalid');
  const grains = new Set(generated.inventoryRows.map((row) => `${row[1]}:${row[2]}:${row[3]}`));
  if (grains.size !== generated.inventoryRows.length) throw new Error('Inventory snapshot grain is not unique');
}

function writeModel() {
  mkdir(tablesDir);
  writeJson(path.join(modelDir, '.platform'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
    metadata: { type: 'SemanticModel', displayName: reportName },
    config: { version: '2.0', logicalId: spec.report.ids.modelLogicalId }
  });
  writeJson(path.join(modelDir, 'definition.pbism'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json',
    version: '4.2', settings: { qnaEnabled: true }
  });
  writeText(path.join(modelDefinition, 'database.tmdl'), `database ${spec.report.ids.databaseId}\n\tcompatibilityLevel: ${spec.model.compatibilityLevel}\n\tcompatibilityMode: powerBI\n\tlanguage: 1033`);
  const modelLines = [
    'model Model', `\tculture: ${spec.model.culture}`, '\tdefaultPowerBIDataSourceVersion: powerBI_V3',
    `\tsourceQueryCulture: ${spec.model.culture}`, '\tdiscourageImplicitMeasures: true', '',
    ...tables.map((table) => `ref table ${modelTableName(table.name)}`), `ref cultureInfo ${spec.model.culture}`
  ];
  writeText(path.join(modelDefinition, 'model.tmdl'), modelLines.join('\n'));
  for (const table of tables) writeText(path.join(tablesDir, `${table.name}.tmdl`), tmdlTable(table));
  const relationshipText = spec.model.relationships.map((relationship) => [
    `relationship '${relationship.name}'`,
    `\tfromColumn: ${modelTableName(relationship.from[0])}.${relationship.from[1]}`,
    `\ttoColumn: ${modelTableName(relationship.to[0])}.${relationship.to[1]}`,
    '\tcrossFilteringBehavior: oneDirection'
  ].join('\n')).join('\n\n');
  writeText(path.join(modelDefinition, 'relationships.tmdl'), relationshipText);
}

function literal(value) {
  return { expr: { Literal: { Value: value } } };
}

function pbirString(value) {
  return literal(`'${String(value).replaceAll("'", "''")}'`);
}

function pbirBool(value) {
  return literal(value ? 'true' : 'false');
}

function pbirNumber(value) {
  return literal(`${value}D`);
}

function pbirColor(value) {
  return { solid: { color: pbirString(value) } };
}

function fieldProjection(field) {
  const [table, property] = field.column ?? field.measure;
  const kind = field.column ? 'Column' : 'Measure';
  return {
    field: { [kind]: { Expression: { SourceRef: { Entity: table } }, Property: property } },
    queryRef: `${table}.${property}`,
    nativeQueryRef: property
  };
}

function role(fields) {
  return { projections: fields.map(fieldProjection) };
}

function defaultColor(color) {
  return [{ properties: { defaultColor: pbirColor(color) } }];
}

function seriesColors(mapping) {
  return Object.entries(mapping).map(([metadata, colorName]) => ({
    properties: { fill: pbirColor(palette[colorName]) },
    selector: { metadata }
  }));
}

function commonVco(altText, title) {
  const objects = {
    general: [{ properties: { altText: pbirString(altText) } }],
    background: [{ properties: { show: pbirBool(true), color: pbirColor(palette.visual), transparency: pbirNumber(0) } }],
    border: [{ properties: { show: pbirBool(true), color: pbirColor(palette.border), radius: pbirNumber(4), width: pbirNumber(1) } }],
    padding: [{ properties: { top: pbirNumber(8), bottom: pbirNumber(8), left: pbirNumber(8), right: pbirNumber(8) } }],
    visualHeader: [{ properties: { show: pbirBool(true), showFocusModeButton: pbirBool(true), showOptionsMenu: pbirBool(true) } }]
  };
  if (title) objects.title = [{ properties: {
    show: pbirBool(true), text: pbirString(title), heading: pbirString('Heading3'), titleWrap: pbirBool(true),
    fontColor: pbirColor(palette.ink), fontSize: pbirNumber(13), fontFamily: pbirString(fontSemibold), alignment: pbirString('Left')
  } }];
  return objects;
}

function projectionVisual(page, visual, position = visual.position) {
  const result = {
    $schema: spec.report.visualSchema,
    name: stableId(`visual:${page.id}:${visual.key}`),
    position,
    visual: {
      visualType: visual.type,
      query: { queryState: Object.fromEntries(Object.entries(visual.roles).map(([roleName, fields]) => [roleName, role(fields)])) },
      visualContainerObjects: commonVco(visual.altText, visual.title)
    }
  };
  if (visual.sortBy) result.visual.query.sortDefinition = {
    sort: [{ field: fieldProjection({ measure: visual.sortBy }).field, direction: 'Descending' }],
    isDefaultSort: false
  };
  if (visual.color) result.visual.objects = { dataPoint: defaultColor(palette[visual.color]) };
  if (visual.seriesColors) result.visual.objects = { dataPoint: seriesColors(visual.seriesColors) };
  if (visual.type === 'pivotTable') result.visual.objects = {
    ...(result.visual.objects ?? {}),
    columnHeaders: [{ properties: { autoSizeColumnWidth: pbirBool(true), columnAdjustment: pbirString('growToFit') } }]
  };
  return result;
}

function titleVisual(page) {
  return {
    $schema: spec.report.visualSchema,
    name: stableId(`visual:${page.id}:page-title`),
    position: { x: 32, y: 24, z: 0, height: 64, width: 1120, tabOrder: 0 },
    visual: {
      visualType: 'textbox',
      objects: {
        general: [{
          properties: {
            paragraphs: [{
              textRuns: [{ value: page.title, textStyle: { fontFamily: fontSemibold, fontSize: '28px', fontWeight: 'bold', color: palette.ink } }],
              horizontalTextAlignment: 'left'
            }]
          }
        }]
      }
    }
  };
}

function slicerVisual(page, slicer) {
  return {
    $schema: spec.report.visualSchema,
    name: stableId(`visual:${page.id}:${slicer.key}`),
    position: slicer.position,
    visual: {
      visualType: 'slicer',
      query: { queryState: { Values: role([{ column: slicer.field }]) } },
      visualContainerObjects: commonVco(slicer.altText),
      objects: { data: [{ properties: { mode: pbirString('Dropdown') } }], header: [{ properties: { show: pbirBool(true), text: pbirString(slicer.label) } }] }
    }
  };
}

function cardVisual(page, card, index) {
  const [table, measure] = card.field;
  const visualSpec = { key: card.key, type: 'cardVisual', title: '', altText: card.altText, roles: { Data: [{ measure: [table, measure] }] } };
  const visual = projectionVisual(page, visualSpec, {
    x: 32 + index * 472, y: 128, z: 1000 + index, height: 120, width: 440, tabOrder: 100 + index
  });
  visual.visual.objects = {
    value: [{ properties: { fontColor: pbirColor(palette[card.color]), fontSize: pbirNumber(30), fontFamily: pbirString(fontSemibold) }, selector: { id: 'default' } }],
    label: [{ properties: { show: pbirBool(true), text: pbirString(card.label), fontColor: pbirColor(palette.slate), fontSize: pbirNumber(11), fontFamily: pbirString(font) }, selector: { id: 'default' } }],
    outline: [{ properties: { show: pbirBool(false) }, selector: { id: 'default' } }]
  };
  return visual;
}

function writePage(page) {
  const pageDirectory = path.join(pagesDir, page.id);
  const visualsDirectory = path.join(pageDirectory, 'visuals');
  writeJson(path.join(pageDirectory, 'page.json'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json',
    name: page.id,
    displayName: page.name,
    displayOption: 'FitToPage',
    height: spec.report.pageSize.height,
    width: spec.report.pageSize.width,
    objects: { background: [{ properties: { color: pbirColor(palette.page), transparency: pbirNumber(0) } }] }
  });
  const visualFiles = [
    titleVisual(page),
    ...page.slicers.map((slicer) => slicerVisual(page, slicer)),
    ...page.cards.map((card, index) => cardVisual(page, card, index)),
    ...page.visuals.map((visual) => projectionVisual(page, visual))
  ];
  for (const visual of visualFiles) writeJson(path.join(visualsDirectory, visual.name, 'visual.json'), visual);
}

function writeReport() {
  writeJson(path.join(reportDir, '.platform'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
    metadata: { type: 'Report', displayName: reportName },
    config: { version: '2.0', logicalId: spec.report.ids.reportLogicalId }
  });
  writeJson(path.join(reportDir, 'definition.pbir'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json',
    version: '4.0', datasetReference: { byPath: { path: `../${reportName}.SemanticModel` } }
  });
  writeJson(path.join(reportDefinition, 'version.json'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json', version: '2.0.0'
  });
  for (const page of spec.pages) writePage(page);
  writeJson(path.join(pagesDir, 'pages.json'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json',
    pageOrder: spec.pages.map((page) => page.id),
    activePageName: spec.pages[0].id
  });
  const themeFile = `${spec.report.theme.name}-${stableId(`theme:${spec.report.theme.name}`, 8)}.json`;
  writeJson(path.join(reportDefinition, 'report.json'), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.3.0/schema.json',
    themeCollection: { customTheme: { name: themeFile, reportVersionAtImport: { visual: '2.11.0', report: '3.4.0', page: '2.3.1' }, type: 'RegisteredResources' } },
    resourcePackages: [{ name: 'RegisteredResources', type: 'RegisteredResources', items: [{ name: themeFile, path: themeFile, type: 'CustomTheme' }] }],
    settings: {
      useStylableVisualContainerHeader: true,
      exportDataMode: 'AllowSummarized',
      defaultDrillFilterOtherVisuals: true,
      allowChangeFilterTypes: true,
      useEnhancedTooltips: true,
      useDefaultAggregateDisplayName: true
    }
  });
  writeJson(path.join(reportDir, 'StaticResources', 'RegisteredResources', themeFile), {
    name: themeFile,
    dataColors: palette.categorical,
    good: palette.positive,
    neutral: palette.rating,
    bad: palette.discount,
    foreground: palette.ink,
    background: palette.visual,
    tableAccent: palette.accent,
    textClasses: {
      title: { fontFace: fontSemibold, fontSize: 22, color: palette.ink },
      header: { fontFace: fontSemibold, fontSize: 12, color: palette.ink },
      label: { fontFace: font, fontSize: 10, color: palette.slate },
      callout: { fontFace: fontSemibold, fontSize: 30, color: palette.ink }
    },
    visualStyles: {
      tableEx: { '*': { columnHeaders: [{ autoSizeColumnWidth: true, columnAdjustment: 'growToFit' }] } },
      pivotTable: { '*': { columnHeaders: [{ autoSizeColumnWidth: true, columnAdjustment: 'growToFit' }] } }
    }
  });
  writeJson(path.join(outputRoot, `${reportName}.pbip`), {
    $schema: 'https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json',
    version: '1.0', artifacts: [{ report: { path: `${reportName}.Report` } }], settings: { enableAutoRecovery: true }
  });
}

function validateSpec() {
  if (spec.version !== 1) throw new Error(`Unsupported spec version: ${spec.version}`);
  if (!spec.pages?.length || !spec.model.tables?.length) throw new Error('Spec must define model tables and report pages');
  const tablesByName = new Map(spec.model.tables.map((table) => [table.name, table]));
  const validateField = (field) => {
    const descriptor = field.column ?? field.measure;
    if (!descriptor) throw new Error('Field must define either column or measure');
    const [tableName, property] = descriptor;
    const table = tablesByName.get(tableName);
    if (!table) throw new Error(`Unknown field table: ${tableName}`);
    if (field.column && !table.columns.some((column) => column.name === property)) throw new Error(`Unknown column: ${tableName}.${property}`);
    if (field.measure && !(table.measures ?? []).some((measure) => measure.name === property)) throw new Error(`Unknown measure: ${tableName}.${property}`);
  };
  for (const relationship of spec.model.relationships) {
    for (const [tableName, columnName] of [relationship.from, relationship.to]) {
      const table = tablesByName.get(tableName);
      if (!table?.columns.some((column) => column.name === columnName)) throw new Error(`Unknown relationship endpoint: ${tableName}.${columnName}`);
    }
  }
  for (const page of spec.pages) {
    for (const slicer of page.slicers) validateField({ column: slicer.field });
    for (const card of page.cards) validateField({ measure: card.field });
    for (const visual of page.visuals) {
      for (const fields of Object.values(visual.roles)) fields.forEach(validateField);
      if (visual.sortBy) validateField({ measure: visual.sortBy });
    }
  }
}

validateSpec();
validateModelData();
fs.mkdirSync(outputRoot, { recursive: true });
fs.rmSync(reportDir, { recursive: true, force: true });
fs.rmSync(modelDir, { recursive: true, force: true });
fs.rmSync(path.join(outputRoot, `${reportName}.pbip`), { force: true });
writeModel();
writeReport();
console.log(`Built ${reportName} at ${outputRoot}`);
console.log(`Tables: ${tables.map((table) => `${table.name} (${table.rows.length})`).join(', ')}`);
