/* =============================================
   PULLMAN DASHBOARD — script.js (Vercel)
   Llama a /api/report (serverless function).
   El token nunca está en este archivo.
   ============================================= */

const MAX_DAYS = 10;
const COL = {
  USUARIO:0,SUCURSAL:1,TIPO:2,DESCRIPCION:3,
  TARIFA:4,DESCUENTO:5,CUPON:6,MONTO_NETO:7,
  TRANSACC:8,DEVOLUCION:9,FECHA_CREA:10,FECHA_MOD:11,
  ORIGEN:12,DESTINO:13,SERVICIO:14,FECHA_VIAJE:15,
  FECHA_EMBAR:16,PASAJERO:17,TIPO_DOC:18,N_DOC:19,
};
const PORTAL_COLORS = ['#f5a623','#4d8ef5','#2ecc87','#9b6dff','#e8471e','#00d4ff','#ff6b6b','#51cf66','#ffd43b','#cc5de8','#339af0','#ff8787'];

let parsedData=null, currentView='resumen', allRows=[], sortCol=null, sortDir=1;
const _pidx={};
const $=id=>document.getElementById(id);

// ── INIT ──────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  const today=new Date(), fmt=d=>d.toISOString().split('T')[0];
  $('toDate').value=$('fromDate').value=fmt(today);
  $('fromDate').max=$('toDate').max=fmt(today);

  document.querySelectorAll('.nav-link').forEach(l=>l.addEventListener('click',()=>switchView(l.dataset.view)));
  $('fetchBtn').addEventListener('click', doFetch);
  $('fromDate').addEventListener('change', validateDates);
  $('toDate').addEventListener('change', validateDates);
  $('fileInput').addEventListener('change', e=>loadFile(e.target.files[0]));
  $('exportBtn').addEventListener('click', doExportCSV);
  $('tableSearch').addEventListener('input', applyFilters);
  $('filterPortal').addEventListener('change', applyFilters);
  $('filterDevuelto').addEventListener('change', applyFilters);
});

// ── DATE VALIDATION ───────────────────────────
function validateDates(){
  const from=$('fromDate').value, to=$('toDate').value;
  if(!from||!to){hideErr();return true;}
  const fD=new Date(from), tD=new Date(to);
  if(tD<fD){ $('toDate').value=from; hideErr(); return true; }
  const diff=(tD-fD)/(864e5);
  if(diff>=MAX_DAYS){
    const cap=new Date(fD); cap.setDate(cap.getDate()+MAX_DAYS-1);
    $('toDate').value=cap.toISOString().split('T')[0];
    showErr(`Rango ajustado a ${MAX_DAYS} días máximo.`);
    setTimeout(hideErr,3000); return true;
  }
  hideErr(); return true;
}
function showErr(m){const e=$('dateError');e.textContent=m;e.style.display='block';}
function hideErr(){$('dateError').style.display='none';}

// ── FETCH via /api/report ─────────────────────
async function doFetch(){
  if(!validateDates()) return;
  const from=$('fromDate').value, to=$('toDate').value;
  if(!from||!to){setStatus('Selecciona fechas.','error');return;}

  const qs=new URLSearchParams({
    from_date: formatDateForApi(from),
    to_date:   formatDateForApi(to),
  });

  showLoading(true,'Consultando API...');
  $('tokenExpiredBanner').style.display='none';

  try {
    const res = await fetch(`/api/report?${qs}`);
    const data = await res.json();

    if(res.status===401){
      showLoading(false);
      $('tokenExpiredBanner').style.display='flex';
      setStatus('Token expirado.','error');
      return;
    }
    if(!res.ok){
      showLoading(false);
      setStatus((data.error||`Error ${res.status}`),'error');
      return;
    }
    $('dateRangeLabel').textContent=`${formatDateLabel(from)} → ${formatDateLabel(to)}`;
    processAndRender(data);
    setStatus('✓ Datos cargados','success');

  } catch(err){
    showLoading(false);
    setStatus('Error de conexión: '+err.message,'error');
  }
}

// ── FILE LOAD ─────────────────────────────────
function loadFile(file){
  if(!file) return;
  showLoading(true,'Leyendo archivo...');
  const r=new FileReader();
  r.onload=e=>setTimeout(()=>{
    try{ processAndRender(JSON.parse(e.target.result)); setStatus(`✓ ${file.name}`,'success'); }
    catch(e){ showLoading(false); setStatus('JSON inválido','error'); }
  },50);
  r.readAsText(file,'UTF-8');
}

// ── PROCESS ───────────────────────────────────
function processAndRender(data){
  showLoading(true,'Procesando...');
  setTimeout(()=>{
    try{
      parsedData=extractKonnectData(data);
      allRows=parsedData.rows;
      showLoading(false);
      $('emptyState').style.display='none';
      $('dashboardContent').style.display='flex';
      $('exportBtn').style.display='';
      $('lastUpdated').textContent='Act. '+new Date().toLocaleTimeString('es');
      renderKPIs(parsedData); renderBarChart(parsedData); renderDonut(parsedData);
      renderPortalCards(parsedData); buildDetailTable(); populatePortalFilter(parsedData.portales);
      switchView(currentView);
    }catch(err){showLoading(false);setStatus('Error: '+err.message,'error');console.error(err);}
  },50);
}

// ── EXTRACT DATA ──────────────────────────────
function extractKonnectData(data){
  const body=data?.data?.data_body;
  if(!body) throw new Error('Estructura JSON inesperada.');
  const otaBooked=body.ota_booked||{}, mainData=Array.isArray(body.main)?body.main:[];
  const rows=[], pm={};
  const addP=n=>{if(!pm[n])pm[n]={name:n,count:0,devueltos:0,amount:0,devolucionTotal:0};};

  for(const[rn,pd] of Object.entries(otaBooked)){
    const pn=rn.trim()||'Sin nombre'; addP(pn);
    for(const row of(Array.isArray(pd?.data)?pd.data:[])){
      if(!Array.isArray(row))continue;
      const m=parseAmount(row[COL.MONTO_NETO]),dv=parseAmount(row[COL.DEVOLUCION]);
      const desc=String(row[COL.DESCRIPCION]||'');
      const isDev=desc.toUpperCase().includes('DEVUELTO')||dv>0;
      rows.push({portal:pn,descripcion:desc.trim(),tarifa:parseAmount(row[COL.TARIFA]),
        montoNeto:m,medioPago:String(row[COL.TRANSACC]||'').trim(),devolucion:dv,
        fechaCreado:String(row[COL.FECHA_CREA]||'').trim(),fechaMod:String(row[COL.FECHA_MOD]||'').trim(),
        origen:String(row[COL.ORIGEN]||'').trim(),destino:String(row[COL.DESTINO]||'').trim(),
        servicio:String(row[COL.SERVICIO]||'').trim(),fechaViaje:String(row[COL.FECHA_VIAJE]||'').trim(),
        pasajero:String(row[COL.PASAJERO]||'').trim(),nDoc:String(row[COL.N_DOC]||'').trim(),esDevuelto:isDev});
      pm[pn].count++; pm[pn].amount+=m; pm[pn].devolucionTotal+=dv; if(isDev)pm[pn].devueltos++;
    }
  }
  for(const row of mainData){
    if(!Array.isArray(row))continue;
    const pn='Sucursal (directo)',m=parseAmount(row[6]),dv=parseAmount(row[9]); addP(pn);
    rows.push({portal:pn,descripcion:String(row[3]||'').trim(),tarifa:parseAmount(row[4]),
      montoNeto:m,medioPago:String(row[8]||'').trim(),devolucion:dv,
      fechaCreado:String(row[11]||'').trim(),fechaMod:String(row[12]||'').trim(),
      origen:String(row[13]||'').trim(),destino:String(row[14]||'').trim(),
      servicio:String(row[16]||'').trim(),fechaViaje:String(row[17]||'').trim(),
      pasajero:String(row[19]||'').trim(),nDoc:String(row[22]||'').trim(),esDevuelto:dv>0});
    pm[pn].count++; pm[pn].amount+=m; pm[pn].devolucionTotal+=dv; if(dv>0)pm[pn].devueltos++;
  }
  const portales=Object.values(pm).sort((a,b)=>b.amount-a.amount);
  const tot={amount:portales.reduce((s,p)=>s+p.amount,0),count:portales.reduce((s,p)=>s+p.count,0),
    devolucion:portales.reduce((s,p)=>s+p.devolucionTotal,0),devueltos:portales.reduce((s,p)=>s+p.devueltos,0)};
  return{portales,rows,totals:tot};
}

// ── KPIs ──────────────────────────────────────
function renderKPIs({portales,totals}){
  const neto=totals.amount-totals.devolucion;
  const kpis=[
    {label:'Monto Neto Total',    value:fmtMoney(totals.amount), sub:'bruto vendido',           color:'#f5a623'},
    {label:'Neto c/Devoluciones', value:fmtMoney(neto),          sub:`-${fmtMoney(totals.devolucion)} devuelto`, color:'#2ecc87'},
    {label:'Transacciones',       value:fmtNum(totals.count),    sub:'tickets emitidos',         color:'#4d8ef5'},
    {label:'Devueltos',           value:fmtNum(totals.devueltos),sub:`${totals.count>0?(totals.devueltos/totals.count*100).toFixed(1):0}% del total`,color:'#e8471e'},
    {label:'Portales',            value:portales.length,         sub:'canales activos',           color:'#9b6dff'},
    {label:'Ticket Promedio',     value:totals.count>0?fmtMoney(totals.amount/totals.count):'$0',sub:'por transacción',color:'#00d4ff'},
  ];
  $('kpiGrid').innerHTML=kpis.map(k=>`<div class="kpi-card" style="--kpi-color:${k.color}">
    <div class="kpi-label">${k.label}</div>
    <div class="kpi-value ${String(k.value).length>9?'big':''}">${k.value}</div>
    <div class="kpi-sub">${k.sub}</div></div>`).join('');
}

// ── BAR CHART ─────────────────────────────────
function renderBarChart({portales}){
  const c=$('barChart');
  if(!portales.length){c.innerHTML='<p class="no-data">Sin datos</p>';return;}
  const max=Math.max(...portales.map(p=>p.amount),1);
  c.innerHTML=portales.slice(0,12).map((p,i)=>`<div class="bar-row">
    <div class="bar-name" title="${esc(p.name)}">${esc(short(p.name,16))}</div>
    <div class="bar-track"><div class="bar-fill" style="width:${(p.amount/max*100).toFixed(1)}%;background:${PORTAL_COLORS[i%12]}"></div></div>
    <div class="bar-val"><span>${fmtMoney(p.amount)}</span><span class="bar-count">${fmtNum(p.count)} tkt</span></div>
  </div>`).join('');
}

// ── DONUT ─────────────────────────────────────
function renderDonut({portales}){
  const w=$('donutChart');
  if(!portales.length){w.innerHTML='<p class="no-data">Sin datos</p>';return;}
  const top=portales.slice(0,7),total=top.reduce((s,p)=>s+p.amount,0)||1;
  const r=60,cx=80,cy=80,st=22,circ=2*Math.PI*r;
  let off=0;
  const segs=top.map((p,i)=>{const d=(p.amount/total)*circ,s={d,off,c:PORTAL_COLORS[i%12]};off+=d;return s;});
  w.innerHTML=`<svg width="160" height="160" viewBox="0 0 160 160" class="donut-svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg3)" stroke-width="${st}"/>
    ${segs.map(s=>`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.c}" stroke-width="${st}"
      stroke-dasharray="${s.d} ${circ-s.d}" stroke-dashoffset="${-(s.off-circ*.25)}" transform="rotate(-90 ${cx} ${cy})"/>`).join('')}
    <text x="${cx}" y="${cy-6}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="9" fill="var(--muted)">${top.length} portales</text>
    <text x="${cx}" y="${cy+8}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="9" fill="var(--muted)">${fmtNum(parsedData?.totals?.count||0)} tkt</text>
  </svg>
  <div class="donut-legend">${top.map((p,i)=>`<div class="legend-row">
    <span class="legend-dot" style="background:${PORTAL_COLORS[i%12]}"></span>
    <span class="legend-name" title="${esc(p.name)}">${esc(short(p.name,14))}</span>
    <span class="legend-pct">${(p.amount/total*100).toFixed(1)}%</span>
  </div>`).join('')}</div>`;
}

// ── PORTAL CARDS ──────────────────────────────
function renderPortalCards({portales,totals}){
  const maxA=Math.max(...portales.map(p=>p.amount),1);
  $('portalCards').innerHTML=portales.map((p,i)=>{
    const c=PORTAL_COLORS[i%12],share=totals.amount>0?(p.amount/totals.amount*100).toFixed(1):0;
    return `<div class="portal-card">
      <div class="portal-name"><span class="portal-badge" style="background:${c}"></span>${esc(p.name)}</div>
      <div class="portal-stats">
        <div><div class="pstat-label">Monto Neto</div><div class="pstat-value" style="color:${c}">${fmtMoney(p.amount)}</div></div>
        <div><div class="pstat-label">Tickets</div><div class="pstat-value">${fmtNum(p.count)}</div></div>
        <div><div class="pstat-label">Devoluciones</div><div class="pstat-value" style="color:var(--red)">${fmtMoney(p.devolucionTotal)}</div></div>
        <div><div class="pstat-label">Neto Real</div><div class="pstat-value" style="color:var(--green)">${fmtMoney(p.amount-p.devolucionTotal)}</div></div>
        <div><div class="pstat-label">% del Total</div><div class="pstat-value" style="font-size:14px">${share}%</div></div>
        <div><div class="pstat-label">Devueltos</div><div class="pstat-value" style="font-size:14px;color:var(--red)">${fmtNum(p.devueltos)}</div></div>
      </div>
      <div class="portal-bar"><div class="portal-bar-fill" style="width:${(p.amount/maxA*100).toFixed(1)}%;background:${c}"></div></div>
    </div>`;
  }).join('');
}

// ── TABLE ─────────────────────────────────────
function buildDetailTable(){
  $('tableHead').innerHTML=`<tr>
    <th data-col="portal">Portal</th>
    <th data-col="descripcion">Código / Desc</th>
    <th data-col="pasajero">Pasajero</th>
    <th data-col="origen">Origen</th>
    <th data-col="destino">Destino</th>
    <th data-col="fechaViaje">F. Viaje</th>
    <th data-col="fechaCreado">F. Creado</th>
    <th data-col="montoNeto" class="align-right">Monto</th>
    <th data-col="devolucion" class="align-right">Devolución</th>
    <th data-col="medioPago">Medio Pago</th>
  </tr>`;
  document.querySelectorAll('#tableHead th').forEach(th=>th.addEventListener('click',()=>{
    sortDir=sortCol===th.dataset.col?sortDir*-1:1; sortCol=th.dataset.col; applyFilters();
  }));
}
function populatePortalFilter(portales){
  $('filterPortal').innerHTML='<option value="">Todos los portales</option>'+
    portales.map(p=>`<option value="${esc(p.name)}">${esc(p.name)} (${fmtNum(p.count)})</option>`).join('');
}
function applyFilters(){
  const s=$('tableSearch').value.trim().toLowerCase(),fp=$('filterPortal').value,fd=$('filterDevuelto').value;
  let f=allRows.filter(r=>{
    if(fp&&r.portal!==fp)return false;
    if(fd==='si'&&!r.esDevuelto)return false;
    if(fd==='no'&&r.esDevuelto)return false;
    if(s&&![r.pasajero,r.origen,r.destino,r.descripcion,r.nDoc,r.portal].join(' ').toLowerCase().includes(s))return false;
    return true;
  });
  if(sortCol)f.sort((a,b)=>{const va=a[sortCol]??'',vb=b[sortCol]??'';return typeof va==='number'?sortDir*(va-vb):sortDir*String(va).localeCompare(String(vb),'es');});
  $('rowCount').textContent=`${fmtNum(f.length)} de ${fmtNum(allRows.length)} filas`;
  $('tableBody').innerHTML=f.map(r=>{
    const ci=pidx(r.portal)%12;
    return `<tr class="${r.esDevuelto?'row-devuelto':''}">
      <td class="text-field portal-cell"><span class="portal-dot" style="background:${PORTAL_COLORS[ci]}"></span>${esc(short(r.portal,14))}</td>
      <td class="text-field mono-sm" title="${esc(r.descripcion)}">${esc(short(r.descripcion,22))}</td>
      <td class="text-field">${esc(r.pasajero)}</td>
      <td class="text-field">${esc(r.origen)}</td>
      <td class="text-field">${esc(r.destino)}</td>
      <td>${esc(r.fechaViaje)}</td>
      <td class="muted-cell">${esc(r.fechaCreado)}</td>
      <td class="amount align-right">${fmtMoney(r.montoNeto)}</td>
      <td class="align-right ${r.devolucion>0?'devuelto-cell':'muted-cell'}">${r.devolucion>0?fmtMoney(r.devolucion):'—'}</td>
      <td class="text-field">${esc(r.medioPago)}</td>
    </tr>`;
  }).join('');
}

// ── EXPORT ────────────────────────────────────
function doExportCSV(){
  if(!parsedData)return;
  const cols=['portal','descripcion','pasajero','origen','destino','fechaViaje','fechaCreado','montoNeto','devolucion','medioPago'];
  const hdr=['Portal','Descripción','Pasajero','Origen','Destino','Fecha Viaje','Fecha Creado','Monto Neto','Devolución','Medio Pago'];
  const csv=[hdr,...allRows.map(r=>cols.map(c=>String(r[c]??'').replace(/"/g,'""')))].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
  a.download=`cobranza_${$('fromDate').value}.csv`; a.click();
}

// ── NAV ───────────────────────────────────────
function switchView(v){
  currentView=v;
  document.querySelectorAll('.nav-link').forEach(l=>l.classList.toggle('active',l.dataset.view===v));
  document.querySelectorAll('.view').forEach(el=>el.style.display='none');
  const el=$(`view-${v}`); if(el)el.style.display='';
  $('viewTitle').textContent={resumen:'Resumen General',portales:'Ventas por Portal',detalle:'Detalle de Transacciones'}[v]||v;
  if(v==='detalle')applyFilters();
}

// ── UTILS ─────────────────────────────────────
function parseAmount(v){if(!v&&v!==0)return 0;if(typeof v==='number')return v;return parseFloat(String(v).replace(/[$.\s]/g,'').replace(',','.'))||0;}
function fmtMoney(v){const n=Math.abs(parseFloat(v)||0),s=v<0?'-':'';if(n>=1e6)return s+'$'+(n/1e6).toFixed(2)+'M';if(n>=1e3)return s+'$'+(n/1e3).toFixed(0)+'K';return s+'$'+n.toLocaleString('es-CL',{maximumFractionDigits:0});}
function fmtNum(v){return parseInt(v||0).toLocaleString('es-CL');}
function short(s,m){s=String(s||'');return s.length>m?s.slice(0,m)+'…':s;}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function formatDateForApi(iso){const[y,m,d]=iso.split('-');return`${d}/${m}/${y}`;}
function formatDateLabel(iso){const[y,m,d]=iso.split('-');return`${d}/${m}/${y}`;}
function setStatus(m,t){$('statusMsg').textContent=m;$('statusMsg').className='status-msg'+(t?' '+t:'');}
function showLoading(s,m){$('loadingState').style.display=s?'flex':'none';if(m)$('loadingMsg').textContent=m;if(s){$('emptyState').style.display='none';$('dashboardContent').style.display='none';}}
function pidx(n){if(_pidx[n]===undefined)_pidx[n]=Object.keys(_pidx).length;return _pidx[n];}