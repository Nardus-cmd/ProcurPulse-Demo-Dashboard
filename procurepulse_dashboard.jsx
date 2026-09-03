import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from "recharts";
import {
  Package, TrendingUp, AlertTriangle, Boxes, Users, FolderKanban,
  ShoppingCart, Warehouse, FileBarChart, Search, Bell, ChevronRight,
  ArrowUpRight, ArrowDownRight, Circle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// ProcurePulse — Demo Dashboard (mock data, frontend-only)
// Token system: Ink/Panel dark control-tower theme, amber signal accent,
// teal for healthy metrics, condensed industrial headers + mono data figures.
// ---------------------------------------------------------------------------

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

const COLORS = {
  ink: "#0B1220",
  panel: "#12192C",
  panelRaised: "#182238",
  line: "#26314B",
  amber: "#F5A524",
  teal: "#2DD4BF",
  indigo: "#5B7CFA",
  danger: "#E8636A",
  textPrimary: "#E8ECF6",
  textMuted: "#8C99B8",
};

const demandTrend = [
  { month: "Feb", demand: 4200, supply: 3900 },
  { month: "Mar", demand: 4600, supply: 4300 },
  { month: "Apr", demand: 4300, supply: 4500 },
  { month: "May", demand: 5100, supply: 4700 },
  { month: "Jun", demand: 5600, supply: 5000 },
  { month: "Jul", demand: 5300, supply: 5400 },
  { month: "Aug", demand: 6100, supply: 5500 },
];

const recommendations = [
  { sku: "BRG-4410", desc: "Sealed Roller Bearing", buyer: "T. Naidoo", onHand: 120, demand: 940, leadTime: 14, status: "URGENT", qty: 820 },
  { sku: "HYD-1187", desc: "Hydraulic Hose 3/4in", buyer: "S. Adams", onHand: 340, demand: 610, leadTime: 21, status: "URGENT", qty: 270 },
  { sku: "STL-0092", desc: "Mild Steel Plate 6mm", buyer: "M. Khumalo", onHand: 2100, demand: 1400, leadTime: 7, status: "EXCESS", qty: 0 },
  { sku: "FLT-3325", desc: "Inline Filter Cartridge", buyer: "T. Naidoo", onHand: 560, demand: 780, leadTime: 10, status: "ON-TRACK", qty: 220 },
  { sku: "GSK-7761", desc: "Gasket Set — Pump", buyer: "S. Adams", onHand: 40, demand: 260, leadTime: 28, status: "URGENT", qty: 220 },
  { sku: "CBL-2201", desc: "Armoured Cable 4-core", buyer: "M. Khumalo", onHand: 1800, demand: 900, leadTime: 12, status: "EXCESS", qty: 0 },
];

const domains = [
  { name: "Users", icon: Users },
  { name: "Projects", icon: FolderKanban },
  { name: "Procurement", icon: ShoppingCart, active: true },
  { name: "Inventory", icon: Warehouse },
  { name: "Reporting", icon: FileBarChart },
];

const kpis = [
  { label: "Inventory Value", value: "R 4.82M", delta: "+3.1%", up: true, icon: Boxes, accent: COLORS.indigo },
  { label: "Purchase Value (Open)", value: "R 1.16M", delta: "+8.4%", up: true, icon: ShoppingCart, accent: COLORS.teal },
  { label: "Critical Shortages", value: "14 SKUs", delta: "+4 this wk", up: true, icon: AlertTriangle, accent: COLORS.amber, warn: true },
  { label: "Overstock", value: "R 312K", delta: "-1.8%", up: false, icon: Package, accent: COLORS.danger },
];

function Stamp({ status }) {
  const map = {
    URGENT: { color: COLORS.amber, label: "Urgent" },
    "ON-TRACK": { color: COLORS.teal, label: "On Track" },
    EXCESS: { color: COLORS.danger, label: "Excess" },
  };
  const s = map[status] || map["ON-TRACK"];
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "'Oswald', sans-serif",
        fontSize: 11,
        letterSpacing: "0.12em",
        fontWeight: 600,
        color: s.color,
        border: `1.5px solid ${s.color}`,
        borderRadius: 3,
        padding: "3px 8px",
        transform: "rotate(-2deg)",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

function KpiCard({ k }) {
  const Icon = k.icon;
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 8,
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "'Oswald', sans-serif",
            fontSize: 12,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: COLORS.textMuted,
          }}
        >
          {k.label}
        </span>
        <Icon size={16} color={k.accent} />
      </div>
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: 26,
          fontWeight: 600,
          color: COLORS.textPrimary,
          letterSpacing: "-0.01em",
        }}
      >
        {k.value}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {k.up ? (
          <ArrowUpRight size={13} color={k.warn ? COLORS.amber : COLORS.teal} />
        ) : (
          <ArrowDownRight size={13} color={COLORS.teal} />
        )}
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: k.warn ? COLORS.amber : COLORS.textMuted,
          }}
        >
          {k.delta}
        </span>
      </div>
    </div>
  );
}

export default function ProcurePulseDashboard() {
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const tickerItems = useMemo(
    () => [
      "MANIFEST — PROCUREMENT DEMAND CYCLE Q3",
      "14 SKUs BELOW SAFETY STOCK",
      "3 SUPPLIERS LEAD TIME > 21 DAYS",
      "OPEN PURCHASE VALUE R 1.16M",
      "NEXT BUYING REPORT EXPORT — FRIDAY",
    ],
    []
  );

  return (
    <div
      style={{
        fontFamily: "'Inter', sans-serif",
        background: COLORS.ink,
        color: COLORS.textPrimary,
        minHeight: "100vh",
        width: "100%",
      }}
    >
      <link rel="stylesheet" href={FONTS_HREF} />

      {/* Manifest ticker */}
      <div
        style={{
          background: COLORS.panelRaised,
          borderBottom: `1px solid ${COLORS.line}`,
          overflow: "hidden",
          whiteSpace: "nowrap",
          padding: "6px 0",
        }}
      >
        <div
          style={{
            display: "inline-block",
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.06em",
            color: COLORS.textMuted,
            animation: "pp-ticker 28s linear infinite",
          }}
        >
          {tickerItems.concat(tickerItems).map((t, i) => (
            <span key={i} style={{ marginRight: 48 }}>
              <Circle size={5} color={COLORS.amber} fill={COLORS.amber} style={{ marginRight: 8, verticalAlign: "middle" }} />
              {t}
            </span>
          ))}
        </div>
        <style>{`
          @keyframes pp-ticker {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          @media (prefers-reduced-motion: reduce) {
            div[style*="pp-ticker"] { animation: none !important; }
          }
        `}</style>
      </div>

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 208,
            flexShrink: 0,
            borderRight: `1px solid ${COLORS.line}`,
            padding: "22px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 26,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 6,
                border: `2px solid ${COLORS.indigo}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: "rotate(-3deg)",
              }}
            >
              <span style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 13, color: COLORS.indigo }}>
                PP
              </span>
            </div>
            <div>
              <div style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 600, fontSize: 15, letterSpacing: "0.01em" }}>
                ProcurePulse
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 9.5,
                  color: COLORS.amber,
                  letterSpacing: "0.1em",
                }}
              >
                DEMO ENVIRONMENT
              </div>
            </div>
          </div>

          <div>
            <div
              style={{
                fontFamily: "'Oswald', sans-serif",
                fontSize: 11,
                letterSpacing: "0.1em",
                color: COLORS.textMuted,
                textTransform: "uppercase",
                padding: "0 8px 8px",
              }}
            >
              Domains
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {domains.map((d) => {
                const Icon = d.icon;
                return (
                  <div
                    key={d.name}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 10px",
                      borderRadius: 6,
                      background: d.active ? COLORS.panelRaised : "transparent",
                      color: d.active ? COLORS.textPrimary : COLORS.textMuted,
                      cursor: "pointer",
                      fontSize: 13.5,
                    }}
                  >
                    <Icon size={15} color={d.active ? COLORS.indigo : COLORS.textMuted} />
                    <span>{d.name}</span>
                    {d.active && <ChevronRight size={13} style={{ marginLeft: "auto" }} />}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: "auto", padding: "10px 8px", borderTop: `1px solid ${COLORS.line}` }}>
            <div style={{ fontSize: 11.5, color: COLORS.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
              {clock.toLocaleTimeString("en-ZA", { hour12: false })}
            </div>
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, minWidth: 0, padding: "22px 28px 40px" }}>
          {/* Header row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <h1 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, fontWeight: 600, margin: 0 }}>
                Procurement Overview
              </h1>
              <p style={{ fontSize: 12.5, color: COLORS.textMuted, margin: "4px 0 0" }}>
                Project: Q3 Replenishment Cycle — sample dataset
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: COLORS.panel,
                  border: `1px solid ${COLORS.line}`,
                  borderRadius: 6,
                  padding: "7px 12px",
                  color: COLORS.textMuted,
                  fontSize: 13,
                }}
              >
                <Search size={14} />
                <span>Search SKU, buyer, supplier…</span>
              </div>
              <Bell size={17} color={COLORS.textMuted} />
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: "50%",
                  background: COLORS.indigo,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                MZ
              </div>
            </div>
          </div>

          {/* KPI row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0,1fr))",
              gap: 14,
              marginBottom: 22,
            }}
          >
            {kpis.map((k) => (
              <KpiCard key={k.label} k={k} />
            ))}
          </div>

          {/* Chart + recommendation summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 22 }}>
            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "18px 18px 8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: COLORS.textMuted }}>
                  Demand vs Supply Trend
                </span>
                <TrendingUp size={15} color={COLORS.indigo} />
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={demandTrend} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.indigo} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COLORS.indigo} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="supplyFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.teal} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={COLORS.teal} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.line} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    contentStyle={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.line}`, borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: COLORS.textPrimary }}
                  />
                  <Area type="monotone" dataKey="demand" stroke={COLORS.indigo} fill="url(#demandFill)" strokeWidth={2} name="Demand" />
                  <Area type="monotone" dataKey="supply" stroke={COLORS.teal} fill="url(#supplyFill)" strokeWidth={2} name="Supply" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 18 }}>
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: COLORS.textMuted }}>
                Recommendation Summary
              </span>
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={[
                  { name: "Urgent", value: 3, fill: COLORS.amber },
                  { name: "On-Track", value: 1, fill: COLORS.teal },
                  { name: "Excess", value: 2, fill: COLORS.danger },
                ]} margin={{ top: 16, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={COLORS.line} strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
                  <YAxis tick={{ fill: COLORS.textMuted, fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip contentStyle={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.line}`, borderRadius: 6, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {[COLORS.amber, COLORS.teal, COLORS.danger].map((c, i) => (
                      <Cell key={i} fill={c} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p style={{ fontSize: 12, color: COLORS.textMuted, margin: "6px 0 0", lineHeight: 1.5 }}>
                6 SKUs assessed this cycle. 3 require immediate purchase action based on safety stock and lead time.
              </p>
            </div>
          </div>

          {/* Recommendations table */}
          <div style={{ background: COLORS.panel, border: `1px solid ${COLORS.line}`, borderRadius: 8, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", color: COLORS.textMuted }}>
                Procurement Recommendations
              </span>
              <span style={{ fontSize: 11.5, fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted }}>
                6 of 6 rows
              </span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderTop: `1px solid ${COLORS.line}`, borderBottom: `1px solid ${COLORS.line}` }}>
                  {["SKU", "Description", "Buyer", "On Hand", "Demand", "Lead Time", "Status", "Recommended Qty"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: h === "Recommended Qty" || h === "On Hand" || h === "Demand" || h === "Lead Time" ? "right" : "left",
                        padding: "9px 18px",
                        fontFamily: "'Oswald', sans-serif",
                        fontWeight: 500,
                        fontSize: 11,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: COLORS.textMuted,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recommendations.map((r) => (
                  <tr key={r.sku} style={{ borderBottom: `1px solid ${COLORS.line}` }}>
                    <td style={{ padding: "10px 18px", fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textPrimary }}>{r.sku}</td>
                    <td style={{ padding: "10px 18px", color: COLORS.textPrimary }}>{r.desc}</td>
                    <td style={{ padding: "10px 18px", color: COLORS.textMuted }}>{r.buyer}</td>
                    <td style={{ padding: "10px 18px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted }}>{r.onHand}</td>
                    <td style={{ padding: "10px 18px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted }}>{r.demand}</td>
                    <td style={{ padding: "10px 18px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", color: COLORS.textMuted }}>{r.leadTime}d</td>
                    <td style={{ padding: "10px 18px" }}><Stamp status={r.status} /></td>
                    <td style={{ padding: "10px 18px", textAlign: "right", fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, color: r.qty > 0 ? COLORS.textPrimary : COLORS.textMuted }}>
                      {r.qty > 0 ? r.qty.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 14 }}>
            Sample dataset for demonstration purposes. Figures are illustrative and do not reflect live inventory or supplier data.
          </p>
        </div>
      </div>
    </div>
  );
}
