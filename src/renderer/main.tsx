import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import cust2mateLogo from './assets/cust2mate-logo.webp';

type Row = Record<string, any>;
type Lang = 'he' | 'en';

const i18n = {
  en: { home:'Home', createWall:'Create Charging Wall', configWall:'Configure Charging Wall', createStation:'Create Check-in Station', db:'Show Check-in Stations', title:'Check-in Station Setup', subtitle:'Charging wall setup, slot configuration, check-in station creation and local Mock Cloud viewer', serial:'Serial Number', wallModel:'Wall model', saveWall:'Save wall to local cloud', modelPreview:'Model preview', chooseModel:'Choose a model to preview the wall', welcomeScreen:'Welcome Screen', waiting:'Waiting', active:'Active', done:'Done', stationName:'Check-in station name', retailer:'Retailer', store:'Store', addWall:'Add wall', submit:'Submit and save', chooseWall:'Choose wall', unassignedWall:'Choose unassigned wall', currentSlot:'Current slot', testSlot:'Test current slot', refresh:'Refresh', allRetailers:'All retailers', allStores:'All stores', station:'Check-in Station', savedSlots:'Saved slots', noScreen:'None', fullJson:'Show full JSON', language:'Language', welcomeSerial:'Welcome screen serial' },
  he: { home:'מסך ראשי', createWall:'הקמת קיר טעינה', configWall:'קנפוג קיר טעינה', createStation:'הקמת עמדת כניסה', db:'הצגת עמדות כניסה', title:'Check-in Station Setup', subtitle:'ניהול קירות טעינה, קנפוג תאים, הקמת עמדות כניסה וצפייה ב־Mock Cloud מקומי', serial:'Serial Number', wallModel:'מודל קיר', saveWall:'שמור קיר בענן מקומי', modelPreview:'תצוגת מודל', chooseModel:'בחר מודל להצגת הקיר', welcomeScreen:'מסך כניסה', waiting:'ממתין', active:'נבדק כעת', done:'בוצע', stationName:'שם עמדת כניסה', retailer:'ריטיילר', store:'סניף', addWall:'הוסף קיר', submit:'שליחה ושמירה', chooseWall:'בחר קיר', unassignedWall:'בחר קיר לא משויך', currentSlot:'תא נוכחי', testSlot:'בדוק תא נוכחי', refresh:'רענן', allRetailers:'כל הריטיילרים', allStores:'כל הסניפים', station:'עמדת כניסה', savedSlots:'תאים שמורים', noScreen:'אין', fullJson:'הצג JSON מלא', language:'שפה', welcomeSerial:'סיריאלי מסך כניסה' }
};

function Logo() {
  return <img className="brandLogo" src={cust2mateLogo} alt="Cust2Mate" />;
}

function isScreenCell(model: Row, r: number, c: number) {
  if (!model?.HasWelcomeScreen) return false;
  return r >= model.WelcomeScreenRowNumber && r < model.WelcomeScreenRowNumber + model.WelcomeScreenRowSize && c >= model.WelcomeScreenColumnNumber && c < model.WelcomeScreenColumnNumber + model.WelcomeScreenColumnSize;
}
function isScreenStart(model: Row, r: number, c: number) {
  return model?.HasWelcomeScreen && r === model.WelcomeScreenRowNumber && c === model.WelcomeScreenColumnNumber;
}
function slotNumber(model: Row, r: number, c: number) { return r * model.ColumnCount + c + 1; }

function WallPreview({ model, t, activeSlot, completedSlots = [], compact=false }: { model: Row | null; t: any; activeSlot?: number; completedSlots?: number[]; compact?: boolean }) {
  if (!model) return <div className="emptyState">{t.chooseModel}</div>;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < model.RowCount; r++) {
    for (let c = 0; c < model.ColumnCount; c++) {
      if (isScreenCell(model, r, c) && !isScreenStart(model, r, c)) continue;
      const sn = slotNumber(model, r, c);
      if (isScreenStart(model, r, c)) {
        cells.push(<div key={`screen-${r}-${c}`} className="screenBlock" style={{gridColumn:`${c+1} / span ${model.WelcomeScreenColumnSize}`, gridRow:`${r+1} / span ${model.WelcomeScreenRowSize}`}}><strong>{t.welcomeScreen}</strong></div>);
      } else {
        cells.push(<div key={`${r}-${c}`} className={`slotCard ${activeSlot===sn?'activeSlot':''} ${completedSlots.includes(sn)?'doneSlot':''}`}>
          {activeSlot===sn && <div className="slotArrow">↓</div>}
          <div className="slotInner"><strong>{sn}</strong><span>{completedSlots.includes(sn)?t.done:activeSlot===sn?t.active:t.waiting}</span></div>
        </div>);
      }
    }
  }
  return <div className={`wallCanvas ${compact?'compactWall':''}`} dir="ltr" style={{gridTemplateColumns:`repeat(${model.ColumnCount}, ${compact?44:74}px)`, gridTemplateRows:`repeat(${model.RowCount}, ${compact?78:118}px)`}}>{cells}</div>;
}

function Header({ lang, setLang, t }: any) {
  return <header className="topHeader">
    <div className="headerLeft"><Logo/><div><h1>{t.title}</h1><p>{t.subtitle}</p></div></div>
    <label className="languageSwitch">{t.language}<select value={lang} onChange={e=>setLang(e.target.value)}><option value="en">English</option><option value="he">עברית</option></select></label>
  </header>;
}

function Tabs({ tab, setTab, t }: any) {
  const tabs = [['home', t.home], ['createWall', t.createWall], ['configWall', t.configWall], ['createStation', t.createStation], ['db', t.db]];
  return <nav className="tabs">{tabs.map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</nav>;
}

function CreateWall({ lang }: {lang:Lang}) {
  const t=i18n[lang]; const [models,setModels]=useState<Row[]>([]); const [serial,setSerial]=useState(''); const [screenSerial,setScreenSerial]=useState(''); const [modelId,setModelId]=useState(''); const [msg,setMsg]=useState('');
  useEffect(()=>{window.cloudApi.getWallModels().then((m:Row[])=>{setModels(m); if(m[0]) setModelId(String(m[0].ChargingWallModelId));});},[]);
  const model=models.find(m=>String(m.ChargingWallModelId)===modelId)||null;
  async function submit(){ if(!serial.trim()||!modelId)return; const row=await window.cloudApi.createWall({SerialNumber:serial.trim(),ChargingWallModelId:Number(modelId),WelcomeScreenSerialNumber:screenSerial.trim()||null}); setMsg(`ChargingWallId: ${row.ChargingWallId}`); setSerial(''); setScreenSerial('');}
  return <section className="pageGrid"><div className="panel formPanel"><h2>{t.createWall}</h2><label>{t.serial}</label><input value={serial} onChange={e=>setSerial(e.target.value)} placeholder={t.serial}/><label>{t.wallModel}</label><select value={modelId} onChange={e=>setModelId(e.target.value)}>{models.map(m=><option key={m.ChargingWallModelId} value={m.ChargingWallModelId}>{m.Model} - {m.Description}</option>)}</select>{model?.HasWelcomeScreen&&<><label>{t.welcomeSerial}</label><input value={screenSerial} onChange={e=>setScreenSerial(e.target.value)} placeholder={t.welcomeSerial}/></>}<button onClick={submit}>{t.saveWall}</button>{msg&&<div className="notice">{msg}</div>}</div><div className="panel previewPanel"><h2>{t.modelPreview}</h2><WallPreview model={model} t={t}/></div></section>;
}

function ConfigWall({ lang }: {lang:Lang}) {
  const t=i18n[lang]; const [walls,setWalls]=useState<Row[]>([]); const [selected,setSelected]=useState(''); const [details,setDetails]=useState<any>(null); const [alloc,setAlloc]=useState<Row[]>([]); const [idx,setIdx]=useState(0); const [done,setDone]=useState<number[]>([]); const [msg,setMsg]=useState('');
  async function load(){setWalls(await window.cloudApi.getUnassignedWalls())} useEffect(()=>{load()},[]);
  async function choose(id:string){setSelected(id);setDone([]);setIdx(0);setMsg(''); if(!id){setDetails(null);setAlloc([]);return;} setDetails(await window.cloudApi.getWallDetails(Number(id))); setAlloc(await window.cloudApi.allocateSlotNfcSerials(Number(id)));}
  async function test(){const item=alloc[idx]; if(!item)return; setDone(p=>[...p,item.SlotNumber]); setIdx(i=>i+1);}
  async function save(){const r=await window.cloudApi.saveWallConfiguration({ChargingWallId:Number(selected),Slots:alloc}); setMsg(`${t.savedSlots}: ${r.SlotCount}`); load();}
  return <section className="pageGrid"><div className="panel formPanel"><h2>{t.configWall}</h2><label>{t.unassignedWall}</label><select value={selected} onChange={e=>choose(e.target.value)}><option value="">{t.chooseWall}</option>{walls.map(w=><option key={w.ChargingWallId} value={w.ChargingWallId}>{w.SerialNumber} | {w.ModelInfo?.Model}</option>)}</select><div className="progress">{done.length}/{alloc.length}</div><button onClick={test} disabled={!alloc[idx]}>{t.testSlot}</button><button className="secondary" onClick={save} disabled={!alloc.length||done.length!==alloc.length}>{t.submit}</button>{msg&&<div className="notice">{msg}</div>}</div><div className="panel previewPanel"><h2>{t.configWall}</h2><p>{alloc[idx]?`${t.currentSlot}: ${alloc[idx].SlotNumber}`:''}</p><WallPreview model={details?.model||null} t={t} activeSlot={alloc[idx]?.SlotNumber} completedSlots={done}/></div></section>;
}

function CreateStation({ lang }: {lang:Lang}) {
  const t=i18n[lang]; const [customers,setCustomers]=useState<Row[]>([]); const [stores,setStores]=useState<Row[]>([]); const [walls,setWalls]=useState<Row[]>([]); const [customerId,setCustomerId]=useState(''); const [storeId,setStoreId]=useState(''); const [name,setName]=useState(''); const [selectedWall,setSelectedWall]=useState(''); const [stationWalls,setStationWalls]=useState<Row[]>([]); const [msg,setMsg]=useState('');
  useEffect(()=>{window.cloudApi.getCustomers().then(setCustomers);window.cloudApi.getUnassignedWalls().then(setWalls)},[]); useEffect(()=>{if(customerId)window.cloudApi.getStoresByCustomer(Number(customerId)).then(setStores)},[customerId]);
  function addWall(){const w=walls.find(x=>String(x.ChargingWallId)===selectedWall); if(w&&!stationWalls.some(x=>x.ChargingWallId===w.ChargingWallId))setStationWalls(p=>[...p,w]);}
  async function submit(){const s=await window.cloudApi.createCheckInStation({Name:name,StoreId:Number(storeId),Walls:stationWalls});setMsg(`CheckInStationId: ${s.CheckInStationId}`);setStationWalls([]);setWalls(await window.cloudApi.getUnassignedWalls());}
  return <section className="pageGrid"><div className="panel formPanel"><h2>{t.createStation}</h2><label>{t.stationName}</label><input value={name} onChange={e=>setName(e.target.value)}/><label>{t.retailer}</label><select value={customerId} onChange={e=>{setCustomerId(e.target.value);setStoreId('')}}><option value="">{t.retailer}</option>{customers.map(c=><option key={c.CustomerId} value={c.CustomerId}>{c.CustomerName}</option>)}</select><label>{t.store}</label><select value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">{t.store}</option>{stores.map(s=><option key={s.StoreId} value={s.StoreId}>{s.StoreName}</option>)}</select><label>{t.addWall}</label><div className="row"><select value={selectedWall} onChange={e=>setSelectedWall(e.target.value)}><option value="">{t.chooseWall}</option>{walls.map(w=><option key={w.ChargingWallId} value={w.ChargingWallId}>{w.SerialNumber} | {w.ModelInfo?.Model}</option>)}</select><button onClick={addWall}>+</button></div><button onClick={submit} disabled={!storeId||!stationWalls.length}>{t.submit}</button>{msg&&<div className="notice">{msg}</div>}</div><div className="panel previewPanel"><h2>{t.createStation}</h2><div className="stationVisual" dir="ltr">{stationWalls.map((w,i)=><div className="miniWallWrap" key={w.ChargingWallId}><span>#{i}</span><WallPreview model={w.ModelInfo} t={t} compact/></div>)}</div></div></section>;
}

function DbViewer({ lang }: {lang:Lang}) {
  const t=i18n[lang]; const [db,setDb]=useState<any>(null); const [customerId,setCustomerId]=useState(''); const [storeId,setStoreId]=useState('');
  async function load(){setDb(await window.cloudApi.getDb())} useEffect(()=>{load()},[]);
  const customers=db?.Customers?.filter((x:Row)=>x.CustomerId)||[]; const stores=(db?.Stores||[]).filter((s:Row)=>s.StoreId&&(!customerId||String(s.CustomerId)===customerId)); const stations=(db?.CheckInStations||[]).filter((s:Row)=>s.CheckInStationId&&(!storeId||String(s.StoreId)===storeId)); const modelsById=new Map((db?.ChargingWallModels||[]).map((m:Row)=>[m.ChargingWallModelId,m])); const screenByWall=(id:number)=>(db?.WelcomeScreens||[]).find((s:Row)=>Number(s.ChargingWallId)===Number(id)); const slotsByWall=(id:number)=>(db?.ChargingSlots||[]).filter((s:Row)=>Number(s.ChargingWallId)===Number(id));
  return <section className="panel dbPanel"><div className="toolbar"><h2>{t.db}</h2><button onClick={load}>{t.refresh}</button></div><div className="filters"><select value={customerId} onChange={e=>{setCustomerId(e.target.value);setStoreId('')}}><option value="">{t.allRetailers}</option>{customers.map((c:Row)=><option key={c.CustomerId} value={c.CustomerId}>{c.CustomerName}</option>)}</select><select value={storeId} onChange={e=>setStoreId(e.target.value)}><option value="">{t.allStores}</option>{stores.map((s:Row)=><option key={s.StoreId} value={s.StoreId}>{s.StoreName}</option>)}</select></div>{stations.map((st:Row)=><div className="stationDbCard" key={st.CheckInStationId}><h3>{t.station} #{st.CheckInStationId} · {st.Name}</h3><p>StoreId: {st.StoreId}</p><div className="stationVisual" dir="ltr">{(db.ChargingWalls||[]).filter((w:Row)=>Number(w.CheckInStationId)===Number(st.CheckInStationId)).sort((a:Row,b:Row)=>(a.ChargingWallIndex??999)-(b.ChargingWallIndex??999)).map((w:Row)=><div className="dbWall" key={w.ChargingWallId}><WallPreview model={modelsById.get(w.ChargingWallModelId) as Row} t={t} compact/><b>#{w.ChargingWallIndex} {w.SerialNumber}</b><span>{screenByWall(w.ChargingWallId)?.SerialNumber || t.noScreen}</span><span>{t.savedSlots}: {slotsByWall(w.ChargingWallId).length}</span></div>)}</div></div>)}<details><summary>{t.fullJson}</summary><pre dir="ltr">{JSON.stringify(db,null,2)}</pre></details></section>;
}

function Home({ lang }: {lang:Lang}) { const t=i18n[lang]; return <section className="panel homePanel"><h2>{t.home}</h2><p>{t.subtitle}</p></section>; }

function App(){
  const [tab,setTab]=useState('createWall');
  const [lang,setLang]=useState<Lang>('en');
  const t=i18n[lang];
  return <main dir={lang==='he'?'rtl':'ltr'}>
    <Header lang={lang} setLang={setLang} t={t}/>
    <Tabs tab={tab} setTab={setTab} t={t}/>
    {tab==='home'&&<Home lang={lang}/>}
    {tab==='createWall'&&<CreateWall lang={lang}/>}
    {tab==='configWall'&&<ConfigWall lang={lang}/>}
    {tab==='createStation'&&<CreateStation lang={lang}/>}
    {tab==='db'&&<DbViewer lang={lang}/>}
  </main>
}
createRoot(document.getElementById('root')!).render(<App/>);
