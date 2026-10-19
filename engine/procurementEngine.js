
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

const dateValue = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const scoreSupplier = (supplier, suppliers, requiredLeadTime, scenario) => {
  const prices = suppliers.map((s) => num(s.unitPrice, 0)).filter((x) => x > 0);
  const leads = suppliers.map((s) => num(s.leadTimeDays, 0)).filter((x) => x >= 0);

  const minPrice = prices.length ? Math.min(...prices) : num(supplier.unitPrice, 0);
  const maxPrice = prices.length ? Math.max(...prices) : minPrice;
  const minLead = leads.length ? Math.min(...leads) : num(supplier.leadTimeDays, 0);
  const maxLead = leads.length ? Math.max(...leads) : minLead;

  const price = num(supplier.unitPrice, 0);
  const lead = num(supplier.leadTimeDays, 0);
  const priceNorm = maxPrice === minPrice ? 0 : (price - minPrice) / (maxPrice - minPrice);
  const leadNorm = maxLead === minLead ? 0 : (lead - minLead) / (maxLead - minLead);
  const timingPenalty = lead > requiredLeadTime ? 0.35 : 0;
  const preferredBonus = supplier.preferred ? -0.05 : 0;

  return scenario.costWeight * priceNorm
    + scenario.timeWeight * leadNorm
    + timingPenalty
    + preferredBonus;
};

const makeKey = (itemId, locationId) => `${itemId}::${locationId}`;

export function runProcurementSimulation({
  items = [],
  inventory = [],
  demand = [],
  suppliers = [],
  movements = [],
  inTransit = [],
  purchaseOrders = [],
  classifications = [],
  scenarioKey = "BALANCED",
}) {
  const scenario = SCENARIOS[scenarioKey] || SCENARIOS.BALANCED;

  // The classification worksheet is authoritative. Duplicate or invalid
  // records are deliberately treated as unresolved rather than guessed.
  const classificationRowsBySku = new Map();
  classifications.forEach((row) => {
    const sku = String(row.sku || "").trim();
    if (!sku) return;
    const rows = classificationRowsBySku.get(sku) || [];
    rows.push(row);
    classificationRowsBySku.set(sku, rows);
  });

  const validClasses = new Set(["A", "B", "C", "D", "S", "N", "NPI"]);
  const classificationBySku = new Map();

  classificationRowsBySku.forEach((rows, sku) => {
    if (rows.length !== 1) {
      classificationBySku.set(sku, { value: null, invalid: true });
      return;
    }
    const value = String(
      rows[0].movementClass ?? rows[0].classification ?? ""
    ).trim().toUpperCase();
    classificationBySku.set(sku, {
      value: validClasses.has(value) ? value : null,
      invalid: !validClasses.has(value),
    });
  });

  const demandByItemLocation = new Map();
  const inventoryByItemLocation = new Map();
  const suppliersByItem = new Map();
  const inboundByItemLocation = new Map();
  const movementByItemLocation = new Map();
  const transitByPurchaseOrder = new Map();

  // Aggregate demand by SKU and location.
  demand.forEach((row) => {
    const key = makeKey(row.itemId, row.locationId);
    demandByItemLocation.set(
      key,
      (demandByItemLocation.get(key) || 0) + Math.max(0, num(row.quantity))
    );
  });

  // Aggregate on-hand, reserved stock, and SKU Min/Max values.
  inventory.forEach((row) => {
    const key = makeKey(row.itemId, row.locationId);
    const existing = inventoryByItemLocation.get(key) || {
      onHand: 0,
      reserved: 0,
      value: 0,
      safetyStock: 0,
      minStock: 0,
      maxStock: 0,
    };

    existing.onHand += Math.max(0, num(row.quantityOnHand));
    existing.reserved += Math.max(0, num(row.quantityReserved));
    existing.value += Math.max(0, num(row.inventoryValue));

    if (row.safetyStock !== undefined && row.safetyStock !== null) {
      existing.safetyStock = Math.max(0, num(row.safetyStock));
    }
    if (row.minStock !== undefined && row.minStock !== null) {
      existing.minStock = Math.max(0, num(row.minStock));
    }
    if (row.maxStock !== undefined && row.maxStock !== null) {
      existing.maxStock = Math.max(0, num(row.maxStock));
    }

    inventoryByItemLocation.set(key, existing);
  });

  // Keep only active supplier options.
  suppliers.forEach((row) => {
    if (row.active === false || row.active === 0 || row.active === "false") return;
    const current = suppliersByItem.get(row.itemId) || [];
    current.push(row);
    suppliersByItem.set(row.itemId, current);
  });

  // Index in-transit details by PO number. These records provide status/ETA;
  // their quantities are NOT added to PO outstanding quantities.
  inTransit.forEach((row) => {
    if (!row.purchaseOrderNo) return;
    transitByPurchaseOrder.set(String(row.purchaseOrderNo).trim(), row);
  });

  // PurchaseOrders is the authoritative source for outstanding inbound quantity.
  // Deduplicate repeated PO/SKU/location rows to prevent double counting.
  const seenPurchaseOrderLines = new Set();

  purchaseOrders.forEach((row) => {
    const quantity = Math.max(0, num(row.quantityOutstanding));
    if (quantity <= 0) return;

    const poNo = String(row.purchaseOrderNo || "").trim();
    const lineKey = poNo
      ? `${poNo}::${row.itemId}::${row.locationId}`
      : `${row.itemId}::${row.locationId}::${row.expectedArrivalDate || ""}::${quantity}`;

    if (seenPurchaseOrderLines.has(lineKey)) return;
    seenPurchaseOrderLines.add(lineKey);

    const key = makeKey(row.itemId, row.locationId);
    const existing = inboundByItemLocation.get(key) || {
      quantity: 0,
      lateQuantity: 0,
      earliestArrival: null,
      purchaseOrderCount: 0,
    };

    existing.quantity += quantity;
    existing.purchaseOrderCount += 1;

    const transit = poNo ? transitByPurchaseOrder.get(poNo) : null;
    const statusText = `${row.status || ""} ${transit?.status || ""}`.toLowerCase();
    const eta = dateValue(transit?.expectedArrivalDate || row.expectedArrivalDate);
    const isLate = statusText.includes("late")
      || statusText.includes("overdue")
      || (eta && eta.getTime() < Date.now());

    if (isLate) existing.lateQuantity += quantity;

    if (eta && (!existing.earliestArrival || eta < existing.earliestArrival)) {
      existing.earliestArrival = eta;
    }

    inboundByItemLocation.set(key, existing);
  });

  // Calculate movement history separately for each SKU and location.
  // Use the most recent valid movement date as the data anchor so demo data
  // stays reproducible even when the workbook contains historical dates.
  const validMovements = movements
    .map((row) => ({ ...row, parsedDate: dateValue(row.movementDate) }))
    .filter((row) => row.parsedDate && num(row.quantity) > 0);

  const latestMovementDate = validMovements.reduce(
    (latest, row) => !latest || row.parsedDate > latest ? row.parsedDate : latest,
    null
  );

  const windowEnd = latestMovementDate
    ? new Date(latestMovementDate.getFullYear(), latestMovementDate.getMonth() + 1, 1)
    : null;
  const windowStart = windowEnd
    ? new Date(windowEnd.getFullYear(), windowEnd.getMonth() - 12, 1)
    : null;

  validMovements.forEach((row) => {
    if (windowStart && row.parsedDate < windowStart) return;
    if (windowEnd && row.parsedDate >= windowEnd) return;

    // This workbook records ISSUE as consumption. Do not treat receipts or
    // adjustments as demand.
    if (row.movementType && !["ISSUE", "1", "5", "SALE", "CONSUMPTION"].includes(
      String(row.movementType).toUpperCase()
    )) return;

    const key = makeKey(row.itemId, row.locationId);
    const existing = movementByItemLocation.get(key) || {
      quantity: 0,
      activeMonths: new Set(),
    };

    existing.quantity += Math.abs(num(row.quantity));
    existing.activeMonths.add(
      `${row.parsedDate.getFullYear()}-${String(row.parsedDate.getMonth() + 1).padStart(2, "0")}`
    );
    movementByItemLocation.set(key, existing);
  });

  const locations = new Set([
    ...inventory.map((row) => row.locationId),
    ...demand.map((row) => row.locationId),
    ...purchaseOrders.map((row) => row.locationId),
  ].filter(Boolean));

  const result = [];

  items.forEach((item) => {
    locations.forEach((locationId) => {
      const key = makeKey(item.id, locationId);
      const inv = inventoryByItemLocation.get(key) || {
        onHand: 0,
        reserved: 0,
        value: 0,
        safetyStock: 0,
        minStock: 0,
        maxStock: 0,
      };

      const demandQty = demandByItemLocation.get(key) || 0;
      const available = Math.max(0, inv.onHand - inv.reserved);
      const inbound = inboundByItemLocation.get(key) || {
        quantity: 0,
        lateQuantity: 0,
        earliestArrival: null,
        purchaseOrderCount: 0,
      };
      const movement = movementByItemLocation.get(key) || {
        quantity: 0,
        activeMonths: new Set(),
      };

      const minStock = Math.max(0, num(inv.minStock));
      const maxStock = Math.max(0, num(inv.maxStock));
      const safetyStock = Math.max(0, num(inv.safetyStock, num(item.safetyStock)));
      const classRecord = classificationBySku.get(String(item.sku || "").trim());
      const classification = classRecord?.value || null;
      const classificationInvalid = !classRecord || classRecord.invalid || !classification;
      const automaticClass = ["A", "B", "C"].includes(classification);
      const averageMonthlyConsumption = movement.quantity / 12;
      const monthsWithMovement = movement.activeMonths.size;

      // Inbound is counted once using outstanding PO quantities.
      const projectedStock = available + inbound.quantity - demandQty;
      const replenishmentTriggered = projectedStock < minStock;

      // When triggered, buy enough to cover demand and restore the Max target.
      // A zero Max means no configured target, so cover demand/Min instead.
      const targetStock = maxStock > 0 ? maxStock : minStock;
      const replenishmentRequired = replenishmentTriggered
        ? Math.max(0, demandQty + targetStock - available - inbound.quantity)
        : 0;
      const requiredPurchase = automaticClass ? replenishmentRequired : 0;
      const shortage = Math.max(0, demandQty - available - inbound.quantity);

      if (
        demandQty <= 0
        && inbound.quantity <= 0
        && available >= minStock
        && !replenishmentTriggered
      ) return;

      const leadTimeRequirement = Math.max(1, num(item.requiredLeadTimeDays, 14));
      let policyAction = "AUTO_REPLENISH";
      let policyReason = "Class A/B/C: automatic replenishment policy applies.";

      if (classificationInvalid) {
        policyAction = "MANUAL_REVIEW";
        policyReason = "Classification is missing, invalid, or duplicated in ABCClassification. Correct the classification before authorising replenishment.";
      } else if (classification === "S") {
        policyAction = "SITE_INTERVENTION";
        policyReason = "Strategic stock requires site/branch review to decide whether to replenish, maintain, or revise the stock requirement.";
      } else if (["D", "N", "NPI"].includes(classification)) {
        policyAction = "MANUAL_REVIEW";
        policyReason = `Class ${classification}: review demand, risk, and stock requirements before authorising a purchase.`;
      }
      const itemSuppliers = suppliersByItem.get(item.id) || [];

      let selectedSupplier = null;
      let reason = "Projected stock remains above the configured Min level; no purchase is required.";
      let status = "ON-TRACK";

      if (inbound.lateQuantity > 0 && projectedStock < minStock) {
        status = "URGENT";
        reason = `Outstanding inbound stock includes ${inbound.lateQuantity} late units. The engine counts those POs once, but the delayed receipts put the projected stock below Min. Follow up on the overdue orders before placing a duplicate order.`;
      }

      if (!automaticClass && shortage > 0) {
        status = "URGENT";
        reason = `A genuine demand shortage of ${shortage} units remains visible. Automatic replenishment is blocked by the classification policy; review the shortage before ordering.`;
      } else if (!automaticClass && classificationInvalid && replenishmentTriggered) {
        status = "URGENT";
        reason = "Projected stock is below Min, but classification is unresolved. Correct the classification before authorising replenishment.";
      } else if (!automaticClass && replenishmentTriggered) {
        status = "ON-TRACK";
        reason = "Projected stock is below Min, but the classification policy requires manual review rather than an automatic top-up.";
      }

      if (requiredPurchase > 0) {
        if (itemSuppliers.length > 0) {
          selectedSupplier = [...itemSuppliers].sort(
            (a, b) => scoreSupplier(a, itemSuppliers, leadTimeRequirement, scenario)
              - scoreSupplier(b, itemSuppliers, leadTimeRequirement, scenario)
          )[0];

          const supplierLead = Math.max(0, num(selectedSupplier.leadTimeDays));
          const availableAfterDemand = available - demandQty;

          if (supplierLead > leadTimeRequirement) {
            status = "URGENT";
            reason = `${scenario.label}: ${selectedSupplier.name} is the best available scenario match, but its ${supplierLead}-day lead time exceeds the ${leadTimeRequirement}-day planning window.`;
          } else if (shortage > 0 || availableAfterDemand < safetyStock) {
            status = "URGENT";
            reason = `${scenario.label}: current stock and outstanding inbound quantities do not adequately cover demand and the configured stock thresholds. ${selectedSupplier.name} is the selected supplier option.`;
          } else if (inbound.lateQuantity > 0) {
            status = "URGENT";
            reason = `The projected stock position triggers replenishment, and ${inbound.lateQuantity} inbound units are marked late. Follow up on the delayed POs; ${selectedSupplier.name} is the selected supplier for the additional requirement.`;
          } else {
            reason = `${scenario.label}: projected stock falls below Min after demand and inbound receipts. ${selectedSupplier.name} is selected using the scenario's cost/lead-time weighting.`;
          }
        } else {
          status = "URGENT";
          reason = "Projected stock falls below Min after demand and outstanding inbound receipts, but no active supplier option is available.";
        }
      } else if (available > demandQty + safetyStock && available > maxStock && maxStock > 0) {
        status = "EXCESS";
        reason = "Available stock exceeds the configured Max target and projected demand plus safety stock; no purchase is recommended.";
      } else if (inbound.quantity > 0) {
        reason = `Outstanding purchase orders contribute ${inbound.quantity} inbound units. These are counted once in the projected stock position.`;
      }

      const recommendedQty = selectedSupplier && requiredPurchase > 0
        ? ceilToMultiple(
            Math.max(requiredPurchase, num(selectedSupplier.minimumOrderQty)),
            selectedSupplier.orderMultiple
          )
        : 0;

      const unitPrice = selectedSupplier ? num(selectedSupplier.unitPrice) : 0;
      const transitNote = inbound.quantity > 0
        ? ` Inbound: ${inbound.quantity} units across ${inbound.purchaseOrderCount} outstanding PO line(s).`
        : "";
      const movementNote = movement.quantity > 0
        ? ` Location history: ${movement.quantity} units consumed across ${monthsWithMovement} active month(s) in the 12-month window (average ${averageMonthlyConsumption.toFixed(1)} units/month).`
        : " No qualifying historical consumption was found for this SKU/location in the movement window.";

      reason += transitNote + movementNote;

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
        shortage,
        leadTime: selectedSupplier ? num(selectedSupplier.leadTimeDays) : 0,
        supplier: selectedSupplier?.name || "—",
        unitPrice,
        status,
        qty: recommendedQty,
        purchaseValue: recommendedQty * unitPrice,
        reason,
        minStock,
        maxStock,
        inbound: inbound.quantity,
        lateInbound: inbound.lateQuantity,
        projectedStock,
        averageMonthlyConsumption,
        monthsWithMovement,
        movement12MonthQuantity: movement.quantity,
        earliestInboundDate: inbound.earliestArrival?.toISOString().slice(0, 10) || null,
        classification: classification || "UNCLASSIFIED",
        policyAction,
        policyReason,
      });
    });
  });

  const priority = { URGENT: 0, "ON-TRACK": 1, EXCESS: 2 };
  return result.sort(
    (a, b) => priority[a.status] - priority[b.status] || b.shortage - a.shortage
  );
}

export function buildKpis({ items, inventory, results }) {
  const inventoryValue = inventory.reduce((sum, row) => sum + num(row.inventoryValue), 0);
  const purchaseValue = results.reduce((sum, row) => sum + num(row.purchaseValue), 0);
  const criticalShortages = results.filter((row) => row.status === "URGENT").length;
  const excessValue = results
    .filter((row) => row.status === "EXCESS")
    .reduce((sum, row) => sum + Math.max(0, row.onHand - row.demand) * (row.unitPrice || 0), 0);

  return [
    { label: "Inventory Value", value: `R ${formatCompact(inventoryValue)}`, delta: `${items.length} SKUs loaded`, up: true, accent: "#5B7CFA" },
    { label: "Recommended Purchase", value: `R ${formatCompact(purchaseValue)}`, delta: `${results.filter((row) => row.qty > 0).length} lines`, up: true, accent: "#2DD4BF" },
    { label: "Critical Shortages", value: `${criticalShortages} SKUs`, delta: "simulation result", up: criticalShortages > 0, accent: "#F5A524", warn: criticalShortages > 0 },
    { label: "Estimated Overstock", value: `R ${formatCompact(excessValue)}`, delta: `${results.filter((row) => row.status === "EXCESS").length} lines`, up: false, accent: "#E8636A" },
  ];
}

export function formatCompact(value) {
  const n = num(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-ZA");
}
