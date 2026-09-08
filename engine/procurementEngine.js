export const SCENARIOS = {
  BUDGET: { label: "Budget Priority", costWeight: 0.7, timeWeight: 0.3 },
  TIME: { label: "Time Priority", costWeight: 0.25, timeWeight: 0.75 },
  BALANCED: { label: "Balanced", costWeight: 0.5, timeWeight: 0.5 },
};

const num = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value).replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const ceilToMultiple = (qty, multiple = 1) => {
  const m = Math.max(1, num(multiple, 1));
  return Math.ceil(Math.max(0, qty) / m) * m;
};

const scoreSupplier = (supplier, suppliers, requiredLeadTime, scenario) => {
  const prices = suppliers.map((s) => num(s.unitPrice, 0)).filter((x) => x > 0);
  const leads = suppliers.map((s) => num(s.leadTimeDays, 0)).filter((x) => x >= 0);
  const minPrice = Math.min(...prices, num(supplier.unitPrice, 0) || 0);
  const maxPrice = Math.max(...prices, minPrice || 1);
  const minLead = Math.min(...leads, num(supplier.leadTimeDays, 0));
  const maxLead = Math.max(...leads, Math.max(minLead, 1));

  const priceNorm = maxPrice === minPrice ? 0 : (num(supplier.unitPrice, maxPrice) - minPrice) / (maxPrice - minPrice);
  const leadNorm = maxLead === minLead ? 0 : (num(supplier.leadTimeDays, maxLead) - minLead) / (maxLead - minLead);
  const timingPenalty = num(supplier.leadTimeDays, 0) > requiredLeadTime ? 0.35 : 0;
  const preferredBonus = supplier.preferred ? -0.05 : 0;

  return scenario.costWeight * priceNorm + scenario.timeWeight * leadNorm + timingPenalty + preferredBonus;
};

export function runProcurementSimulation({ items = [], inventory = [], demand = [], suppliers = [], scenarioKey = "BALANCED" }) {
  const scenario = SCENARIOS[scenarioKey] || SCENARIOS.BALANCED;
  const demandByItemLocation = new Map();
  const inventoryByItemLocation = new Map();
  const suppliersByItem = new Map();

  demand.forEach((row) => {
    const key = `${row.itemId}::${row.locationId}`;
    demandByItemLocation.set(key, (demandByItemLocation.get(key) || 0) + num(row.quantity));
  });

  inventory.forEach((row) => {
    const key = `${row.itemId}::${row.locationId}`;
    const existing = inventoryByItemLocation.get(key) || { onHand: 0, reserved: 0, value: 0 };
    existing.onHand += num(row.quantityOnHand);
    existing.reserved += num(row.quantityReserved);
    existing.value += num(row.inventoryValue);
    inventoryByItemLocation.set(key, existing);
  });

  suppliers.forEach((row) => {
    if (!row.active) return;
    const current = suppliersByItem.get(row.itemId) || [];
    current.push(row);
    suppliersByItem.set(row.itemId, current);
  });

  const locations = new Set([
    ...inventory.map((r) => r.locationId),
    ...demand.map((r) => r.locationId),
  ].filter(Boolean));

  const result = [];

  items.forEach((item) => {
    locations.forEach((locationId) => {
      const key = `${item.id}::${locationId}`;
      const inv = inventoryByItemLocation.get(key) || { onHand: 0, reserved: 0, value: 0 };
      const demandQty = demandByItemLocation.get(key) || 0;
      const available = Math.max(0, inv.onHand - inv.reserved);
      const netNeed = Math.max(0, demandQty - available);
      const itemSuppliers = suppliersByItem.get(item.id) || [];

      if (demandQty <= 0 && netNeed <= 0) return;

      const leadTimeRequirement = item.requiredLeadTimeDays || 14;
      const safetyStock = num(item.safetyStock, 0);
      const targetStock = demandQty + safetyStock;
      const shortage = Math.max(0, targetStock - available);
      const requiredPurchase = shortage;

      let selectedSupplier = null;
      let reason = "No supplier option was found for this item.";
      let status = "ON-TRACK";

      if (requiredPurchase > 0) {
        if (itemSuppliers.length > 0) {
          selectedSupplier = [...itemSuppliers].sort(
            (a, b) => scoreSupplier(a, itemSuppliers, leadTimeRequirement, scenario) - scoreSupplier(b, itemSuppliers, leadTimeRequirement, scenario)
          )[0];

          const supplierLead = num(selectedSupplier.leadTimeDays, 0);
          if (supplierLead > leadTimeRequirement) {
            status = "URGENT";
            reason = `${scenario.label}: ${selectedSupplier.name} was selected, but its ${supplierLead}-day lead time exceeds the ${leadTimeRequirement}-day planning window.`;
          } else if (available < safetyStock) {
            status = "URGENT";
            reason = `${scenario.label}: available stock is below safety stock and projected demand cannot be covered from inventory.`;
          } else {
            reason = `${scenario.label}: ${selectedSupplier.name} provides the best cost/lead-time trade-off for this cycle.`;
          }
        } else {
          status = "URGENT";
          reason = "Projected demand exceeds available stock, but no active supplier option was supplied.";
        }
      } else if (available > demandQty + safetyStock) {
        status = "EXCESS";
        reason = "Available stock exceeds projected demand plus safety stock; no purchase is recommended.";
      }

      const recommendedQty = selectedSupplier && requiredPurchase > 0
        ? Math.max(num(selectedSupplier.minimumOrderQty, 0), ceilToMultiple(requiredPurchase, selectedSupplier.orderMultiple))
        : 0;

      const unitPrice = selectedSupplier ? num(selectedSupplier.unitPrice, 0) : 0;
      result.push({
        id: `${item.id}-${locationId}`,
        sku: item.sku,
        desc: item.description,
        category: item.category,
        location: locationId,
        buyer: item.buyer || "Unassigned",
        onHand: available,
        reserved: inv.reserved,
        demand: demandQty,
        safetyStock,
        shortage: netNeed,
        leadTime: selectedSupplier ? num(selectedSupplier.leadTimeDays, 0) : 0,
        supplier: selectedSupplier?.name || "—",
        unitPrice,
        status,
        qty: recommendedQty,
        purchaseValue: recommendedQty * unitPrice,
        reason,
      });
    });
  });

  return result.sort((a, b) => {
    const priority = { URGENT: 0, "ON-TRACK": 1, EXCESS: 2 };
    return priority[a.status] - priority[b.status] || b.shortage - a.shortage;
  });
}

export function buildKpis({ items, inventory, results }) {
  const inventoryValue = inventory.reduce((sum, row) => sum + num(row.inventoryValue), 0);
  const purchaseValue = results.reduce((sum, row) => sum + num(row.purchaseValue), 0);
  const criticalShortages = results.filter((r) => r.status === "URGENT").length;
  const excessValue = results.filter((r) => r.status === "EXCESS").reduce((sum, r) => sum + Math.max(0, r.onHand - r.demand) * (r.unitPrice || 0), 0);

  return [
    { label: "Inventory Value", value: `R ${formatCompact(inventoryValue)}`, delta: `${items.length} SKUs loaded`, up: true, accent: "#5B7CFA" },
    { label: "Recommended Purchase", value: `R ${formatCompact(purchaseValue)}`, delta: `${results.filter((r) => r.qty > 0).length} lines`, up: true, accent: "#2DD4BF" },
    { label: "Critical Shortages", value: `${criticalShortages} SKUs`, delta: "simulation result", up: criticalShortages > 0, accent: "#F5A524", warn: criticalShortages > 0 },
    { label: "Estimated Overstock", value: `R ${formatCompact(excessValue)}`, delta: `${results.filter((r) => r.status === "EXCESS").length} lines`, up: false, accent: "#E8636A" },
  ];
}

export function formatCompact(value) {
  const n = num(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-ZA");
}
