import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type AnyRow = Record<string, any>;

function isScreenCell(model: AnyRow, row: number, col: number) {
  if (!model?.HasWelcomeScreen) return false;
  return row >= model.WelcomeScreenRowNumber &&
    row < model.WelcomeScreenRowNumber + model.WelcomeScreenRowSize &&
    col >= model.WelcomeScreenColumnNumber &&
    col < model.WelcomeScreenColumnNumber + model.WelcomeScreenColumnSize;
}
function slotNumber(model: AnyRow, row: number, col: number) { return row * model.ColumnCount + col + 1; }

function WallPreview({ model, activeSlot, completedSlots = [] }: { model: AnyRow | null; activeSlot?: number; completedSlots?: number[] }) {
  if (!model) return <div className="emptyState">בחר מודל להצגת הקיר</div>;
  const cells = [];
  for (let row = 0; row < model.RowCount; row++) {
    for (let col = 0; col < model.ColumnCount; col++) {
      const num = slotNumber(model, row, col);
      const screen = isScreenCell(model, row, col);
      cells.push(<div key={`${row}-${col}`} className={`wallCell ${screen ? 'screenCell' : ''} ${activeSlot === num ? 'activeCell' : ''} ${completedSlots.includes(num) ? 'doneCell' : ''}`} style={{ gridColumn: col + 1, gridRow: row + 1, direction: 'ltr' }}>{screen ? 'מסך כניסה' : <><strong>{num}</strong><span>{completedSlots.includes(num) ? 'בוצע' : activeSlot === num ? 'נבדק כעת' : 'ממתין'}</span></>}</div>);
    }
  }
  return <div className="wallShell" style={{ direction: 'ltr', gridTemplateColumns: `repeat(${model.ColumnCount}, 92px)`, gridTemplateRows: `repeat(${model.RowCount}, 104px)` }}>{cells}</div>;
}

function Home({ setTab }: { setTab: (t: string) => void }) {
  return <section className="card hero"><h2>בחר פעולה</h2><p>האפליקציה מחולקת לצד אפליקציה וצד Mock Cloud מקומי. כל הנתונים נשמרים ב־data/local-cloud-db.json.</p><div className="actionGrid"><button onClick={() => setTab('createWall')}>הקמת קיר טעינה</button><button onClick={() => setTab('configWall')}>קנפוג קיר טעינה</button><button onClick={() => setTab('createStation')}>הקמת עמדת כניסה</button><button onClick={() => setTab('db')}>צפייה ב־DB</button></div></section>;
}

function CreateWall() {
  const [models, setModels] = useState<AnyRow[]>([]); const [serial, setSerial] = useState(''); const [modelId, setModelId] = useState(''); const [message, setMessage] = useState('');
  const model = models.find(m => String(m.ChargingWallModelId) === modelId) || models[0] || null;
  useEffect(() => { window.cloudApi.getWallModels().then(setModels); }, []);
  useEffect(() => { if (!modelId && models[0]) setModelId(String(models[0].ChargingWallModelId)); }, [models]);
  async function submit() { if (!serial.trim() || !modelId) return setMessage('יש להזין סיריאלי ולבחור מודל.'); const row = await window.cloudApi.createWall({ SerialNumber: serial.trim(), ChargingWallModelId: Number(modelId) }); setMessage(`קיר נוצר בהצלחה. ChargingWallId: ${row.ChargingWallId}`); setSerial(''); }
  return <section className="layoutTwo"><div className="card"><h2>הקמת קיר טעינה</h2><label>Serial Number</label><input value={serial} onChange={e => setSerial(e.target.value)} placeholder="סרוק או הזן סיריאלי" /><label>מודל קיר</label><select value={modelId} onChange={e => setModelId(e.target.value)}>{models.map(m => <option key={m.ChargingWallModelId} value={m.ChargingWallModelId}>{m.Model} - {m.Description}</option>)}</select><button onClick={submit}>שמור קיר בענן מקומי</button>{message && <div className="notice">{message}</div>}</div><div className="card"><h2>תצוגת מודל</h2><WallPreview model={model} /></div></section>;
}

function ConfigWall() {
  const [walls, setWalls] = useState<AnyRow[]>([]); const [selectedId, setSelectedId] = useState(''); const [details, setDetails] = useState<any>(null); const [alloc, setAlloc] = useState<AnyRow[]>([]); const [welcomeSerial, setWelcomeSerial] = useState(''); const [currentIndex, setCurrentIndex] = useState(0); const [completed, setCompleted] = useState<number[]>([]); const [message, setMessage] = useState('');
  async function load() { setWalls(await window.cloudApi.getUnassignedWalls()); }
  useEffect(() => { load(); }, []);
  async function choose(id: string) { setSelectedId(id); setMessage(''); setCompleted([]); setCurrentIndex(0); if (!id) { setDetails(null); setAlloc([]); return; } const d = await window.cloudApi.getWallDetails(Number(id)); setDetails(d); setAlloc(await window.cloudApi.allocateSlotNfcSerials(Number(id))); }
  async function mockWriteNfc(serial: string) { console.log('TODO write NFC', serial); return true; }
  async function mockReadAndVerifyNfc(serial: string) { console.log('TODO read NFC', serial); return true; }
  async function mockCheckCharging() { console.log('TODO check charging'); return true; }
  async function testCurrentSlot() { const item = alloc[currentIndex]; if (!item) return; const ok = await mockWriteNfc(item.NFCCode) && await mockReadAndVerifyNfc(item.NFCCode) && await mockCheckCharging(); if (ok) { setCompleted(prev => [...prev, item.SlotNumber]); setCurrentIndex(prev => prev + 1); } }
  async function save() { if (!selectedId) return; const res = await window.cloudApi.saveWallConfiguration({ ChargingWallId: Number(selectedId), WelcomeScreenSerialNumber: welcomeSerial.trim() || null, Slots: alloc }); setMessage(`נשמר בהצלחה. נשמרו ${res.SlotCount} תאים.`); await load(); }
  const active = alloc[currentIndex]?.SlotNumber;
  return <section className="layoutTwo wideLeft"><div className="card"><h2>קנפוג קיר טעינה</h2><label>בחר קיר לא משויך</label><select value={selectedId} onChange={e => choose(e.target.value)}><option value="">בחר קיר</option>{walls.map(w => <option key={w.ChargingWallId} value={w.ChargingWallId}>{w.SerialNumber} | {w.ModelInfo?.Model}</option>)}</select>{details?.model?.HasWelcomeScreen && <><label>Serial Number למסך הכניסה</label><input value={welcomeSerial} onChange={e => setWelcomeSerial(e.target.value)} placeholder="סרוק מסך כניסה" /></>}<div className="progressBox">{alloc.length ? `${completed.length}/${alloc.length} תאים נבדקו` : 'אין תאים לבדיקה'}</div><button onClick={testCurrentSlot} disabled={!alloc[currentIndex]}>בדוק תא נוכחי</button><button className="secondary" onClick={save} disabled={!alloc.length || completed.length !== alloc.length}>שליחה ושמירה ב־DB</button>{message && <div className="notice">{message}</div>}</div><div className="card"><h2>תצוגת קיר</h2><p className="muted">{active ? `הכנס יחידה לתא ${active}` : 'אין תא פעיל'}</p><WallPreview model={details?.model || null} activeSlot={active} completedSlots={completed} /></div></section>;
}

function CreateStation() {
  const [customers, setCustomers] = useState<AnyRow[]>([]); const [stores, setStores] = useState<AnyRow[]>([]); const [customerId, setCustomerId] = useState(''); const [storeId, setStoreId] = useState(''); const [walls, setWalls] = useState<AnyRow[]>([]); const [selectedWall, setSelectedWall] = useState(''); const [stationWalls, setStationWalls] = useState<AnyRow[]>([]); const [message, setMessage] = useState('');
  useEffect(() => { window.cloudApi.getCustomers().then(setCustomers); window.cloudApi.getUnassignedWalls().then(setWalls); }, []);
  useEffect(() => { if (customerId) window.cloudApi.getStoresByCustomer(Number(customerId)).then((s: AnyRow[]) => { setStores(s); setStoreId(''); }); }, [customerId]);
  function addWall() { const wall = walls.find(w => String(w.ChargingWallId) === selectedWall); if (!wall || stationWalls.some(w => w.ChargingWallId === wall.ChargingWallId)) return; setStationWalls(prev => [...prev, { ...wall, WelcomeScreenSerialNumber: '' }]); }
  async function submit() { if (!storeId || !stationWalls.length) return setMessage('יש לבחור סניף ולהוסיף לפחות קיר אחד.'); const station = await window.cloudApi.createCheckInStation({ StoreId: Number(storeId), Walls: stationWalls.map(w => ({ ChargingWallId: w.ChargingWallId, WelcomeScreenSerialNumber: w.WelcomeScreenSerialNumber || null })) }); setMessage(`עמדת כניסה נוצרה. CheckInStationId: ${station.CheckInStationId}`); setStationWalls([]); setWalls(await window.cloudApi.getUnassignedWalls()); }
  return <section className="layoutTwo"><div className="card"><h2>הקמת עמדת כניסה</h2><label>ריטיילר</label><select value={customerId} onChange={e => setCustomerId(e.target.value)}><option value="">בחר ריטיילר</option>{customers.map(c => <option key={c.CustomerId} value={c.CustomerId}>{c.CustomerName || c.CustomerId}</option>)}</select><label>סניף</label><select value={storeId} onChange={e => setStoreId(e.target.value)}><option value="">בחר סניף</option>{stores.map(s => <option key={s.StoreId} value={s.StoreId}>{s.StoreName || s.StoreId}</option>)}</select><label>הוסף קיר לפי סדר משמאל לימין</label><div className="inline"><select value={selectedWall} onChange={e => setSelectedWall(e.target.value)}><option value="">בחר קיר</option>{walls.map(w => <option key={w.ChargingWallId} value={w.ChargingWallId}>{w.SerialNumber} | {w.ModelInfo?.Model}</option>)}</select><button onClick={addWall}>הוסף</button></div><button className="secondary" onClick={submit}>שליחה ושמירה</button>{message && <div className="notice">{message}</div>}</div><div className="card"><h2>קירות בעמדה</h2><div className="stationWalls" style={{ direction: 'ltr' }}>{stationWalls.map((w, index) => <div key={w.ChargingWallId} className="stationWallCard"><strong>#{index} {w.SerialNumber}</strong><span>{w.ModelInfo?.Model}</span>{w.ModelInfo?.HasWelcomeScreen && <input dir="rtl" placeholder="סיריאלי מסך" value={w.WelcomeScreenSerialNumber} onChange={e => { const value = e.target.value; setStationWalls(prev => prev.map(x => x.ChargingWallId === w.ChargingWallId ? { ...x, WelcomeScreenSerialNumber: value } : x)); }} />}</div>)}</div></div></section>;
}

function DbViewer() {
  const [db, setDb] = useState<any>(null); const [customerId, setCustomerId] = useState(''); const [storeId, setStoreId] = useState('');
  async function load() { setDb(await window.cloudApi.getDb()); }
  useEffect(() => { load(); }, []);
  const customers = db?.Customers || []; const stores = (db?.Stores || []).filter((s: AnyRow) => !customerId || String(s.CustomerId) === customerId); const stations = (db?.CheckInStations || []).filter((st: AnyRow) => !storeId || String(st.StoreId) === storeId); const modelsById = new Map((db?.ChargingWallModels || []).map((m: AnyRow) => [m.ChargingWallModelId, m])); const slotsByWall = (wallId: number) => (db?.ChargingSlots || []).filter((s: AnyRow) => Number(s.ChargingWallId) === Number(wallId)); const screenByWall = (wallId: number) => (db?.WelcomeScreens || []).find((s: AnyRow) => Number(s.ChargingWallId) === Number(wallId));
  return <section className="card"><div className="toolbar"><h2>צפייה ב־DB המקומי</h2><button onClick={load}>רענן</button></div><div className="filters"><select value={customerId} onChange={e => { setCustomerId(e.target.value); setStoreId(''); }}><option value="">כל הריטיילרים</option>{customers.map((c: AnyRow) => <option key={c.CustomerId} value={c.CustomerId}>{c.CustomerName || c.CustomerId}</option>)}</select><select value={storeId} onChange={e => setStoreId(e.target.value)}><option value="">כל הסניפים</option>{stores.map((s: AnyRow) => <option key={s.StoreId} value={s.StoreId}>{s.StoreName || s.StoreId}</option>)}</select></div><div className="dbGrid">{stations.map((station: AnyRow) => { const walls = (db?.ChargingWalls || []).filter((w: AnyRow) => Number(w.CheckInStationId) === Number(station.CheckInStationId)).sort((a: AnyRow,b: AnyRow) => (a.ChargingWallIndex ?? 999) - (b.ChargingWallIndex ?? 999)); return <div className="stationCard" key={station.CheckInStationId}><h3>עמדת כניסה #{station.CheckInStationId}</h3><p>StoreId: {station.StoreId}</p><div className="wallList">{walls.map((w: AnyRow) => { const model = modelsById.get(w.ChargingWallModelId) as AnyRow; return <div className="wallInfo" key={w.ChargingWallId}><strong>קיר #{w.ChargingWallIndex} | {w.SerialNumber}</strong><span>Model: {model?.Model} | ChargingWallId: {w.ChargingWallId}</span><span>מסך: {screenByWall(w.ChargingWallId)?.SerialNumber || 'אין'}</span><span>תאים שמורים: {slotsByWall(w.ChargingWallId).length}</span></div>; })}</div></div>; })}{!stations.length && <div className="emptyState">לא נמצאו עמדות כניסה לפי הסינון.</div>}</div><details className="jsonDetails"><summary>הצג JSON מלא</summary><pre dir="ltr">{JSON.stringify(db, null, 2)}</pre></details></section>;
}

function App() {
  const [tab, setTab] = useState('home');
  const tabs = [['home','מסך ראשי'],['createWall','הקמת קיר טעינה'],['configWall','קנפוג קיר טעינה'],['createStation','הקמת עמדת כניסה'],['db','DB מקומי']];
  return <main><header><div><div className="brand">CUST2MATE</div><h1>Check-in Station Setup</h1><p>ניהול קירות טעינה, קנפוג תאים, הקמת עמדות כניסה וצפייה ב־Mock Cloud מקומי</p></div><nav>{tabs.map(([key,label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</nav></header>{tab === 'home' && <Home setTab={setTab} />}{tab === 'createWall' && <CreateWall />}{tab === 'configWall' && <ConfigWall />}{tab === 'createStation' && <CreateStation />}{tab === 'db' && <DbViewer />}</main>;
}

createRoot(document.getElementById('root')!).render(<App />);
