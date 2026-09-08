const clean = (value) => String(value ?? "").trim();
const slug = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const aliases = {
  sku: ["sku", "item", "item_code", "item_no", "item_number", "product_code", "part_no", "part_number", "no"],
  description: ["description", "item_description", "product_description", "name", "item_name"],
  location: ["location", "location_code", "site", "branch", "branch_code", "warehouse", "warehouse_code", "store"],
  quantityOnHand: ["quantity_on_hand", "on_hand", "stock", "stock_on_hand", "qty_on_hand", "quantity", "inventory"],
  quantityReserved: ["quantity_reserved", "reserved", "qty_reserved", "allocated", "qty_allocated"],
  inventoryValue: ["inventory_value", "stock_value", "value", "inventory_cost", "stock_cost"],
  demand: ["demand", "demand_quantity", "required_qty", "required_quantity", "usage", "forecast", "sales_qty", "job_qty"],
  requiredDate: ["required_date", "due_date", "need_date", "required_by", "date_required"],
  supplier: ["supplier", "supplier_name", "vendor", "vendor_name"],
  supplierSku: ["supplier_sku", "vendor_sku", "vendor_item", "supplier_item"],
  unitPrice: ["unit_price", "price", "purchase_price", "cost", "unit_cost"],
  currency: ["currency", "curr"],
  leadTimeDays: ["lead_time_days", "lead_time", "leadtime", "days_lead_time"],
  minimumOrderQty: ["minimum_order_qty", "min_order_qty", "moq", "minimum_qty"],
  orderMultiple: ["order_multiple", "multiple", "order_increment", "pack_size"],
  preferred: ["preferred", "primary", "preferred_supplier"],
  buyer: ["buyer", "buyer_name", "purchaser", "purchasing_officer"],
  safetyStock: ["safety_stock", "safety_stock_qty", "min_stock", "minimum_stock"],
  category: ["category", "item_category", "product_group", "group"],
  source: ["source", "source_type", "document_type"],
};

function makeLookup(headers) {
  const map = new Map(headers.map((h) => [slug(h), h]));
  const lookup = {};
  Object.entries(aliases).forEach(([canonical, options]) => {
    lookup[canonical] = options.map(slug).find((a) => map.has(a));
    if (lookup[canonical]) lookup[canonical] = map.get(lookup[canonical]);
  });
  return lookup;
}

function value(row, lookup, key) {
  return lookup[key] ? row[lookup[key]] : undefined;
}

function toNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function toBool(value) {
  if (typeof value === "boolean") return value;
  const v = clean(value).toLowerCase();
  return ["true", "yes", "y", "1", "preferred", "primary"].includes(v);
}

function detectSheetType(name, headers) {
  const n = slug(name);
  const h = headers.map(slug);
  if (/supplier|vendor/.test(n) || h.some((x) => /supplier|vendor/.test(x))) return "suppliers";
  if (/inventory|stock|on_hand|warehouse/.test(n) || h.some((x) => /on_hand|stock|inventory/.test(x))) return "inventory";
  if (/demand|sales|jobs|orders|usage|forecast/.test(n) || h.some((x) => /demand|usage|forecast|required_qty|sales_qty|job_qty/.test(x))) return "demand";
  if (/item|product|sku|master/.test(n) || h.includes("sku") || h.includes("item_code") || h.includes("item_no")) return "items";
  return "unknown";
}

function rowsFromSheet(sheet, XLSX) {
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

export async function parseWorkbook(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const parsed = { items: [], inventory: [], demand: [], suppliers: [], sheets: [], warnings: [] };

  workbook.SheetNames.forEach((sheetName) => {
    const rows = rowsFromSheet(workbook.Sheets[sheetName], XLSX);
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const type = detectSheetType(sheetName, headers);
    const lookup = makeLookup(headers);
    parsed.sheets.push({ name: sheetName, type, rows: rows.length });

    if (type === "items") {
      rows.forEach((row, index) => {
        const sku = clean(value(row, lookup, "sku"));
        if (!sku) return;
        parsed.items.push({
          id: `item-${parsed.items.length + 1}`,
          sku,
          description: clean(value(row, lookup, "description")) || sku,
          category: clean(value(row, lookup, "category")) || "Uncategorised",
          unitOfMeasure: "EA",
          buyer: clean(value(row, lookup, "buyer")) || "Unassigned",
          safetyStock: toNumber(value(row, lookup, "safetyStock")),
          requiredLeadTimeDays: 14,
          status: "ACTIVE",
          row: index + 2,
        });
      });
    }

    if (type === "inventory") {
      rows.forEach((row) => {
        const sku = clean(value(row, lookup, "sku"));
        if (!sku) return;
        parsed.inventory.push({
          itemId: `sku:${sku}`,
          sku,
          locationId: clean(value(row, lookup, "location")) || "DEFAULT",
          quantityOnHand: toNumber(value(row, lookup, "quantityOnHand")),
          quantityReserved: toNumber(value(row, lookup, "quantityReserved")),
          inventoryValue: toNumber(value(row, lookup, "inventoryValue")),
        });
      });
    }

    if (type === "demand") {
      rows.forEach((row) => {
        const sku = clean(value(row, lookup, "sku"));
        if (!sku) return;
        parsed.demand.push({
          itemId: `sku:${sku}`,
          sku,
          locationId: clean(value(row, lookup, "location")) || "DEFAULT",
          quantity: toNumber(value(row, lookup, "demand")),
          requiredDate: value(row, lookup, "requiredDate") || null,
          sourceType: clean(value(row, lookup, "source")) || "UPLOAD",
        });
      });
    }

    if (type === "suppliers") {
      rows.forEach((row) => {
        const sku = clean(value(row, lookup, "sku"));
        const supplier = clean(value(row, lookup, "supplier"));
        if (!sku || !supplier) return;
        parsed.suppliers.push({
          itemId: `sku:${sku}`,
          sku,
          name: supplier,
          supplierSku: clean(value(row, lookup, "supplierSku")) || sku,
          unitPrice: toNumber(value(row, lookup, "unitPrice")),
          currency: clean(value(row, lookup, "currency")) || "ZAR",
          leadTimeDays: toNumber(value(row, lookup, "leadTimeDays")),
          minimumOrderQty: toNumber(value(row, lookup, "minimumOrderQty"), 1),
          orderMultiple: toNumber(value(row, lookup, "orderMultiple"), 1),
          preferred: toBool(value(row, lookup, "preferred")),
          active: true,
        });
      });
    }
  });

  // Build missing item master from any sheet containing a SKU.
  const bySku = new Map(parsed.items.map((i) => [i.sku, i]));
  [...parsed.inventory, ...parsed.demand, ...parsed.suppliers].forEach((row) => {
    if (!bySku.has(row.sku)) {
      const item = {
        id: `item-${bySku.size + 1}`,
        sku: row.sku,
        description: row.sku,
        category: "Imported",
        unitOfMeasure: "EA",
        buyer: "Unassigned",
        safetyStock: 0,
        requiredLeadTimeDays: 14,
        status: "ACTIVE",
      };
      bySku.set(row.sku, item);
      parsed.items.push(item);
    }
  });

  if (!parsed.inventory.length) parsed.warnings.push("No inventory sheet/data was detected.");
  if (!parsed.demand.length) parsed.warnings.push("No demand sheet/data was detected.");
  if (!parsed.suppliers.length) parsed.warnings.push("No supplier sheet/data was detected. Recommendations may not include supplier selection.");

  return parsed;
}

export function rekeyToItems(parsed) {
  const itemBySku = new Map(parsed.items.map((i) => [i.sku, i]));
  return {
    ...parsed,
    inventory: parsed.inventory.map((r) => ({ ...r, itemId: itemBySku.get(r.sku)?.id || `sku:${r.sku}` })),
    demand: parsed.demand.map((r) => ({ ...r, itemId: itemBySku.get(r.sku)?.id || `sku:${r.sku}` })),
    suppliers: parsed.suppliers.map((r) => ({ ...r, itemId: itemBySku.get(r.sku)?.id || `sku:${r.sku}` })),
  };
}

export function recommendationsToCsv(rows) {
  const headers = ["SKU", "Description", "Location", "Buyer", "Supplier", "On Hand", "Demand", "Safety Stock", "Lead Time (Days)", "Status", "Recommended Qty", "Unit Price", "Purchase Value", "Reason"];
  const escape = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const body = rows.map((r) => [r.sku, r.desc, r.location, r.buyer, r.supplier, r.onHand, r.demand, r.safetyStock, r.leadTime, r.status, r.qty, r.unitPrice, r.purchaseValue, r.reason].map(escape).join(","));
  return [headers.join(","), ...body].join("\n");
}
