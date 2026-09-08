"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { Package, TrendingUp, AlertTriangle, Boxes, Users, FolderKanban, ShoppingCart, Warehouse, FileBarChart, Search, Bell, ChevronRight, ArrowUpRight, ArrowDownRight, Circle, Upload, Play, Download, FileSpreadsheet, CheckCircle2, XCircle, Loader2, Info } from "lucide-react";
import { SCENARIOS, runProcurementSimulation, buildKpis, formatCompact } from "../engine/procurementEngine";
import { parseWorkbook, rekeyToItems, recommendationsToCsv } from "../lib/excel";

const FONTS_HREF = "https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
const COLORS = { ink:"#0B1220", panel:"#12192C", panelRaised:"#182238", line:"#26314B", amber:"#F5A524", teal:"#2DD4BF", indigo:"#5B7CFA", danger:"#E8636A", textPrimary:"#E8ECF6", textMuted:"#8C99B8" };

const domains = [
  { name:"Users", icon:Users }, { name:"Projects", icon:FolderKanban }, { name:"Procurement", icon:ShoppingCart, active:true }, { name:"Inventory", icon:Warehouse }, { name:"Reporting", icon:FileBarChart },
];

function Stamp({ status }) {
  const map={URGENT:{color:COLORS.amber,label:"Urgent"},"ON-TRACK":{color:COLORS.teal,label:"On Track"},EXCESS:{color:COLORS.danger,label:"Excess"}};
  const s=map[status]||map["ON-TRACK"];
  return <span style={{display:"inline-block",fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:".12em",fontWeight:600,color:s.color,border:`1.5px solid ${s.color}`,borderRadius:3,padding:"3px 8px",textTransform:"uppercase",whiteSpace:"nowrap"}}>{s.label}</span>;
}

function KpiCard({ k }) {
  const Icon=k.icon||Boxes;
  return <div style={{background:COLORS.panel,border:`1px solid ${COLORS.line}`,borderRadius:8,padding:"18px 20px",display:"flex",flexDirection:"column",gap:10,minWidth:0}}>
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}><span style={{fontFamily:"'Oswald',sans-serif",fontSize:12,letterSpacing:'.08em',textTransform:'uppercase',color:COLORS.textMuted}}>{k.label}</span><Icon size={16} color={k.accent}/></div>
    <div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:26,fontWeight:600,color:COLORS.textPrimary}}>{k.value}</div>
    <div style={{display:"flex",alignItems:"center",gap:4}}>{k.up?<ArrowUpRight size={13} color={k.warn?COLORS.amber:COLORS.teal}/>:<ArrowDownRight size={13} color={COLORS.teal}/>}<span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:12,color:k.warn?COLORS.amber:COLORS.textMuted}}>{k.delta}</span></div>
  </div>;
}

function UploadPanel({ onFile, fileName, loading, error, warnings }) {
  const [dragging,setDragging]=useState(false);
  return <div style={{background:COLORS.panel,border:`1px solid ${COLORS.line}`,borderRadius:8,padding:18,marginBottom:22}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
      <div>
        <div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,letterSpacing:'.05em',textTransform:'uppercase'}}>Live Excel Demo Input</div>
        <div style={{fontSize:12,color:COLORS.textMuted,marginTop:5}}>Upload your sample workbook. ProcurePulse will detect inventory, demand, supplier and item sheets automatically.</div>
      </div>
      <label onDragOver={(e)=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={(e)=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files?.[0];if(f)onFile(f)}} style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer',background:dragging?COLORS.panelRaised:COLORS.ink,border:`1px dashed ${dragging?COLORS.indigo:COLORS.line}`,borderRadius:7,padding:'11px 14px',minWidth:250}}>
        <Upload size={17} color={COLORS.indigo}/><span style={{fontSize:12}}>{loading?'Reading workbook…':fileName||'Choose Excel file'}</span><input type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={(e)=>e.target.files?.[0]&&onFile(e.target.files[0])}/>
      </label>
    </div>
    {loading&&<div style={{marginTop:12,color:COLORS.textMuted,fontSize:12,display:'flex',alignItems:'center',gap:8}}><Loader2 size={14} className="pp-spin"/> Parsing workbook in browser…</div>}
    {error&&<div style={{marginTop:12,color:COLORS.danger,fontSize:12,display:'flex',alignItems:'center',gap:8}}><XCircle size={14}/>{error}</div>}
    {warnings?.length>0&&<div style={{marginTop:12,fontSize:11.5,color:COLORS.amber}}>{warnings.join(' • ')}</div>}
  </div>;
}

function SimulationPanel({ scenarioKey, setScenarioKey, onRun, running, hasData }) {
  return <div style={{background:COLORS.panel,border:`1px solid ${COLORS.line}`,borderRadius:8,padding:18,marginBottom:22}}>
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:18,flexWrap:'wrap'}}>
      <div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:14,letterSpacing:'.05em',textTransform:'uppercase'}}>Procurement Simulation</div><div style={{fontSize:12,color:COLORS.textMuted,marginTop:5}}>Choose the decision priority, then run the engine against your uploaded data.</div></div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <select value={scenarioKey} onChange={e=>setScenarioKey(e.target.value)} style={{background:COLORS.ink,border:`1px solid ${COLORS.line}`,color:COLORS.textPrimary,borderRadius:6,padding:'10px 12px',fontSize:12}}>{Object.entries(SCENARIOS).map(([key,v])=><option key={key} value={key}>{v.label}</option>)}</select>
        <button disabled={!hasData||running} onClick={onRun} style={{display:'flex',alignItems:'center',gap:8;background:COLORS.indigo,color:'#fff',border:0,borderRadius:6,padding:'10px 16px',fontFamily:"'Oswald',sans-serif",letterSpacing:'.06em',textTransform:'uppercase',cursor:(!hasData||running)?'not-allowed':'pointer',opacity:(!hasData||running)?.55:1}}>{running?<><Loader2 size={15} className="pp-spin"/> Running…</>:<><Play size={15} fill="currentColor"/> Run Simulation</>}</button>
      </div>
    </div>
  </div>;
}

export default function ProcurePulseDashboard(){
  const [clock,setClock]=useState(new Date());
  const [parsed,setParsed]=useState(null);
  const [fileName,setFileName]=useState('');
  const [loading,setLoading]=useState(false);
  const [running,setRunning]=useState(false);
  const [error,setError]=useState('');
  const [scenarioKey,setScenarioKey]=useState('BALANCED');
  const [results,setResults]=useState([]);
  const [selected,setSelected]=useState(null);
  const [simulated,setSimulated]=useState(false);
  useEffect(()=>{const t=setInterval(()=>setClock(new Date()),1000);return()=>clearInterval(t)},[]);

  const tickerItems=useMemo(()=>[
    parsed?`${parsed.items.length} SKUs LOADED FROM ${fileName.toUpperCase()}`:'UPLOAD A WORKBOOK TO ACTIVATE LIVE DEMO',
    simulated?`${results.filter(r=>r.status==='URGENT').length} URGENT RECOMMENDATIONS GENERATED`:'SIMULATION READY',
    parsed?`${parsed.suppliers.length} SUPPLIER OPTIONS DETECTED`:'SUPPLIER OPTIONS WILL BE EVALUATED',
    simulated?`RECOMMENDED PURCHASE R ${formatCompact(results.reduce((s,r)=>s+r.purchaseValue,0))}`:'NO LIVE PURCHASE VALUE YET',
    'PROCUREPULSE V0.1 DEMO ENVIRONMENT',
  ],[parsed,fileName,simulated,results]);

  const handleFile=async(file)=>{setLoading(true);setError('');setSimulated(false);setResults([]);setSelected(null);setFileName(file.name);try{const data=rekeyToItems(await parseWorkbook(file));setParsed(data);}catch(e){console.error(e);setError(e?.message||'Unable to read workbook.');setParsed(null);}finally{setLoading(false)}};
  const handleRun=()=>{if(!parsed)return;setRunning(true);setSelected(null);setTimeout(()=>{const out=runProcurementSimulation({...parsed,scenarioKey});setResults(out);setSimulated(true);setRunning(false);},650)};

  const kpis=useMemo(()=>buildKpis({items:parsed?.items||[],inventory:parsed?.inventory||[],results}),[parsed,results]);
  const summary=[{name:'Urgent',value:results.filter(r=>r.status==='URGENT').length,fill:COLORS.amber},{name:'On-Track',value:results.filter(r=>r.status==='ON-TRACK').length,fill:COLORS.teal},{name:'Excess',value:results.filter(r=>r.status==='EXCESS').length,fill:COLORS.danger}];
  const trend=useMemo(()=>{const byMonth=new Map();(parsed?.demand||[]).forEach(r=>{const d=new Date(r.requiredDate);const m=Number.isNaN(d.getTime())?'Plan':d.toLocaleString('en-ZA',{month:'short'});byMonth.set(m,(byMonth.get(m)||0)+r.quantity)});return [...byMonth.entries()].map(([month,demand])=>({month,demand,supply:0})).slice(0,8)},[parsed]);

  const downloadReport=()=>{const csv=recommendationsToCsv(results);const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`procurepulse-${scenarioKey.toLowerCase()}-recommendations.csv`;a.click();URL.revokeObjectURL(url)};

  return <div style={{fontFamily:"'Inter',sans-serif",background:COLORS.ink,color:COLORS.textPrimary,minHeight:'100vh',width:'100%'}}><link rel="stylesheet" href={FONTS_HREF}/><style>{`.pp-spin{animation:ppspin 1s linear infinite}@keyframes ppspin{to{transform:rotate(360deg)}}button,select,input{font:inherit}`}</style>
    <div style={{background:COLORS.panelRaised,borderBottom:`1px solid ${COLORS.line}`,overflow:'hidden',whiteSpace:'nowrap',padding:'6px 0'}}><div style={{display:'inline-block',fontFamily:"'IBM Plex Mono',monospace",fontSize:11,letterSpacing:'.06em',color:COLORS.textMuted,animation:'pp-ticker 28s linear infinite'}}>{tickerItems.concat(tickerItems).map((t,i)=><span key={i} style={{marginRight:48}}><Circle size={5} color={COLORS.amber} fill={COLORS.amber} style={{marginRight:8,verticalAlign:'middle'}}/>{t}</span>)}</div><style>{`@keyframes pp-ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}`}</style></div>
    <div style={{display:'flex'}}>
      <div style={{width:208,flexShrink:0,borderRight:`1px solid ${COLORS.line}`,padding:'22px 14px',display:'flex',flexDirection:'column',gap:26}}>
        <div style={{display:'flex',alignItems:'center',gap:10,padding:'0 6px'}}><div style={{width:34,height:34,borderRadius:6,border:`2px solid ${COLORS.indigo}`,display:'flex',alignItems:'center',justifyContent:'center',transform:'rotate(-3deg)'}}><span style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:13,color:COLORS.indigo}}>PP</span></div><div><div style={{fontFamily:"'Oswald',sans-serif",fontWeight:600,fontSize:15}}>ProcurePulse</div><div style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:9.5,color:COLORS.amber,letterSpacing:'.1em'}}>LIVE DEMO</div></div></div>
        <div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:'.1em',color:COLORS.textMuted,textTransform:'uppercase',padding:'0 8px 8px'}}>Domains</div><div style={{display:'flex',flexDirection:'column',gap:2}}>{domains.map(d=>{const Icon=d.icon;return <div key={d.name} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 10px',borderRadius:6,background:d.active?COLORS.panelRaised:'transparent',color:d.active?COLORS.textPrimary:COLORS.textMuted,fontSize:13.5}}><Icon size={15} color={d.active?COLORS.indigo:COLORS.textMuted}/><span>{d.name}</span>{d.active&&<ChevronRight size={13} style={{marginLeft:'auto'}}/>}</div>})}</div></div>
        <div style={{marginTop:'auto',padding:'10px 8px',borderTop:`1px solid ${COLORS.line}`}}><div style={{fontSize:11.5,color:COLORS.textMuted,fontFamily:"'IBM Plex Mono',monospace"}}>{clock.toLocaleTimeString('en-ZA',{hour12:false})}</div><div style={{fontSize:10,color:COLORS.textMuted,marginTop:5}}>{simulated?'Simulation complete':'Awaiting workbook'}</div></div>
      </div>
      <div style={{flex:1,minWidth:0,padding:'22px 28px 40px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,gap:16}}><div><h1 style={{fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:600,margin:0}}>Procurement Overview</h1><p style={{fontSize:12.5,color:COLORS.textMuted,margin:'4px 0 0'}}>{fileName?`Dataset: ${fileName}`:'Upload a sample Excel dataset to begin'}{simulated?` · Scenario: ${SCENARIOS[scenarioKey].label}`:''}</p></div><div style={{display:'flex',alignItems:'center',gap:14}}><div style={{display:'flex',alignItems:'center',gap:8,background:COLORS.panel,border:`1px solid ${COLORS.line}`,borderRadius:6,padding:'7px 12px',color:COLORS.textMuted,fontSize:13}}><Search size={14}/><span>Search results…</span></div><Bell size={17} color={COLORS.textMuted}/><div style={{width:30,height:30,borderRadius:'50%',background:COLORS.indigo,display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600}}>PP</div></div></div>
        <UploadPanel onFile={handleFile} fileName={fileName} loading={loading} error={error} warnings={parsed?.warnings}/>
        <SimulationPanel scenarioKey={scenarioKey} setScenarioKey={setScenarioKey} onRun={handleRun} running={running} hasData={!!parsed}/>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:14,marginBottom:22}}>{kpis.map((k,i)=><KpiCard key={i} k={k}/>)}</div>
        <div style={{display:'grid',gridTemplateColumns:'1.6fr 1fr',gap:14,marginBottom:22}}>
          <div style={{background:COLORS.panel,border:`1px solid ${COLORS.line}`,borderRadius:8,padding:'18px 18px 8px'}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}><span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:'.04em',textTransform:'uppercase',color:COLORS.textMuted}}>Demand Trend From Upload</span><TrendingUp size={15} color={COLORS.indigo}/></div>{trend.length?<ResponsiveContainer width="100%" height={220}><AreaChart data={trend} margin={{top:10,right:8,left:-18,bottom:0}}><CartesianGrid stroke={COLORS.line} strokeDasharray="2 4" vertical={false}/><XAxis dataKey="month" tick={{fill:COLORS.textMuted,fontSize:11}} axisLine={{stroke:COLORS.line}} tickLine={false}/><YAxis tick={{fill:COLORS.textMuted,fontSize:11}} axisLine={false} tickLine={false} width={40}/><Tooltip contentStyle={{background:COLORS.panelRaised,border:`1px solid ${COLORS.line}`,borderRadius:6,fontSize:12}}/><Area type="monotone" dataKey="demand" stroke={COLORS.indigo} fill="rgba(91,124,250,.22)" strokeWidth={2} name="Demand"/></AreaChart></ResponsiveContainer>:<div style={{height:220,display:'flex',alignItems:'center',justifyContent:'center',color:COLORS.textMuted,fontSize:12}}>Demand dates will appear here when supplied in the workbook.</div>}</div>
          <div style={{background:COLORS.panel,border:`1px solid ${COLORS.line}`,borderRadius:8,padding:18}}><span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:'.04em',textTransform:'uppercase',color:COLORS.textMuted}}>Recommendation Summary</span>{simulated?<ResponsiveContainer width="100%" height={150}><BarChart data={summary} margin={{top:16,right:8,left:-18,bottom:0}}><CartesianGrid stroke={COLORS.line} strokeDasharray="2 4" vertical={false}/><XAxis dataKey="name" tick={{fill:COLORS.textMuted,fontSize:11}} axisLine={{stroke:COLORS.line}} tickLine={false}/><YAxis tick={{fill:COLORS.textMuted,fontSize:11}} axisLine={false} tickLine={false} width={30}/><Tooltip contentStyle={{background:COLORS.panelRaised,border:`1px solid ${COLORS.line}`,borderRadius:6,fontSize:12}}/><Bar dataKey="value" radius={[4,4,0,0]}>{summary.map((c,i)=><Cell key={i} fill={c.fill}/>)}</Bar></BarChart></ResponsiveContainer>:<div style={{height:150,display:'flex',alignItems:'center',justifyContent:'center',textAlign:'center',color:COLORS.textMuted,fontSize:12}}>Run the simulation to generate recommendation states.</div>}<p style={{fontSize:12,color:COLORS.textMuted,margin:'6px 0 0',lineHeight:1.5}}>{simulated?`${results.length} item/location combinations assessed under the ${SCENARIOS[scenarioKey].label.toLowerCase()} strategy.`:'No simulation has been run yet.'}</p></div>
        </div>
        <div style={{background:COLORS.panel,border:`1px solid ${COLORS.line}`,borderRadius:8,overflow:'hidden'}}>
          <div style={{padding:'16px 18px 10px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><div><span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:'.04em',textTransform:'uppercase',color:COLORS.textMuted}}>Procurement Recommendations</span><div style={{fontSize:11,color:COLORS.textMuted,marginTop:4}}>{results.length?`${results.length} rows generated from uploaded data`:'Results will appear here after simulation'}</div></div><button disabled={!results.length} onClick={downloadReport} style={{display:'flex',alignItems:'center',gap:7,background:COLORS.panelRaised,color:COLORS.textPrimary,border:`1px solid ${COLORS.line}`,borderRadius:6,padding:'8px 11px',cursor:results.length?'pointer':'not-allowed',opacity:results.length?1:.45,fontSize:11.5}}><Download size={14}/> Export CSV</button></div>
          {results.length?<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13,minWidth:1050}}><thead><tr style={{borderTop:`1px solid ${COLORS.line}`,borderBottom:`1px solid ${COLORS.line}`}}>{['SKU','Description','Location','Supplier','On Hand','Demand','Lead Time','Status','Recommended Qty','Purchase Value'].map(h=><th key={h} style={{textAlign:['On Hand','Demand','Lead Time','Recommended Qty','Purchase Value'].includes(h)?'right':'left',padding:'9px 18px',fontFamily:"'Oswald',sans-serif",fontWeight:500,fontSize:11,letterSpacing:'.06em',textTransform:'uppercase',color:COLORS.textMuted}}>{h}</th>)}</tr></thead><tbody>{results.map(r=><React.Fragment key={r.id}><tr onClick={()=>setSelected(selected?.id===r.id?null:r)} style={{borderBottom:`1px solid ${COLORS.line}`,cursor:'pointer',background:selected?.id===r.id?COLORS.panelRaised:'transparent'}}><td style={{padding:'10px 18px',fontFamily:"'IBM Plex Mono',monospace"}}>{r.sku}</td><td style={{padding:'10px 18px'}}>{r.desc}</td><td style={{padding:'10px 18px',color:COLORS.textMuted}}>{r.location}</td><td style={{padding:'10px 18px',color:COLORS.textMuted}}>{r.supplier}</td><td style={{padding:'10px 18px',textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",color:COLORS.textMuted}}>{r.onHand.toLocaleString()}</td><td style={{padding:'10px 18px',textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",color:COLORS.textMuted}}>{r.demand.toLocaleString()}</td><td style={{padding:'10px 18px',textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",color:COLORS.textMuted}}>{r.leadTime?r.leadTime+'d':'—'}</td><td style={{padding:'10px 18px'}}><Stamp status={r.status}/></td><td style={{padding:'10px 18px',textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",fontWeight:600,color:r.qty>0?COLORS.textPrimary:COLORS.textMuted}}>{r.qty?r.qty.toLocaleString():'—'}</td><td style={{padding:'10px 18px',textAlign:'right',fontFamily:"'IBM Plex Mono',monospace",color:COLORS.textMuted}}>{r.purchaseValue?`R ${r.purchaseValue.toLocaleString('en-ZA',{maximumFractionDigits:0})}`:'—'}</td></tr>{selected?.id===r.id&&<tr><td colSpan="10" style={{padding:'14px 18px',background:COLORS.ink,borderBottom:`1px solid ${COLORS.line}`}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}><div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:COLORS.textMuted,textTransform:'uppercase',letterSpacing:'.06em'}}>Recommendation rationale</div><div style={{fontSize:12.5,lineHeight:1.6,marginTop:6}}>{r.reason}</div></div><div><div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,color:COLORS.textMuted,textTransform:'uppercase',letterSpacing:'.06em'}}>Decision data</div><div style={{fontSize:12,color:COLORS.textMuted,marginTop:6,display:'flex',gap:20,flexWrap:'wrap'}}><span>Safety stock: <b style={{color:COLORS.textPrimary}}>{r.safetyStock.toLocaleString()}</b></span><span>Unit price: <b style={{color:COLORS.textPrimary}}>R {r.unitPrice.toLocaleString('en-ZA')}</b></span><span>Buyer: <b style={{color:COLORS.textPrimary}}>{r.buyer}</b></span></div></div></div></td></tr>}</React.Fragment>)}</tbody></table></div>:<div style={{padding:40,textAlign:'center',color:COLORS.textMuted}}><FileSpreadsheet size={26} style={{marginBottom:10}}/><div style={{fontSize:13}}>{parsed?'Your workbook is loaded. Run the simulation above.':'Upload your sample Excel workbook to populate the demo.'}</div></div>}
        </div>
        <div style={{marginTop:14,fontSize:11,color:COLORS.textMuted,display:'flex',gap:12,alignItems:'center'}}><Info size={13}/><span>Demo processing happens in your browser. Uploaded files are not sent to a ProcurePulse server in this V0.1 demo.</span></div>
        <div style={{marginTop:10,fontSize:11,color:COLORS.textMuted}}>ProcurePulse V0.1 · {clock.toLocaleDateString('en-ZA')}</div>
      </div>
    </div>
  </div>;
}
