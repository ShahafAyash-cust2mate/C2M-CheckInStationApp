import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import cust2mateLogo from './assets/cust2mate-logo.webp';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


type Row = Record<string, any>;
type Lang = 'he' | 'en';
type DeviceStatus = { connected: boolean; portPath: string; message: string; version?: string };

const APP_VERSION = '1.0';
const DEVICE_STATE_KEY = 'c2m-device-state';

function loadDeviceState(): any {
  try { return JSON.parse(localStorage.getItem(DEVICE_STATE_KEY) || '{}'); } catch { return {}; }
}
function saveDeviceState(state: any) {
  try { localStorage.setItem(DEVICE_STATE_KEY, JSON.stringify(state)); } catch {}
}
async function retryUntil<T>(timeoutMs: number, onTick: (remainingMs: number) => void, action: () => Promise<T>, isSuccess: (result: T) => boolean): Promise<T | null> {
  const start = Date.now();
  let last: T | null = null;
  const tick = () => onTick(Math.max(0, timeoutMs - (Date.now() - start)));
  tick();
  const timer = window.setInterval(tick, 100);
  try {
    while (Date.now() - start < timeoutMs) {
      try {
        const result = await action();
        last = result;
        if (isSuccess(result)) return result;
      } catch (_err) {}
      await sleep(150);
    }
    return last;
  } finally {
    window.clearInterval(timer);
    onTick(0);
  }
}

window.addEventListener('error', (event) => {
  console.error('[Renderer error]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer unhandled rejection]', event.reason);
});

function errorText(error: any) {
  return error?.message || String(error || 'Unknown error');
}

function noticeClass(message: string) {
  const text = String(message || '').toLowerCase();
  if (/error|failed|cannot|not found|not detected|not connected|disconnected|invalid|missing|timeout|exception|err\b|שגיאה|נכשל/.test(text)) {
    return 'notice errorNotice';
  }
  if (/required|warning|warn|please|must|should|empty|select|enter|scan|חובה|אזהרה|נדרש/.test(text)) {
    return 'notice warningNotice';
  }
  return 'notice successNotice';
}


const DEFAULT_APP_SETTINGS = {
  nfcActionTimeoutMs: 10000,
  chargeDetectTimeoutMs: 15000,
  nfcActionDelayMs: 0,
  nfcImmediateAction: true,
  scannerMacFragment: '',
  scannerReadTimeoutMs: 20000,
  arduinoCommandTimeoutMs: 2500,
  openWallDurationSec: 10,
  cloudUseRemote: true,
  cloudBaseUrl: 'https://customer1.cart.dev.do-c2m.com/device-management/v1',
  cloudTokenUrl: 'https://auth.dev.do-c2m.com/oauth2/token',
  cloudClientId: '',
  cloudClientSecret: '',
  cloudRequestTimeoutMs: 30000
};

const i18n = {
  en: {
    home:'Home', createWall:'Create Charging Wall', configWall:'Configure Charging Wall', createStation:'Create Check-in Station', db:'Show Check-in Stations',
    title:'Check-in Station Setup', subtitle:'', serial:'Serial Number', wallModel:'Wall model',
    saveWall:'Save wall to cloud', modelPreview:'Model preview', chooseModel:'Choose a model to preview the wall', welcomeScreen:'Welcome Screen', waiting:'Waiting', active:'Active', done:'Done',
    stationName:'Check-in station name', retailer:'Retailer', store:'Store', addWall:'Add wall', submit:'Submit and save', chooseWall:'Choose wall', unassignedWall:'Choose unassigned wall',
    currentSlot:'Current slot', testSlot:'Test current slot', allRetailers:'All retailers', allStores:'All stores', station:'Check-in Station', savedSlots:'Saved slots', language:'Language',
    welcomeSerial:'Welcome screen serial', noScreen:'None', fullJson:'Show full JSON', nfcSerials:'NFC serials', noNfcSerials:'No NFC serials'
  },
  he: {
    home:'מסך ראשי', createWall:'הקמת קיר טעינה', configWall:'קנפוג קיר טעינה', createStation:'הקמת עמדת כניסה', db:'הצגת עמדות כניסה',
    title:'Check-in Station Setup', subtitle:'', serial:'Serial Number', wallModel:'מודל קיר',
    saveWall:'שמור קיר בענן מקומי', modelPreview:'תצוגת מודל', chooseModel:'בחר מודל להצגת הקיר', welcomeScreen:'מסך כניסה', waiting:'ממתין', active:'נבדק כעת', done:'בוצע',
    stationName:'שם עמדת כניסה', retailer:'ריטיילר', store:'סניף', addWall:'הוסף קיר', submit:'שליחה ושמירה', chooseWall:'בחר קיר', unassignedWall:'בחר קיר לא משויך',
    currentSlot:'תא נוכחי', testSlot:'בדוק תא נוכחי', allRetailers:'כל הריטיילרים', allStores:'כל הסניפים', station:'עמדת כניסה', savedSlots:'תאים שמורים', language:'שפה',
    welcomeSerial:'סיריאלי מסך כניסה', noScreen:'אין', fullJson:'הצג JSON מלא', nfcSerials:'סיריאלים NFC', noNfcSerials:'אין סיריאלים NFC'
  }
};

function Logo() { return <img className="brandLogo" src={cust2mateLogo} alt="Cust2Mate" />; }
function isScreenCell(model: Row, r: number, c: number) {
  if (!model?.HasWelcomeScreen) return false;
  return r >= model.WelcomeScreenRowNumber && r < model.WelcomeScreenRowNumber + model.WelcomeScreenRowSize && c >= model.WelcomeScreenColumnNumber && c < model.WelcomeScreenColumnNumber + model.WelcomeScreenColumnSize;
}
function isScreenStart(model: Row, r: number, c: number) { return model?.HasWelcomeScreen && r === model.WelcomeScreenRowNumber && c === model.WelcomeScreenColumnNumber; }
function slotNumber(model: Row, r: number, c: number) { return r * model.ColumnCount + c + 1; }
function WallPreview({ model, t, activeSlot, completedSlots = [], failedSlots = [], compact=false, onSlotClick }: { model: Row | null; t: any; activeSlot?: number; completedSlots?: number[]; failedSlots?: number[]; compact?: boolean; onSlotClick?: (slotNumber: number) => void }) {
  if (!model) return <div className="emptyState">{t.chooseModel}</div>;
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < model.RowCount; r++) {
    for (let c = 0; c < model.ColumnCount; c++) {
      if (isScreenCell(model, r, c) && !isScreenStart(model, r, c)) continue;
      const sn = slotNumber(model, r, c);
      if (isScreenStart(model, r, c)) {
        cells.push(<div key={`screen-${r}-${c}`} className="screenBlock" style={{gridColumn:`${c+1} / span ${model.WelcomeScreenColumnSize}`, gridRow:`${r+1} / span ${model.WelcomeScreenRowSize}`}}><strong>{t.welcomeScreen}</strong></div>);
      } else {
        const passed = completedSlots.includes(sn);
        const failed = failedSlots.includes(sn);
        cells.push(<div key={`${r}-${c}`} role={onSlotClick?'button':undefined} tabIndex={onSlotClick?0:undefined} onClick={()=>onSlotClick?.(sn)} onKeyDown={(e)=>{ if(onSlotClick && (e.key==='Enter'||e.key===' ')){ e.preventDefault(); onSlotClick(sn); } }} className={`slotCard ${onSlotClick?'selectableSlot':''} ${activeSlot===sn?'activeSlot blinkingSlot':''} ${passed?'doneSlot':''} ${failed?'failedSlot':''}`}>
          {activeSlot===sn && <div className="slotArrow">↓</div>}
          <div className="slotInner"><strong>{sn}</strong><span>{passed?'✓':failed?'✕':activeSlot===sn?t.active:t.waiting}</span></div>
        </div>);
      }
    }
  }
  return <div className={`wallPreviewWithBase ${compact?'compactPreview':''}`}><div className={`wallCanvas ${compact?'compactWall':''}`} dir="ltr" style={{gridTemplateColumns:`repeat(${model.ColumnCount}, ${compact?44:74}px)`, gridTemplateRows:`repeat(${model.RowCount}, ${compact?78:118}px)`}}>{cells}</div><div className="wallBaseStrip"></div></div>;
}

function Header({ lightMode, setLightMode, lang, setLang, t, nfcStatus, arduinoStatus, scannerStatus, onDetectNfc, onDetectArduino, onDetectScanner }: any) {
  return <header className="wireTopHeader">
    <div className="wireBrand">
      <Logo/>
      <div className="wireDivider"></div>
      <h1>{t.title}</h1>
    </div>
    <div className="wireHeaderControls">
      <button type="button" className={`wireDevice ${nfcStatus?.connected ? 'connected' : 'disconnected'}`} onClick={onDetectNfc}><span></span><strong>NFC</strong><small>{nfcStatus?.connected ? 'Connected' : 'Disconnected'}</small></button>
      <button type="button" className={`wireDevice ${scannerStatus?.connected ? 'connected' : 'disconnected'}`} onClick={onDetectScanner}><span></span><strong>Scanner</strong><small>{scannerStatus?.connected ? 'Connected' : 'Disconnected'}</small></button>
      <button type="button" className={`wireDevice ${arduinoStatus?.connected ? 'connected' : 'disconnected'}`} onClick={onDetectArduino}><span></span><strong>Arduino</strong><small>{arduinoStatus?.connected ? 'Connected' : 'Disconnected'}</small></button>
      <button className="modeSwitch" type="button" onClick={()=>setLightMode((v:boolean)=>!v)}>{lightMode ? 'Dark' : 'Light'}</button>
      <label className="languageSwitch wireLang"><select value={lang} onChange={e=>setLang(e.target.value)}><option value="en">English</option><option value="he">עברית</option></select></label>
    </div>
  </header>;
}
function Tabs({ tab, setTab, t }: any) {
  const tabs = [['home', t.home], ['setupWall', 'Set up new wall'], ['editWall', 'Edit existing wall'], ['createStation', t.createStation], ['db', t.db]];
  return <nav className="tabs">{tabs.map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</nav>;
}


function ClearableTextInput({
  value,
  onChange,
  placeholder,
  inputRef,
  autoFocus,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  autoFocus?: boolean;
  onEnter?: () => void;
}) {
  function refocus() {
    setTimeout(() => {
      inputRef?.current?.focus();
      inputRef?.current?.select();
    }, 0);
  }

  return (
    <div className="clearableInputWrap">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="clearInputBtn"
        onClick={() => { onChange(''); refocus(); }}
        aria-label={`Clear ${placeholder}`}
        title="Clear"
      >×</button>
    </div>
  );
}




function modelOptionLabel(m: Row) {
  const model = String(m?.Model || '').trim();
  const description = String(m?.Description || '').trim();
  return description ? `${model} - ${description}` : model;
}

function targetHasWelcomeScreenFromSerial(serial: string): boolean | null {
  const s = String(serial || '').trim();
  if (s.startsWith('11')) return false;
  if (s.startsWith('12')) return true;
  return null;
}

function bestModelForSerial(models: Row[], serial: string): Row | null {
  const target = targetHasWelcomeScreenFromSerial(serial);
  if (target === null) return null;
  const matches = models.filter(m => Boolean(m?.HasWelcomeScreen) === target);
  if (!matches.length) return null;
  const preferredToken = target ? 'WS' : 'NS';
  return matches.find(m => String(m?.Model || '').toUpperCase().includes(preferredToken)) || matches[0];
}


function WallCreateForm({
  lang,
  onCreated,
  onCancel,
}: {
  lang: Lang;
  onCreated?: (row: Row, serial: string) => void;
  onCancel?: () => void;
}) {
  const t=i18n[lang];
  const serialRef = useRef<HTMLInputElement>(null);
  const screenRef = useRef<HTMLInputElement>(null);
  const [models,setModels]=useState<Row[]>([]);
  const [serial,setSerial]=useState('');
  const [screenSerial,setScreenSerial]=useState('');
  const [modelId,setModelId]=useState('');
  const [msg,setMsg]=useState('');

  useEffect(()=>{setTimeout(()=>serialRef.current?.focus(),0);},[]);
  useEffect(()=>{
    window.cloudApi.getWallModels()
      .then((m:Row[])=>{setModels(m); if(m[0]) setModelId(String(m[0].ChargingWallModelId));})
      .catch((e:any)=>setMsg(errorText(e)));
  },[]);
  useEffect(()=>{
    const autoModel = bestModelForSerial(models, serial);
    if (autoModel) {
      setModelId(String(autoModel.ChargingWallModelId));
      if (Boolean(autoModel.HasWelcomeScreen)) setTimeout(()=>screenRef.current?.focus(),0);
    }
  }, [serial, models]);

  const serialModelTarget = targetHasWelcomeScreenFromSerial(serial);
  const visibleModels = serialModelTarget === null ? models : models.filter(m => Boolean(m?.HasWelcomeScreen) === serialModelTarget);
  const model=models.find(m=>String(m.ChargingWallModelId)===modelId)||null;

  async function submit(){
    setMsg('');
    try {
      if (!serial.trim()) throw new Error('Scan charging wall serial first');
      if (!modelId) throw new Error('Choose wall model');
      if (model?.HasWelcomeScreen && !screenSerial.trim()) throw new Error('Welcome screen serial is required');
      const row=await window.cloudApi.createWall({
        SerialNumber:serial.trim(),
        ChargingWallModelId:Number(modelId),
        WelcomeScreenSerialNumber:screenSerial.trim()||null
      });
      setMsg(`ChargingWallId: ${row.ChargingWallId}`);
      onCreated?.(row, serial.trim());
    } catch (e:any) {
      setMsg(errorText(e));
      setTimeout(()=>serialRef.current?.focus(),0);
    }
  }

  return <section className="pageGrid">
    <div className="panel formPanel">
      <h2>Set up new wall</h2>
<label>{t.serial}</label>
      <ClearableTextInput inputRef={serialRef} autoFocus value={serial} onChange={setSerial} placeholder={t.serial} onEnter={()=>model?.HasWelcomeScreen ? screenRef.current?.focus() : submit()}/>
      <label>{t.wallModel}</label>
      <div className="readonlyField">{model ? modelOptionLabel(model) : 'Scan wall serial to auto-detect model'}</div>
      {serialModelTarget!==null&&<div className="fieldHint">Model auto-selected by barcode prefix: {serial.trim().startsWith('11')?'11 = without welcome screen':'12 = with welcome screen'}</div>}
      {model?.HasWelcomeScreen&&<>
        <label>{t.welcomeSerial}</label>
        <ClearableTextInput inputRef={screenRef} value={screenSerial} onChange={setScreenSerial} placeholder={t.welcomeSerial} onEnter={submit}/>
      </>}
      <button className="primary fullWidthAction" onClick={submit}>Save wall to cloud</button>
      {msg&&<div className={noticeClass(msg)}>{msg}</div>}
      <div className="panelBottom"><BackHomeButton onClick={()=>onCancel?.()}/></div>
    </div>
    <div className="panel previewPanel modelPreviewPanel">
      <h2>{t.modelPreview}</h2>
      <div className="modelPreviewList">
        {(visibleModels.length ? visibleModels : models).length ? (visibleModels.length ? visibleModels : models).map((m:Row)=><div key={m.ChargingWallModelId || m.Model} className={`modelPreviewCard ${String(m.ChargingWallModelId)===String(modelId)?'selected':''}`}>
          <h3>{modelOptionLabel(m)}</h3>
          <WallPreview model={m} t={t}/>
        </div>) : <div className="emptyState">No wall models loaded</div>}
      </div>
    </div>
  </section>;
}

function GuidedWallSetup({ lang, deviceState, appSettings, onFinish }: {lang:Lang; deviceState:any; appSettings:any; onFinish:()=>void}) {
  const [phase,setPhase]=useState<'create'|'configure'>('create');
  const [serial,setSerial]=useState('');
  if (phase === 'create') {
    return <WallCreateForm
      lang={lang}
      onCancel={onFinish}
      onCreated={(_, createdSerial)=>{setSerial(createdSerial); setPhase('configure');}}
    />;
  }
  return <ConfigWall
    lang={lang}
    deviceState={deviceState}
    appSettings={appSettings}
    initialSerial={serial}
    autoFind={true}
    guidedTitle="Set up new wall"
    onBack={()=>setPhase('create')}
    onFinish={onFinish}
  />;
}

function CreateWall({ lang, appSettings }: {lang:Lang; appSettings:any}) {
  return <WallCreateForm lang={lang}/>;
}









async function safeTurnTopLedOff(portPath?: string) {
  if (!portPath) return;
  try {
    if (window?.arduinoApi?.turnLedOff) await window.arduinoApi.turnLedOff(portPath);
    else if (window?.arduinoApi?.turnLedOn) await window.arduinoApi.turnLedOn(portPath, { red: 0, green: 0, blue: 0 });
  } catch {}
}

async function safeTurnHandleLedOff(portPath?: string) {
  if (!portPath) return;
  try {
    if (window?.arduinoApi?.turnHandleLedOff) await window.arduinoApi.turnHandleLedOff(portPath);
    else if (window?.arduinoApi?.turnHandleLedOn) await window.arduinoApi.turnHandleLedOn(portPath, { red: 0, green: 0, blue: 0 });
  } catch {}
}

async function safeTurnAllLedsOff(portPath?: string) {
  await safeTurnTopLedOff(portPath);
  await safeTurnHandleLedOff(portPath);
}

async function safeTurnTopLedGreen(portPath?: string) {
  if (!portPath) return;
  try { await window.arduinoApi.turnLedOn(portPath, { red: 0, green: 255, blue: 0 }); } catch {}
}

async function safeTurnTopLedRed(portPath?: string) {
  if (!portPath) return;
  try { await window.arduinoApi.turnLedOn(portPath, { red: 255, green: 0, blue: 0 }); } catch {}
}

async function safeTurnHandleLedGreen(portPath?: string) {
  if (!portPath) return;
  try { await window.arduinoApi.turnHandleLedOn(portPath, { red: 0, green: 255, blue: 0 }); } catch {}
}

async function safeTurnHandleLedRed(portPath?: string) {
  if (!portPath) return;
  try { await window.arduinoApi.turnHandleLedOn(portPath, { red: 255, green: 0, blue: 0 }); } catch {}
}


async function safeOpenWall(portPath?: string, durationMs: number = 10000) {
  if (!portPath) return;
  try {
    if (window?.arduinoApi?.openWall) {
      await window.arduinoApi.openWall(portPath, durationMs);
    }
  } catch {}
}


function statusLabel(status: any) {
  const n = Number(status || 0);
  if (n === 1) return 'Pass';
  if (n === 2) return 'Failed';
  return 'Unknown';
}

function statusClass(status: any) {
  const n = Number(status || 0);
  if (n === 1) return 'statusPass';
  if (n === 2) return 'statusFailed';
  return 'statusUnknown';
}


function statusToNumber(status: any) {
  if (typeof status === 'string') {
    const s = status.trim().toLowerCase();
    if (s === 'pass' || s === 'passed') return 1;
    if (s === 'fail' || s === 'failed') return 2;
    return 0;
  }
  const n = Number(status || 0);
  return n === 1 || n === 2 ? n : 0;
}

function normalizeCloudSlots(payload: any): Row[] {
  const candidate = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.slots)
      ? payload.slots
      : Array.isArray(payload?.Slots)
        ? payload.Slots
        : Array.isArray(payload?.chargingSlots)
          ? payload.chargingSlots
          : Array.isArray(payload?.ChargingSlots)
            ? payload.ChargingSlots
            : [];
  return candidate.map((s: any, i: number) => ({
    ...s,
    SlotNumber: Number(s.SlotNumber ?? s.slotNumber ?? s.slot_number ?? (i + 1)),
    ChargingSlotId: s.ChargingSlotId ?? s.chargingSlotId ?? s.id ?? s.charging_slot_id,
    ChargingWallId: s.ChargingWallId ?? s.chargingWallId ?? s.charging_wall_id,
    NFCId: s.NFCId ?? s.nfcId ?? s.nfc_id ?? '',
    NFCTag: s.NFCTag ?? s.nfcTag ?? s.nfc_tag ?? s.NFCCode ?? s.nfcCode ?? '',
    NFCCode: s.NFCTag ?? s.nfcTag ?? s.nfc_tag ?? s.NFCCode ?? s.nfcCode ?? '',
    RowNumber: Number(s.RowNumber ?? s.rowNumber ?? s.row_number ?? 0),
    ColumnNumber: Number(s.ColumnNumber ?? s.columnNumber ?? s.column_number ?? 0),
    Status: statusToNumber(s.Status ?? s.status ?? 0)
  }));
}

function ConfigWall({ lang, deviceState, appSettings, initialSerial='', autoFind=false, guidedTitle, onBack, onFinish }: {lang:Lang; deviceState:any; appSettings:any; initialSerial?:string; autoFind?:boolean; guidedTitle?:string; onBack?:()=>void; onFinish?:()=>void}) {
  const t=i18n[lang];
  const wallSerialRef = useRef<HTMLInputElement>(null);
  const [wallSerial,setWallSerial]=useState(initialSerial || '');
  const [selected,setSelected]=useState('');
  const [details,setDetails]=useState<any>(null);
  const [screenSerial,setScreenSerial]=useState('');
  const [alloc,setAlloc]=useState<Row[]>([]);
  const [idx,setIdx]=useState(0);
  const [passed,setPassed]=useState<number[]>([]);
  const [failed,setFailed]=useState<number[]>([]);
  const [msg,setMsg]=useState('');
  const [countdownMs,setCountdownMs]=useState<number|null>(null);
  const [slotPrompt,setSlotPrompt]=useState<{slotNumber:number}|null>(null); const [testInstruction,setTestInstruction]=useState<{slotNumber:number}|null>(null); const [testViewActive,setTestViewActive]=useState(false);
  const [wallTestMode,setWallTestMode]=useState(false);
  const currentItem = alloc[idx];
  const lastAutoFindRef = useRef('');

  useEffect(()=>{ setTimeout(()=>wallSerialRef.current?.focus(),0); },[]);
  useEffect(()=>{ if(autoFind && initialSerial) findWallBySerial(initialSerial); },[autoFind, initialSerial]);
  useEffect(()=>{
    const s = wallSerial.trim();
    if (!s || s.length < 6 || testViewActive || s === lastAutoFindRef.current) return;
    const timer = setTimeout(()=>{ lastAutoFindRef.current = s; findWallBySerial(s); }, 350);
    return ()=>clearTimeout(timer);
  }, [wallSerial, testViewActive]);

  async function findWallBySerial(serialOverride?: string){
    const searchSerial = String(serialOverride ?? wallSerial).trim();
    setMsg('');
    setPassed([]); setFailed([]); setIdx(0); setCountdownMs(null); setWallTestMode(false); setTestInstruction(null); setTestViewActive(false);
    try {
      const wall = await window.cloudApi.getUnassignedWallBySerial(searchSerial);
      setSelected(String(wall.ChargingWallId));
      const d = await window.cloudApi.getWallDetails(Number(wall.ChargingWallId));
      setDetails(d);
      setScreenSerial(d?.welcomeScreen?.SerialNumber || '');
      const slots = normalizeCloudSlots(await window.cloudApi.allocateSlotNfcSerials(Number(wall.ChargingWallId)));
      setAlloc(slots);
      setPassed(slots.filter((s:any)=>statusToNumber(s.Status)===1).map((s:any)=>s.SlotNumber));
      setFailed(slots.filter((s:any)=>statusToNumber(s.Status)===2).map((s:any)=>s.SlotNumber));
      const firstNotPass = slots.findIndex((s:any)=>statusToNumber(s.Status)!==1);
      setIdx(firstNotPass >= 0 ? firstNotPass : 0);
    } catch(e:any) {
      setSelected(''); setDetails(null); setAlloc([]);
      setMsg(errorText(e));
    }
  }

  function verifyDevices(){
    const nfcPort=window.__c2mNfcPort||deviceState?.nfc?.portPath||'';
    const arduinoPort=window.__c2mArduinoPort||deviceState?.arduino?.portPath||'';
    if(!nfcPort||!deviceState?.nfc?.connected){setMsg('NFC device is not connected. Connect NFC before testing.'); return null;}
    if(!arduinoPort||!deviceState?.arduino?.connected){setMsg('Arduino device is not connected. Connect Arduino before testing.'); return null;}
    return {nfcPort, arduinoPort};
  }

  async function validateScreenIfNeeded(){
    if(details?.model?.HasWelcomeScreen){
      if(!screenSerial.trim()) throw new Error('Welcome screen serial is required');
      await window.cloudApi.validateWelcomeScreenSerial(screenSerial.trim(), Number(selected));
    }
  }

  function selectSlot(slotNumber: number) {
    if (testViewActive || countdownMs !== null) return;
    const nextIdx = alloc.findIndex((s:any) => Number(s.SlotNumber) === Number(slotNumber));
    if (nextIdx >= 0) {
      setIdx(nextIdx);
      setMsg(`Selected slot ${slotNumber}. Test current slot or start wall test will begin from this slot.`);
    }
  }

  async function startCurrentSlotTest(){
    const item=alloc[idx]; if(!item) return;
    if(!verifyDevices()) return;
    try { await validateScreenIfNeeded(); setWallTestMode(false); setTestViewActive(true); setTestInstruction({slotNumber:item.SlotNumber}); setMsg(`Please Enter the Unit into Slot ${item.SlotNumber}`); }
    catch(e:any){ setMsg(errorText(e)); }
  }

  async function startWallTest(){
    if(!alloc.length) return setMsg('Select a charging wall first');
    if(!verifyDevices()) return;
    try {
      await validateScreenIfNeeded();
      const startIndex = Math.max(0, Math.min(idx, alloc.length - 1));
      const startSlot = alloc[startIndex];
      setIdx(startIndex);
      setWallTestMode(true);
      setTestViewActive(true);
      setTestInstruction({slotNumber:startSlot.SlotNumber});
      setMsg(`Wall test will continue from Slot ${startSlot.SlotNumber}. Please Enter the Unit into Slot ${startSlot.SlotNumber}`);
    } catch(e:any){ setMsg(errorText(e)); }
  }

  function cancelSlotPrompt(){
    setSlotPrompt(null);
    setTestInstruction(null);
    setTestViewActive(false);
    setWallTestMode(false);
    setTestViewActive(false);
    setMsg('Wall test cancelled');
  }

  async function confirmSlotPrompt(){
    const item = alloc[idx];
    setSlotPrompt(null);
    setTestInstruction(null);
    setTestViewActive(true);
    if (!item) return;

    const success = await executeSlotTest(item);
    if (!wallTestMode) { setTestInstruction(null); setTestViewActive(false); }
    const nextIndex = idx + 1;

    if (!success) {
      setWallTestMode(false);
      setTestViewActive(false);
      setMsg(`Wall test stopped. Slot ${item.SlotNumber} failed.`);
      return;
    }

    if (wallTestMode && nextIndex < alloc.length) {
      setIdx(nextIndex);
      const nextSlot = alloc[nextIndex].SlotNumber;
      setTestViewActive(true); setTestInstruction({ slotNumber: nextSlot });
      setMsg(`Slot ${item.SlotNumber} passed. Continue to slot ${nextSlot}.`);
      return;
    }

    setIdx(nextIndex);
    if (wallTestMode) {
      const latestAlloc = alloc.map(s => s.SlotNumber === item.SlotNumber ? { ...s, Status: success ? 1 : 2 } : s);
      try { await window.cloudApi.saveWallConfiguration({ChargingWallId:Number(selected),WelcomeScreenSerialNumber:screenSerial.trim(),Slots:latestAlloc,Status:1}); } catch {}
      setMsg('Wall test completed successfully');
    }
    setTestInstruction(null);
    setTestViewActive(false);
    setWallTestMode(false);
  }

  async function executeSlotTest(item: Row): Promise<boolean>{
    const ports = verifyDevices();
    if (!ports) return false;

    const arduinoPort = ports.arduinoPort;
    const nfcPort = ports.nfcPort;
    const expectedSerial = String(item.NFCTag || item.NFCCode || '').trim();

    async function finishSlot(success: boolean, message: string) {
      const slotStatus = success ? 1 : 2;
      if (success) {
        setPassed(p => Array.from(new Set([...p, item.SlotNumber])));
        setFailed(f => f.filter(x => x !== item.SlotNumber));
      } else {
        setFailed(f => Array.from(new Set([...f, item.SlotNumber])));
        setPassed(p => p.filter(x => x !== item.SlotNumber));
      }
      const updatedAlloc = alloc.map(s => s.SlotNumber === item.SlotNumber ? { ...s, NFCId: item.NFCId || s.NFCId || '', NFCTag: item.NFCTag || item.NFCCode || s.NFCTag || s.NFCCode || '', NFCCode: item.NFCTag || item.NFCCode || s.NFCTag || s.NFCCode || '', Status: slotStatus } : s);
      setAlloc(updatedAlloc);
      try {
        await window.cloudApi.saveWallConfiguration({
          ChargingWallId: Number(selected),
          WelcomeScreenSerialNumber: screenSerial.trim(),
          Slots: updatedAlloc,
          Status: success ? undefined : 2
        });
      } catch {}
      setMsg(message);
      const ledHoldMs = Math.max(0, Number(appSettings?.openWallDurationSec ?? 10) * 1000);
      setTimeout(() => { safeTurnAllLedsOff(arduinoPort); }, ledHoldMs);
      return success;
    }

    try {
      await validateScreenIfNeeded();

      // The user pressed OK in the popup, so the cell test starts now.
      // Always start every cell with both LEDs off.
      await safeTurnAllLedsOff(arduinoPort);

      setMsg(`Slot ${item.SlotNumber}: checking charging...`);
      const charged = await retryUntil(
        Number(appSettings?.chargeDetectTimeoutMs || 10000),
        setCountdownMs,
        async () => window.arduinoApi.isCharging(arduinoPort),
        (r:any) => Boolean(r?.charging)
      );
      setCountdownMs(null);

      if (!charged?.charging) {
        await safeTurnTopLedRed(arduinoPort);
        return await finishSlot(false, `Slot ${item.SlotNumber} failed: charging was not detected`);
      }

      // Charging passed -> top LED green.
      await safeTurnTopLedGreen(arduinoPort);

      setMsg(`Slot ${item.SlotNumber}: writing NFC serial ${expectedSerial}...`);
      const wrote = await retryUntil(
        Number(appSettings?.nfcActionTimeoutMs || 10000),
        setCountdownMs,
        async () => window.nfcApi.writeTag(nfcPort, expectedSerial, { timeoutMs: 900 }),
        (r:any) => Boolean(r?.uid)
      );
      setCountdownMs(null);

      if (!wrote?.uid) {
        await safeTurnHandleLedRed(arduinoPort);
        return await finishSlot(false, `Slot ${item.SlotNumber} failed: NFC write did not succeed`);
      }

      setMsg(`Slot ${item.SlotNumber}: reading NFC tag and comparing...`);
      const read = await retryUntil(
        Number(appSettings?.nfcActionTimeoutMs || 10000),
        setCountdownMs,
        async () => window.nfcApi.readTag(nfcPort, { timeoutMs: 900 }),
        (r:any) => String(r?.userText || '').trim() === expectedSerial
      );
      setCountdownMs(null);

      const actualSerial = String(read?.userText || '').trim();
      if (actualSerial !== expectedSerial) {
        await safeTurnHandleLedRed(arduinoPort);
        return await finishSlot(false, `Slot ${item.SlotNumber} failed: NFC mismatch. Expected ${expectedSerial}, read ${actualSerial || '(empty)'}`);
      }

      // NFC write+read passed -> save sticker UID and tag, then handle LED green.
      const readUid = String(read?.uid || wrote?.uid || '').trim();
      const readTag = actualSerial;
      item.NFCId = readUid;
      item.NFCTag = readTag;
      item.NFCCode = readTag;
      setAlloc(prev => prev.map(s => s.SlotNumber === item.SlotNumber ? { ...s, NFCId: readUid, NFCTag: readTag, NFCCode: readTag } : s));
      // Open the wall immediately after the NFC test passes.
      await safeTurnHandleLedGreen(arduinoPort);
      const openWallDurationSec = Math.max(1, Math.min(99, Number(appSettings?.openWallDurationSec ?? 10)));
      setMsg(`Slot ${item.SlotNumber} NFC passed. Opening wall for ${openWallDurationSec} seconds...`);
      await safeOpenWall(arduinoPort, openWallDurationSec * 1000);

      // At this point both LEDs are green. Keep them on for 5 seconds, then turn both off.
      return await finishSlot(true, `Slot ${item.SlotNumber} passed`);
    } catch (err:any) {
      setCountdownMs(null);
      await safeTurnTopLedRed(arduinoPort);
      await safeTurnHandleLedRed(arduinoPort);
      return await finishSlot(false, `Slot ${item.SlotNumber} failed: ${errorText(err)}`);
    }
  }

  async function save(){
    if(!selected) return setMsg('Select a charging wall first');
    try {
      await validateScreenIfNeeded();
      const wallStatus = failed.length ? 2 : (alloc.length && alloc.every((s:any)=>statusToNumber(s.Status)===1) ? 1 : 0);
      const r=await window.cloudApi.saveWallConfiguration({ChargingWallId:Number(selected),WelcomeScreenSerialNumber:screenSerial.trim(),Slots:alloc,Status:wallStatus});
      setMsg(`${t.savedSlots}: ${r.SlotCount} | Wall status: ${statusLabel(r.Status)}`);
    } catch(e:any){setMsg(errorText(e));}
  }

  const countdownSec=countdownMs===null?null:(countdownMs/1000).toFixed(1);
  const countdownPct=countdownMs===null?0:Math.max(0,Math.min(100,(countdownMs/10000)*100));
  return <section className="pageGrid horizontalPage">
    <div className={`panel formPanel ${testViewActive ? 'testInstructionPanel' : ''}`}>
      {testViewActive ? <>
        <h2>{testInstruction ? 'Please Enter the Unit into the Slot' : 'Cell Test Running'}</h2>
        <div className="instructionSlotNumber">Slot {testInstruction?.slotNumber || currentItem?.SlotNumber || '-'}</div>
        {testInstruction ? <>
          <p>Insert the unit into slot <strong>{testInstruction.slotNumber}</strong>.</p>
          <p>The test starts only after pressing OK.</p>
          <div className="instructionActions"><button onClick={confirmSlotPrompt}>OK</button><button className="cancelBtn" onClick={cancelSlotPrompt}>Cancel</button></div>
        </> : <>
          <p>Testing slot <strong>{currentItem?.SlotNumber}</strong>. Keep the unit in the slot.</p>
          {countdownMs!==null&&<div className="countdownBox"><div>Timeout: <strong>{countdownSec}</strong>s</div><div className="timeoutBar"><span style={{width:`${countdownPct}%`}}></span></div></div>}
        </>}
        {msg&&<div className={noticeClass(msg)}>{msg}</div>}
        <div className="panelBottom"><BackHomeButton onClick={()=>onFinish?.()}/></div>
      </> : <>
        <h2>{guidedTitle || t.configWall}</h2>
        <label>Charging wall serial</label>
        <div className="row serialFindRow"><ClearableTextInput inputRef={wallSerialRef} autoFocus value={wallSerial} onChange={setWallSerial} placeholder="Enter charging wall serial" onEnter={()=>findWallBySerial()}/></div>
        {details?.model?.HasWelcomeScreen&&<><label>{t.welcomeSerial}</label><ClearableTextInput value={screenSerial} onChange={setScreenSerial} placeholder={t.welcomeSerial}/></>}
        <div className="progress">{passed.length}/{alloc.length}</div>
        {countdownMs!==null&&<div className="countdownBox"><div>Timeout: <strong>{countdownSec}</strong>s</div><div className="timeoutBar"><span style={{width:`${countdownPct}%`}}></span></div></div>}
        {alloc.length>0&&<>
          <button onClick={startWallTest}>Start wall test from selected slot</button>
          {(failed.length>0 || msg.includes('stopped')) && <button className="continueBtn" onClick={startWallTest}>Continue wall test from Slot {currentItem?.SlotNumber || ''}</button>}
          <div className="workflowActions compactActions">{onBack&&<button className="secondary" onClick={onBack}>Back</button>}</div>
        </>}
        {msg&&<div className={noticeClass(msg)}>{msg}</div>}
        <div className="panelBottom"><BackHomeButton onClick={()=>onFinish?.()}/></div>
      </>}
    </div>
    <div className="panel previewPanel">
      <h2>{t.configWall}</h2>
      <p>{currentItem?`${t.currentSlot}: ${currentItem.SlotNumber}`:''}</p>
      {alloc.length>0&&<div className="rightPanelActions"><button onClick={startCurrentSlotTest} disabled={!currentItem}>Test current slot</button></div>}
      <div className="wallWithSerials">
        <WallPreview model={details?.model||null} t={t} activeSlot={currentItem?.SlotNumber} completedSlots={passed} failedSlots={failed} onSlotClick={selectSlot}/>
        <div className="nfcSerialList">
          <h3>Slots Info</h3>
          {alloc.length ? alloc.map(item => (
            <div key={`${item.RowNumber}-${item.ColumnNumber}`} onClick={()=>selectSlot(item.SlotNumber)} className={`nfcSerialRow clickable ${currentItem?.SlotNumber===item.SlotNumber?'active':''} ${passed.includes(item.SlotNumber)?'passed':''} ${failed.includes(item.SlotNumber)?'failed':''}`}>
              <strong>Slot {item.SlotNumber}</strong>
              <span>{(item.NFCTag || item.NFCCode)}</span>
              <em className={`slotStatus ${statusClass(item.Status)}`}>{statusLabel(item.Status)}</em>
            </div>
          )) : <div className="emptyState small">{t.noNfcSerials}</div>}
        </div>
      </div>
    </div>
  </section>;
}


function StationWallsVisual({ walls, t }: { walls: Row[]; t: any }) {
  if (!walls.length) return <div className="emptyState small">Add charging walls to preview the station.</div>;
  return <div className="linkedStationFrame">
    <div className="linkedStationVisual">
      {walls.map((w, i) => (
        <div className="linkedWallUnit" key={w.ChargingWallId}>
          <div className="linkedWallProps">
            <div className="wallPropLine"><strong>Wall #{i + 1}</strong></div>
            <div className="wallPropLine mono">{w.SerialNumber}</div>
            <div className="wallPropLine">{w.ModelInfo?.Model}</div>
            <div className="wallPropLine welcomeLine">{w.ModelInfo?.HasWelcomeScreen ? `Welcome: ${w.WelcomeScreenSerial || 'Missing'}` : '\u00A0'}</div>
            <em className={`statusPill ${statusClass(w.Status)}`}>{statusLabel(w.Status)}</em>
          </div>
          <div className="linkedWallPreviewWrap"><WallPreview model={w.ModelInfo} t={t}/></div>
        </div>
      ))}
    </div>
  </div>;
}

function CreateStation({ lang, appSettings, onFinish }: {lang:Lang; appSettings?: any; onFinish?:()=>void}) {
  const t=i18n[lang];
  const [customers,setCustomers]=useState<Row[]>([]); const [customerId,setCustomerId]=useState(''); const [stores,setStores]=useState<Row[]>([]); const [storeId,setStoreId]=useState('');
  const nameRef = useRef<HTMLInputElement>(null); const wallSerialRef = useRef<HTMLInputElement>(null);
  const [name,setName]=useState(''); const [wallSerial,setWallSerial]=useState(''); const [currentWall,setCurrentWall]=useState<Row|null>(null); const [selectedWalls,setSelectedWalls]=useState<Row[]>([]); const [msg,setMsg]=useState(''); const stationAutoFindRef = useRef('');
  useEffect(()=>{setTimeout(()=>nameRef.current?.focus(),0); window.cloudApi.getCustomers().then(setCustomers).catch((e:any)=>setMsg(errorText(e)));},[]);
  useEffect(()=>{if(customerId){ const c=customers.find((x:any)=>String(x.CustomerId)===String(customerId)); setStores(Array.isArray(c?.Stores)?c.Stores:[]); } else setStores([]);},[customerId, customers]);
  useEffect(()=>{ const s=wallSerial.trim(); if(!s || s.length < 6 || s===stationAutoFindRef.current) return; const timer=setTimeout(()=>{ stationAutoFindRef.current=s; findWall(); },350); return ()=>clearTimeout(timer); },[wallSerial]);
  async function findWall(){
    setMsg(''); setCurrentWall(null);
    try{
      const wall = await window.cloudApi.getUnassignedWallBySerial(wallSerial.trim());
      if(selectedWalls.some(w=>Number(w.ChargingWallId)===Number(wall.ChargingWallId))) throw new Error('This charging wall was already added to the station');
      setCurrentWall(wall);
    }catch(e:any){setMsg(errorText(e));}
  }
  async function addWall(){
    setMsg('');
    try{
      if(!currentWall) throw new Error('Find a charging wall first');
      if(Number(currentWall.Status || 0) !== 1) throw new Error(`Charging wall ${currentWall.SerialNumber} cannot be added because its status is not Pass`);
      const serial = String(currentWall.WelcomeScreenSerial || '').trim();
      if(currentWall.ModelInfo?.HasWelcomeScreen && !serial) throw new Error('Welcome screen serial is missing in local cloud for this wall');
      if(serial && selectedWalls.some(w=>String(w.WelcomeScreenSerial||'').trim().toUpperCase()===serial.toUpperCase())) throw new Error(`Welcome screen serial was already added: ${serial}`);
      setSelectedWalls(p=>[...p,{...currentWall,WelcomeScreenSerial:serial}]);
      setWallSerial(''); setCurrentWall(null); setTimeout(()=>wallSerialRef.current?.focus(),0);
    } catch(e:any){setMsg(errorText(e));}
  }
  async function submit(){
    setMsg('');
    try { const r=await window.cloudApi.createCheckInStation({Name:name,StoreId:Number(storeId),Walls:selectedWalls.map(w=>({ChargingWallId:w.ChargingWallId,WelcomeScreenSerial:w.WelcomeScreenSerial||''}))}); setMsg(`${t.station} #${r.CheckInStationId}`); setSelectedWalls([]); setName(''); onFinish?.(); }
    catch(e:any){setMsg(errorText(e));}
  }
  return <section className="pageGrid horizontalPage">
    <div className="panel formPanel">
      <h2>Set up Check-in Station</h2>
      <label>{t.stationName}</label>
      <ClearableTextInput inputRef={nameRef} autoFocus value={name} onChange={setName} placeholder={t.stationName}/>
      <label>{t.retailer}</label>
      <select value={customerId} onChange={e=>setCustomerId(e.target.value)}>
        <option value="">{t.allRetailers}</option>
        {customers.map(c=><option key={c.CustomerId} value={c.CustomerId}>{c.CustomerName||c.Name||`Customer ${c.CustomerId}`}</option>)}
      </select>
      <label>{t.store}</label>
      <select value={storeId} onChange={e=>setStoreId(e.target.value)}>
        <option value="">{t.allStores}</option>
        {stores.map(s=><option key={s.StoreId} value={s.StoreId}>{s.StoreName||s.Name||`Store ${s.StoreId}`}</option>)}
      </select>
      <label>Charging wall serial</label>
      <div className="stationWallRow">
        <ClearableTextInput inputRef={wallSerialRef} value={wallSerial} onChange={setWallSerial} placeholder="Enter charging wall serial" onEnter={findWall}/>
        <button onClick={addWall} disabled={!currentWall}>{t.addWall}</button>
      </div>
      {currentWall&&<div className="miniCard foundWallCard">
        <strong>{currentWall.SerialNumber}</strong>
        <span>{currentWall.ModelInfo?.Model}</span>
        <span className={`statusPill ${statusClass(currentWall.Status)}`}>Status: {statusLabel(currentWall.Status)}</span>
        {currentWall.ModelInfo?.HasWelcomeScreen&&<span>Welcome screen: {currentWall.WelcomeScreenSerial || 'Missing in DB'}</span>}
      </div>}
      <button className="secondary" onClick={submit} disabled={!storeId||!selectedWalls.length}>{t.submit}</button>
      {msg&&<div className={noticeClass(msg)}>{msg}</div>}
      <div className="panelBottom"><BackHomeButton onClick={()=>onFinish?.()}/></div>
    </div>
    <div className="panel previewPanel">
      <h2>{t.createStation}</h2>
      <StationWallsVisual walls={selectedWalls} t={t}/>
    </div>
  </section>;
}

function TestSpecificSlot({ lang, onFinish }: {lang:Lang; onFinish:()=>void}) {
  const t = i18n[lang];
  const slotRef = useRef<HTMLInputElement>(null);
  const [nfcWriteText, setNfcWriteText] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<number>(1);
  const [msg, setMsg] = useState('');

  useEffect(()=>{ setTimeout(()=>slotRef.current?.focus(),0); },[]);

  function chooseSlot(slotNumber: number) {
    setSelectedSlot(slotNumber);
    setMsg(`Selected slot ${slotNumber}`);
  }

  function onSlotInput(value: string) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 1 && num <= 99) setSelectedSlot(num);
  }

  function action(name: string) {
    if (!selectedSlot) {
      setMsg('Select a slot first');
      return;
    }
    setMsg(`${name} requested for slot ${selectedSlot}${name==='Write NFC' && nfcWriteText ? ` with value: ${nfcWriteText}` : ''}`);
  }

  return <section className="pageGrid horizontalPage testSpecificSlotPage">
    <div className="panel formPanel">
      <h2>Test specific slot</h2>
      <label>Slot number</label>
      <ClearableTextInput inputRef={slotRef} value={String(selectedSlot || '')} onChange={onSlotInput} placeholder="Enter slot number" />
      <div className="selectedSlotBox">Selected Slot: <strong>{selectedSlot || '-'}</strong></div>
      {msg&&<div className={noticeClass(msg)}>{msg}</div>}
      <div className="panelBottom"><BackHomeButton onClick={onFinish}/></div>
    </div>
    <div className="panel previewPanel">
      <h2>Slot Test Actions</h2>
      <div className="rightPanelActions testButtons">
        <button onClick={()=>action('Test Slot')}>Test Slot</button>
        <button onClick={()=>action('Test Charge')}>Test Charge</button>
        <button onClick={()=>action('Read NFC')}>Read NFC</button>
        <button onClick={()=>action('Write NFC')}>Write NFC</button>
        <input className="inlineNfcInput" value={nfcWriteText} onChange={e=>setNfcWriteText(e.target.value)} placeholder="NFC text to write" />
      </div>
      <div className="wallWithSerials">
        <WallPreview model={{RowCount:4,ColumnCount:5,HasWelcomeScreen:true}} t={t} activeSlot={selectedSlot} onSlotClick={chooseSlot}/>
        <div className="nfcSerialList"><h3>Slots Info</h3><div className="emptyState small">Select a slot on the wall or type the slot number.</div></div>
      </div>
    </div>
  </section>;
}


function DbViewer({ lang, onFinish }: {lang:Lang; onFinish:()=>void}) {
  const t=i18n[lang];
  const [db,setDb]=useState<any>(null);
  const [customer,setCustomer]=useState('');
  const [store,setStore]=useState('');
  const [search,setSearch]=useState('');
  const [selectedStationId,setSelectedStationId]=useState('');
  async function load(){setDb(await window.cloudApi.getDb())}
  useEffect(()=>{load()},[]);
  if(!db) return <section className="showStationsPage"><BackHomeButton onClick={onFinish}/><h2>Loading...</h2></section>;

  const customers = db.Customers || [];
  const stores = db.Stores || [];
  const walls = db.ChargingWalls || [];
  const models = db.ChargingWallModels || [];
  const welcomeScreens = db.WelcomeScreens || [];
  const allSlots = db.ChargingSlots || [];
  const stationRows=(db.CheckInStations||[])
    .filter((s:Row)=>(!store||String(s.StoreId)===String(store)))
    .filter((s:Row)=>{
      const q=search.trim().toLowerCase();
      if(!q) return true;
      return String(s.CheckInStationId||'').toLowerCase().includes(q) || String(s.Name||'').toLowerCase().includes(q);
    })
    .map((s:Row)=>{
      const stationWalls=walls.filter((w:Row)=>Number(w.CheckInStationId)===Number(s.CheckInStationId));
      const statusNums=stationWalls.map((w:Row)=>statusToNumber(w.Status));
      const status = statusNums.length && statusNums.every((x:number)=>x===1) ? 1 : statusNums.some((x:number)=>x===2) ? 2 : 0;
      const storeRow=stores.find((st:Row)=>String(st.StoreId)===String(s.StoreId));
      const customerRow=customers.find((c:Row)=>String(c.CustomerId)===String(storeRow?.CustomerId || s.CustomerId));
      const stationWallDetails = stationWalls.map((w:Row) => {
        const modelRow = models.find((m:Row)=>String(m.ChargingWallModelId ?? m.id)===String(w.ChargingWallModelId ?? w.chargingWallModelId));
        const welcomeRow = welcomeScreens.find((ws:Row)=>String(ws.ChargingWallId ?? ws.chargingWallId)===String(w.ChargingWallId ?? w.id));
        const wallSlots = allSlots.filter((sl:Row)=>String(sl.ChargingWallId ?? sl.chargingWallId)===String(w.ChargingWallId ?? w.id));
        return {...w, model: modelRow || null, welcomeScreen: welcomeRow || null, slots: wallSlots};
      });
      return {...s, CustomerName: customerRow?.CustomerName || customerRow?.Name || `Customer ${storeRow?.CustomerId || s.CustomerId || ''}`, StoreName: storeRow?.StoreName || storeRow?.Name || `Store ${s.StoreId||''}`, WallCount: stationWalls.length, Status: status, StationWalls: stationWallDetails};
    });
  const selectedStation = stationRows.find((s:Row)=>String(s.CheckInStationId)===String(selectedStationId)) || stationRows[0] || null;

  return <section className="showStationsPage">
    <div className="showStationsVisual"><StationIllustration/><div className="panelBottom"><BackHomeButton onClick={onFinish}/></div></div>
    <div className="showStationsPanel">
      <div className="toolbar showStationsToolbar"><h2>Check-in Stations</h2><button onClick={load}>Refresh</button></div>
      <div className="showStationsFilters">
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search station ID or name" />
        <select value={customer} onChange={e=>{setCustomer(e.target.value);setStore('')}}><option value="">All retailers</option>{customers.filter((c:Row)=>c.CustomerId).map((c:Row)=><option key={c.CustomerId} value={c.CustomerId}>{c.CustomerName||c.Name||`Customer ${c.CustomerId}`}</option>)}</select>
        <select value={store} onChange={e=>setStore(e.target.value)}><option value="">All stores</option>{stores.filter((s:Row)=>s.StoreId&&(!customer||String(s.CustomerId)===String(customer))).map((s:Row)=><option key={s.StoreId} value={s.StoreId}>{s.StoreName||s.Name||`Store ${s.StoreId}`}</option>)}</select>
      </div>
      {selectedStation&&<div className="selectedStationPanel">
        <div className="selectedStationHeader">
          <div>
            <strong>Selected Check-in Station</strong>
            <h3>{selectedStation.Name || `Station ${selectedStation.CheckInStationId}`}</h3>
          </div>
          <span className={`statusPill largeStatus ${statusClass(selectedStation.Status)}`}>{statusLabel(selectedStation.Status)}</span>
        </div>
        <div className="selectedStationMeta">
          <span><b>Station ID</b>{selectedStation.CheckInStationId}</span>
          <span><b>Customer</b>{selectedStation.CustomerName || '-'}</span>
          <span><b>Store / Location</b>{selectedStation.StoreName || '-'}</span>
          <span><b>Walls</b>{selectedStation.WallCount}</span>
        </div>
        <div className="selectedStationWalls">
          {(selectedStation.StationWalls || []).length ? selectedStation.StationWalls.map((w:Row, wallIndex:number) => {
            const model = w.model || null;
            const wallStatus = statusToNumber(w.Status);
            const passedSlots = (w.slots || []).filter((s:Row)=>statusToNumber(s.Status)===1).map((s:Row)=>Number(s.SlotNumber ?? s.slotNumber ?? s.RowNumber ?? 0)).filter(Boolean);
            const failedSlots = (w.slots || []).filter((s:Row)=>statusToNumber(s.Status)===2).map((s:Row)=>Number(s.SlotNumber ?? s.slotNumber ?? s.RowNumber ?? 0)).filter(Boolean);
            return <div className="selectedWallCard" key={w.ChargingWallId || w.id || wallIndex}>
              <div className="selectedWallInfo">
                <span><b>Wall #{wallIndex + 1}</b></span>
                <span><b>Wall serial</b>{w.SerialNumber || w.serialNumber || '-'}</span>
                <span><b>Model</b>{model?.Model || w.Model || '-'}</span>
                <span><b>Welcome serial</b>{w.welcomeScreen?.SerialNumber || w.WelcomeScreenSerial || '-'}</span>
                <span><b>Status</b><em className={`statusPill ${statusClass(wallStatus)}`}>{statusLabel(wallStatus)}</em></span>
              </div>
              <div className="selectedWallPreview"><WallPreview model={model} t={t} compact completedSlots={passedSlots} failedSlots={failedSlots}/></div>
            </div>;
          }) : <div className="emptyState small">No walls linked to this station.</div>}
        </div>
      </div>}
      <table className="stationsTable">
        <thead><tr><th>Station ID</th><th>Station Name</th><th>Customer</th><th>Location</th><th>Walls</th><th>Status</th><th>Action</th></tr></thead>
        <tbody>
          {stationRows.map((s:Row)=><tr key={s.CheckInStationId} className={String(selectedStation?.CheckInStationId)===String(s.CheckInStationId)?'selectedRow':''} onClick={()=>setSelectedStationId(String(s.CheckInStationId))}>
            <td>{s.CheckInStationId}</td>
            <td>{s.Name||'-'}</td>
            <td>{s.CustomerName||'-'}</td>
            <td>{s.StoreName||'-'}</td>
            <td>{s.WallCount}</td>
            <td><span className={`statusPill ${statusClass(s.Status)}`}>{statusLabel(s.Status)}</span></td>
            <td><button className="eyeBtn" title="View station" onClick={(e)=>{e.stopPropagation();setSelectedStationId(String(s.CheckInStationId));}}>👁</button></td>
          </tr>)}
          {!stationRows.length&&<tr><td colSpan={7} className="emptyCell">No check-in stations found</td></tr>}
        </tbody>
      </table>
      <div className="whatHappens"><strong>What happens</strong><div><span>• View all check-in stations.</span><span>• Click eye icon to view station details.</span><span>• See number of walls and status.</span><span>• Click Back to return Home.</span></div></div>
    </div>
  </section>;
}




let lastScannerKeyboardTarget: any = null;

function setNativeInputValue(element: any, value: string) {
  const tag = (element?.tagName || '').toLowerCase();
  const prototype = tag === 'textarea' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  valueSetter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}


// scanner-input-focus-tracker
if (typeof window !== 'undefined') {
  window.addEventListener('focusin', (event: any) => {
    const el = event.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && !el.readOnly && !el.disabled) {
      lastScannerKeyboardTarget = el;
    }
  });
}

function dispatchScannerKeyboardValue(value: string, suffix: string = 'enter') {
  let active = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  let canWrite =
    active &&
    !active.readOnly &&
    !active.disabled &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');

  if (!canWrite && lastScannerKeyboardTarget && document.contains(lastScannerKeyboardTarget)) {
    active = lastScannerKeyboardTarget;
    canWrite = true;
  }

  if (!canWrite || !active) {
    window.dispatchEvent(new CustomEvent('scanner-keyboard-value', { detail: { value, suffix, handled: false } }));
    return false;
  }

  const start = typeof active.selectionStart === 'number' ? active.selectionStart : active.value.length;
  const end = typeof active.selectionEnd === 'number' ? active.selectionEnd : active.value.length;
  const currentValue = String(active.value || '');

  // If the same scan already reached this input once, do not append it again.
  // This fixes cases where both the main app and device manager poll the same scanner value.
  if (currentValue === value) {
    window.dispatchEvent(new CustomEvent('scanner-keyboard-value', { detail: { value, suffix, handled: true, deduped: true } }));
    return true;
  }

  const replaceAll =
    currentValue.length > 0 &&
    currentValue.length === value.length &&
    /^\d+$/.test(currentValue) &&
    /^\d+$/.test(value);

  const nextValue = replaceAll ? value : active.value.slice(0, start) + value + active.value.slice(end);

  active.focus();
  setNativeInputValue(active, nextValue);

  try {
    active.value = nextValue;
  } catch {}

  const nativeInputValueSetter =
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

  if (nativeInputValueSetter && active.tagName === 'INPUT') {
    nativeInputValueSetter.call(active, nextValue);
  }

  active.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: value
  }));

  active.dispatchEvent(new Event('change', { bubbles: true }));

  const reactKey = Object.keys(active).find(k => k.startsWith('__reactProps'));
  if (reactKey && active[reactKey]?.onChange) {
    active[reactKey].onChange({ target: active, currentTarget: active });
  }

  const caret = start + value.length;
  try { active.setSelectionRange(caret, caret); } catch {}

  window.dispatchEvent(new CustomEvent('scanner-keyboard-value', { detail: { value, suffix, handled: true } }));

  if (suffix === 'enter') {
    active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
    active.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
  } else if (suffix === 'tab') {
    active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', bubbles: true }));
    active.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', code: 'Tab', bubbles: true }));
  }

  return true;
}

function DeviceManager({ deviceState, appSettings, onNfcStatusChange, onArduinoStatusChange, onDetectNfc, onDetectArduino, onDetectScanner }: {deviceState:any; appSettings:any; onNfcStatusChange:(s:DeviceStatus)=>void; onArduinoStatusChange:(s:DeviceStatus)=>void; onDetectNfc:()=>Promise<void>; onDetectArduino:()=>Promise<void>; onDetectScanner:()=>Promise<void>}) {
  const [activeTab, setActiveTab] = useState<'connect'|'nfc'|'arduino'|'scanner'|'data'>('connect');
  const [nfcPorts, setNfcPorts] = useState<any[]>([]);
  const [arduinoPorts, setArduinoPorts] = useState<any[]>([]);
  const [nfcPort, setNfcPort] = useState(deviceState?.nfc?.portPath || '');
  const [arduinoPort, setArduinoPort] = useState(deviceState?.arduino?.portPath || '');
  const [writeValue, setWriteValue] = useState('');
  const [readText, setReadText] = useState('');
  const [readResult, setReadResult] = useState<any>(null);
  const [writeResult, setWriteResult] = useState<any>(null);
  const [nfcImmediate, setNfcImmediate] = useState(true);
  const [nfcDelayMs, setNfcDelayMs] = useState(3000);
  const [nfcTimeoutMs, setNfcTimeoutMs] = useState(10000);
  const [nfcStatusText, setNfcStatusText] = useState('');
  const [arduinoStatusText, setArduinoStatusText] = useState('');
  const [battery, setBattery] = useState<any>(null);
  const [scannerMac, setScannerMac] = useState(localStorage.getItem('c2m-scanner-mac') || '');
  const [scannerStatusText, setScannerStatusText] = useState(deviceState?.scanner?.message || '');
  const [scannerReadValue, setScannerReadValue] = useState('');
  const [scannerVersion, setScannerVersion] = useState('');
  const [scannerDevices, setScannerDevices] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (deviceState?.nfc?.portPath) setNfcPort(deviceState.nfc.portPath);
    if (deviceState?.arduino?.portPath) setArduinoPort(deviceState.arduino.portPath);
  }, [deviceState?.nfc?.portPath, deviceState?.arduino?.portPath]);

  async function loadPorts() {
    setBusy(true);
    try {
      const [nfcList, arduinoList] = await Promise.all([window.nfcApi.listPorts(), window.arduinoApi.listPorts()]);
      setNfcPorts(nfcList || []);
      setArduinoPorts(arduinoList || []);
      if (!nfcPort && nfcList?.[0]) setNfcPort(nfcList[0].path);
      if (!arduinoPort && arduinoList?.[0]) setArduinoPort(arduinoList[0].path);
    } catch (err:any) {
      setNfcStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function testNfc() {
    if (!nfcPort) return setNfcStatusText('Select NFC port first');
    setBusy(true);
    try {
      const r = await window.nfcApi.testConnection(nfcPort);
      if (r.connected) window.__c2mNfcPort = nfcPort;
      onNfcStatusChange?.(r);
      setNfcStatusText(r.connected ? `NFC connected on ${nfcPort}` : `NFC not connected: ${r.message}`);
    } catch (err:any) {
      setNfcStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function testArduino() {
    if (!arduinoPort) return setArduinoStatusText('Select Arduino port first');
    setBusy(true);
    try {
      const r = await window.arduinoApi.testConnection(arduinoPort);
      if (r.connected) window.__c2mArduinoPort = arduinoPort;
      onArduinoStatusChange?.(r);
      setArduinoStatusText(r.connected ? `Arduino connected on ${arduinoPort}` : `Arduino not connected: ${r.message}`);
    } catch (err:any) {
      setArduinoStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function waitIfNeeded() {
    if (!nfcImmediate) {
      setNfcStatusText(`Waiting ${nfcDelayMs}ms before NFC action...`);
      await sleep(Number(nfcDelayMs || 0));
    }
  }

  async function readNfcTagContent() {
    if (!nfcPort) return setNfcStatusText('Select NFC port first');
    setBusy(true);
    try {
      await waitIfNeeded();
      const r = await window.nfcApi.readTag(nfcPort, { timeoutMs: Number(nfcTimeoutMs || 10000) });
      setReadText(r.userText || '');
      setNfcStatusText(`Read value complete. UID: ${r.uid}`);
    } catch (err:any) {
      setNfcStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function readNfcData() {
    if (!nfcPort) return setNfcStatusText('Select NFC port first');
    setBusy(true);
    try {
      await waitIfNeeded();
      const r = await window.nfcApi.readTag(nfcPort, { timeoutMs: Number(nfcTimeoutMs || 10000) });
      setReadResult(r);
      setReadText(r.userText || '');
      setNfcStatusText(`Read data complete. UID: ${r.uid}`);
    } catch (err:any) {
      setNfcStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function writeTag() {
    if (!nfcPort) return setNfcStatusText('Select NFC port first');
    if (!writeValue) return setNfcStatusText('Enter value to write');
    setBusy(true);
    try {
      await waitIfNeeded();
      const r = await window.nfcApi.writeTag(nfcPort, writeValue, { timeoutMs: Number(nfcTimeoutMs || 10000) });
      setWriteResult(r);
      setNfcStatusText(`Write complete. UID: ${r.uid}`);
    } catch (err:any) {
      setNfcStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function readBattery() {
    if (!arduinoPort) return setArduinoStatusText('Select Arduino port first');
    setBusy(true);
    try {
      const r = await window.arduinoApi.getBattery(arduinoPort);
      setBattery(r);
      setArduinoStatusText(`Battery ${r.batteryPercent}% | Charging: ${r.charging ? 'Yes' : 'No'}`);
    } catch (err:any) {
      setArduinoStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnTopLedOn() {
    if (!arduinoPort) return setArduinoStatusText('Select Arduino port first');
    setBusy(true);
    try {
      await window.arduinoApi.turnLedOn(arduinoPort, { red: 0, green: 255, blue: 0 });
      setArduinoStatusText('Top green LED command sent');
    } catch (err:any) {
      setArduinoStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnHandleLedOn() {
    if (!arduinoPort) return setArduinoStatusText('Select Arduino port first');
    setBusy(true);
    try {
      await window.arduinoApi.turnHandleLedOn(arduinoPort, { red: 0, green: 255, blue: 0 });
      setArduinoStatusText('Handle green LED command sent');
    } catch (err:any) {
      setArduinoStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function turnAllLedsOff() {
    if (!arduinoPort) return setArduinoStatusText('Select Arduino port first');
    setBusy(true);
    try {
      await safeTurnAllLedsOff(arduinoPort);
      setArduinoStatusText('Top and handle LEDs turned off');
    } catch (err:any) {
      setArduinoStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function openWallFromDeviceManager() {
    if (!arduinoPort) return setArduinoStatusText('Select Arduino port first');
    setBusy(true);
    try {
      const seconds = Math.max(1, Math.min(99, Number(appSettings?.openWallDurationSec ?? 10)));
      const r = await window.arduinoApi.openWall(arduinoPort, seconds * 1000);
      setArduinoStatusText(`Open Wall command sent for ${r?.time_to_open || seconds} seconds (${r?.command || 'OPEN_WALL'})`);
    } catch (err:any) {
      setArduinoStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }



  async function connectScannerFromManager() {
    if (!scannerMac) return setScannerStatusText('Enter scanner MAC address / fragment first');
    setBusy(true);
    setScannerStatusText('Scanning for scanner and connecting...');
    try {
      const r = await window.scannerApi.testConnection(scannerMac);
      setScannerStatusText(r.message || (r.connected ? 'Scanner connected' : 'Scanner not connected'));
      localStorage.setItem('c2m-scanner-mac', scannerMac);
    } catch (err:any) {
      setScannerStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  
  async function getScannerVersionFromManager() {
    if (!scannerMac) return setScannerStatusText('Enter scanner MAC address / fragment first');
    setBusy(true);
    setScannerStatusText('Getting scanner version...');
    try {
      localStorage.setItem('c2m-scanner-mac', scannerMac);
      const r = await window.scannerApi.getVersion(scannerMac, 5000);
      setScannerVersion(r.version || '');
      setScannerStatusText(r.message || 'Version command completed');
    } catch (err:any) {
      setScannerStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

async function readScannerValue() {
    if (!scannerMac) return setScannerStatusText('Enter scanner MAC address / fragment first');
    setBusy(true);
    setScannerStatusText('Waiting for scanner data...');
    try {
      const r = await window.scannerApi.readScan(scannerMac, Number(appSettings?.scannerReadTimeoutMs || 20000));
      const value = r.value || '';
      setScannerReadValue(value);
      setScannerStatusText(`Scanner read: ${value} -> keyboard input sent`);
      // Keyboard injection is handled globally by ScannerKeyboardBridge.
      localStorage.setItem('c2m-scanner-mac', scannerMac);
    } catch (err:any) {
      setScannerStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function scanBleDevices() {
    setBusy(true);
    setScannerStatusText('Scanning BLE devices...');
    try {
      const devices = await window.scannerApi.scanAvailable(10000);
      setScannerDevices(devices || []);
      setScannerStatusText(`Found ${devices?.length || 0} BLE device(s)`);
    } catch (err:any) {
      setScannerStatusText(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadPorts(); }, []);

  // scanner:getLastValue poll - automatically catches scans after scanner is connected
  useEffect(() => {
    let disposed = false;
    const timer = setInterval(async () => {
      if (disposed || activeTab !== 'scanner') return;
      try {
        const r = await window.scannerApi.getLastValue();
        if (r?.hasValue) {
          const value = r.value || '';
          setScannerReadValue(value);
          setScannerStatusText(`Scanner read: ${value} -> keyboard input sent`);
          // Display only. Keyboard injection is handled by ScannerKeyboardBridge with de-duplication.
        }
      } catch {}
    }, 250);
    return () => { disposed = true; clearInterval(timer); };
  }, [activeTab]);

  return <section className="deviceManagerOnePage">
    <div className="panel deviceFullPanel">
      <h2>Device Manager</h2>
      <div className="deviceManagerGrid">
        <section className="deviceSection">
          <h3>Connect devices</h3>
          <div className="twoCol deviceConnectGrid">
            <div>
              <h4>NFC PN532</h4>
              <label>NFC port</label>
              <div className="row"><select value={nfcPort} onChange={e=>setNfcPort(e.target.value)}><option value="">Choose NFC port</option>{nfcPorts.map((p:any)=><option key={p.path} value={p.path}>{p.label || p.path}</option>)}</select><button onClick={loadPorts} disabled={busy}>Refresh</button></div>
              <button onClick={onDetectNfc} disabled={busy}>Auto select NFC</button>
              <button className="secondary" onClick={testNfc} disabled={busy||!nfcPort}>Test NFC connection</button>
              <div className={noticeClass(nfcStatusText || deviceState?.nfc?.message || 'NFC status ready')}>{nfcStatusText || deviceState?.nfc?.message || 'NFC status ready'}</div>
            </div>
            <div>
              <h4>Arduino</h4>
              <label>Arduino port</label>
              <div className="row"><select value={arduinoPort} onChange={e=>setArduinoPort(e.target.value)}><option value="">Choose Arduino port</option>{arduinoPorts.map((p:any)=><option key={p.path} value={p.path}>{p.label || p.path}</option>)}</select><button onClick={loadPorts} disabled={busy}>Refresh</button></div>
              <button onClick={onDetectArduino} disabled={busy}>Auto select Arduino</button>
              <button className="secondary" onClick={testArduino} disabled={busy||!arduinoPort}>Test Arduino connection</button>
              <div className={noticeClass(arduinoStatusText || deviceState?.arduino?.message || 'Arduino status ready')}>{arduinoStatusText || deviceState?.arduino?.message || 'Arduino status ready'}</div>
            </div>
          </div>
        </section>
        <section className="deviceSection">
          <h3>NFC actions</h3>
          <div className="twoCol">
            <div>
              <label className="checkboxLine"><input type="checkbox" checked={nfcImmediate} onChange={e=>setNfcImmediate(e.target.checked)}/> Immediate NFC action</label>
              <label>Delay before NFC action (ms)</label><input type="number" value={nfcDelayMs} onChange={e=>setNfcDelayMs(Number(e.target.value))} disabled={nfcImmediate}/>
              <label>NFC detect timeout (ms)</label><input type="number" value={nfcTimeoutMs} onChange={e=>setNfcTimeoutMs(Number(e.target.value))}/>
              <button onClick={readNfcTagContent} disabled={busy||!nfcPort}>Read NFC Tag</button>
              <label>Read value</label><input value={readText} readOnly placeholder="NFC tag content"/>
            </div>
            <div>
              <label>Value to write</label><textarea className="nfcTextArea" value={writeValue} onChange={e=>setWriteValue(e.target.value)} placeholder="Enter NFC value to write"/>
              <button onClick={writeTag} disabled={busy||!nfcPort||!writeValue}>Write NFC Tag</button>
              <div className={noticeClass(nfcStatusText || 'NFC status ready')}>{nfcStatusText || 'NFC status ready'}</div>
            </div>
          </div>
        </section>
        <section className="deviceSection">
          <h3>Arduino actions</h3>
          <div className="rightPanelActions testButtons"><button onClick={readBattery} disabled={busy||!arduinoPort}>Read battery / charging</button><button onClick={turnTopLedOn} disabled={busy||!arduinoPort}>Turn top LED green on</button><button onClick={turnHandleLedOn} disabled={busy||!arduinoPort}>Turn handle LED green on</button><button className="secondary" onClick={turnAllLedsOff} disabled={busy||!arduinoPort}>Turn LEDs off</button><button className="openWallBtn" onClick={openWallFromDeviceManager} disabled={busy||!arduinoPort}>Open Wall</button></div>
          <div className={noticeClass(arduinoStatusText || 'Arduino status ready')}>{arduinoStatusText || 'Arduino status ready'}</div>
          {battery&&<div className="nfcSummary"><strong>Battery</strong><span>Battery: {battery.batteryPercent}%</span><span>Charging: {battery.charging ? 'Yes' : 'No'}</span><span>Time to full: {battery.averageTimeToFullMinutes} min</span><span>Runtime to empty: {battery.runTimeToEmptyMinutes} min</span></div>}
        </section>
        <section className="deviceSection">
          <h3>Scanner</h3>
          <div className="twoCol"><div><label>Scanner MAC address / fragment</label><input value={scannerMac} onChange={e=>{setScannerMac(e.target.value); localStorage.setItem('c2m-scanner-mac', e.target.value);}} placeholder="Example: DC0303D3E7C"/><button onClick={connectScannerFromManager} disabled={busy||!scannerMac}>Connect scanner</button><button onClick={readScannerValue} disabled={busy||!scannerMac}>Read scanner value</button><button className="secondary" onClick={getScannerVersionFromManager} disabled={busy||!scannerMac}>Get version</button><button className="secondary" onClick={scanBleDevices} disabled={busy}>Scan BLE devices</button><div className={noticeClass(scannerStatusText || deviceState?.scanner?.message || 'Scanner status ready')}>{scannerStatusText || deviceState?.scanner?.message || 'Scanner status ready'}</div></div><div><label>Last scanned value</label><input value={scannerReadValue} readOnly placeholder="Scanner result"/><div className="statusHint">Keyboard mode is enabled: scanned values are typed once into the focused input.</div>{scannerVersion&&<div className="nfcSummary"><strong>Scanner version</strong><span>{scannerVersion}</span></div>}</div></div>
          {scannerDevices.length>0&&<div className="tableWrap"><table className="nfcTable"><thead><tr><th>Name</th><th>MAC</th><th>RSSI</th></tr></thead><tbody>{scannerDevices.map((d:any,i:number)=><tr key={d.id||i}><td>{d.name||'-'}</td><td className="mono">{d.id||d.address||'-'}</td><td>{d.rssi||'-'}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="deviceSection">
          <div className="toolbar"><h3>Read NFC Data</h3><button onClick={readNfcData} disabled={busy||!nfcPort}>Read NFC Data</button></div>
          {!readResult&&<div className="emptyState">Read NFC data to show full NFC page table.</div>}
          {readResult&&<><div className="nfcSummary"><strong>UID: {readResult.uid}</strong><span>User text: {readResult.userText || '(empty)'}</span></div><div className="tableWrap"><table className="nfcTable"><thead><tr><th>Page</th><th>Hex</th><th>ASCII</th><th>Label</th><th>Writable</th></tr></thead><tbody>{readResult.pages.map((p:any)=><tr key={p.page}><td>{p.page}</td><td className="mono">{p.hex}</td><td className="mono">{p.ascii}</td><td>{p.label}</td><td>{p.writable ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></>}
        </section>
      </div>
    </div>
  </section>
}
function SettingsWindow({ lang }: {lang:Lang}) {
  const [settings, setSettings] = useState<any>(DEFAULT_APP_SETTINGS);
  const [msg, setMsg] = useState('');
  const [scannerDevices, setScannerDevices] = useState<any[]>([]);

  async function load() {
    setSettings({ ...DEFAULT_APP_SETTINGS, ...await window.settingsApi.read() });
  }
  async function save() {
    const saved = await window.settingsApi.save(settings);
    setSettings(saved);
    setMsg('Settings saved');
  }
  async function reset() {
    const saved = await window.settingsApi.reset();
    setSettings(saved);
    setMsg('Settings reset to defaults');
  }
  async function scanBle() {
    setMsg('Scanning BLE devices...');
    try {
      const devices = await window.scannerApi.scanAvailable(10000);
      setScannerDevices(devices || []);
      setMsg(`Found ${devices?.length || 0} BLE device(s)`);
    } catch (err:any) {
      setMsg(err?.message || String(err));
    }
  }
  function update(key:string, value:any) {
    setSettings((s:any) => ({ ...s, [key]: value }));
  }
  useEffect(() => { load(); }, []);

  return <main className="settingsWindow" dir={lang==='he'?'rtl':'ltr'}>
    <div className="panel settingsPanel">
      <h2>Settings</h2><div className="notice successNotice">Build version: {APP_VERSION}</div>
      <div className="settingsGrid">
        <label>NFC / cell test timeout (ms)</label>
        <input type="number" value={settings.nfcActionTimeoutMs} onChange={e=>update('nfcActionTimeoutMs', Number(e.target.value))}/>
        <label>Charge detection timeout (ms)</label>
        <input type="number" value={settings.chargeDetectTimeoutMs} onChange={e=>update('chargeDetectTimeoutMs', Number(e.target.value))}/>
        <label>Open Wall duration (seconds)</label>
        <input type="number" min="1" max="99" value={settings.openWallDurationSec ?? 10} onChange={e=>update('openWallDurationSec', Number(e.target.value))}/>
        <label>NFC action delay (ms)</label>
        <input type="number" value={settings.nfcActionDelayMs} onChange={e=>update('nfcActionDelayMs', Number(e.target.value))}/>
        <label>Immediate NFC action</label>
        <label className="checkboxLine"><input type="checkbox" checked={Boolean(settings.nfcImmediateAction)} onChange={e=>update('nfcImmediateAction', e.target.checked)}/> Enabled</label>
        <label>Scanner read timeout (ms)</label>
        <input type="number" value={settings.scannerReadTimeoutMs} onChange={e=>update('scannerReadTimeoutMs', Number(e.target.value))}/>
        <label>Auto-connect scanner on app load</label>
        <label className="checkboxLine"><input type="checkbox" checked={Boolean(settings.scannerAutoConnect ?? true)} onChange={e=>update('scannerAutoConnect', e.target.checked)}/> Enabled</label>
        <label>Scanner keyboard mode</label>
        <label className="checkboxLine"><input type="checkbox" checked={Boolean(settings.scannerKeyboardMode ?? true)} onChange={e=>update('scannerKeyboardMode', e.target.checked)}/> Enabled</label>
        <label>Scanner keyboard suffix</label>
        <select value={settings.scannerKeyboardSuffix || 'enter'} onChange={e=>update('scannerKeyboardSuffix', e.target.value)}>
          <option value="none">None</option>
          <option value="enter">Enter</option>
          <option value="tab">Tab</option>
        </select>
        <h3 className="settingsSectionTitle">Cloud connection</h3>
        <div></div>
        <label>Cloud mode</label>
        <div className="notice successNotice">Real cloud only. Local DB fallback is disabled.</div>
        <label>Cloud Base URL</label>
        <input value={settings.cloudBaseUrl || ''} onChange={e=>update('cloudBaseUrl', e.target.value)} placeholder="https://... or https://.../check-in-stations"/>
        <label>Retailer Base URL</label><input value={settings.retailerBaseUrl||''} onChange={e=>setSettings({...settings, retailerBaseUrl:e.target.value})}/><label>OAuth Token URL</label>
        <input value={settings.cloudTokenUrl || ''} onChange={e=>update('cloudTokenUrl', e.target.value)} placeholder="https://.../oauth2/token"/>
        <label>OAuth Client ID</label>
        <input value={settings.cloudClientId || ''} onChange={e=>update('cloudClientId', e.target.value)} />
        <label>OAuth Client Secret</label>
        <input type="password" value={settings.cloudClientSecret || ''} onChange={e=>update('cloudClientSecret', e.target.value)} />
        <label>Cloud request timeout (ms)</label>
        <input type="number" value={settings.cloudRequestTimeoutMs || 30000} onChange={e=>update('cloudRequestTimeoutMs', Number(e.target.value))}/>
      </div>
      <div className="row settingsActions">
        <button onClick={save}>Save settings</button>
        <button className="secondary" onClick={reset}>Reset defaults</button>
      </div>
      {msg&&<div className={noticeClass(msg)}>{msg}</div>}
    </div>
  </main>
}

function BackHomeButton({ onClick }: { onClick: ()=>void }) {
  return <button className="backHomeBtn" type="button" onClick={onClick}>← Back to Home</button>;
}


function ChargingWallIllustration() {
  return <div className="cwIllustration">
    <div className="cwGrid">
      {Array.from({length:20}).map((_,i)=><div key={i} className="cwSlot"><span></span></div>)}
    </div>
    <div className="cwBaseScreen"></div>
  </div>;
}

function StationIllustration() {
  return <div className="stationIllustration">
    {Array.from({length:4}).map((_,wall)=><div className="stationMiniWall" key={wall}>
      <div className="stationMiniGrid">
        {Array.from({length:20}).map((_,i)=><div key={i} className="stationMiniSlot"></div>)}
      </div>
      <div className="stationMiniBase"></div>
    </div>)}
  </div>;
}

function Home({ lang, setTab }: {lang:Lang; setTab:(tab:string)=>void}) {
  return <section className="wireHome">
    <div className="wireHomeCard">
      <h2>CHARGING WALL</h2>
      <div className="wireHomeContent">
        <div className="wireProduct wallProduct"><ChargingWallIllustration /></div>
        <div className="wireActionList">
          <button onClick={()=>setTab('setupWall')}><i>↗</i><span><strong>Set up new wall</strong><small>Create and configure a new charging wall.</small></span><b>›</b></button>
          <button onClick={()=>setTab('editWall')}><i>✎</i><span><strong>Edit or proceed setup of existing wall</strong><small>Continue setup or edit existing wall.</small></span><b>›</b></button>
          <button onClick={()=>setTab('testSlot')}><i>⌕</i><span><strong>Test specific slot</strong><small>Test any slot on the wall.</small></span><b>›</b></button>
        </div>
      </div>
    </div>
    <div className="wireHomeCard">
      <h2>CHECK-IN STATION</h2>
      <div className="wireHomeContent">
        <div className="wireProduct stationProduct"><StationIllustration /></div>
        <div className="wireActionList">
          <button onClick={()=>setTab('createStation')}><i>↗</i><span><strong>Set up Check-in Station</strong><small>Create and configure a new check-in station.</small></span><b>›</b></button>
          <button onClick={()=>setTab('db')}><i>☷</i><span><strong>Show Check-in Stations</strong><small>View all check-in stations and their status.</small></span><b>›</b></button>
          <button onClick={()=>setTab('deviceManager')}><i>⚙</i><span><strong>Device Manager</strong><small>Manage connected devices.</small></span><b>›</b></button>
        </div>
      </div>
    </div>
  </section>;
}

function ScannerKeyboardBridge({ appSettings }: { appSettings: any }) {
  const [lastValue, setLastValue] = useState('');
  const lastInjectedRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });

  useEffect(() => {
    let disposed = false;

    const timer = setInterval(async () => {
      if (disposed) return;
      if (!(appSettings?.scannerKeyboardMode ?? true)) return;

      try {
        const r = await window.scannerApi.getLastValue();
        if (r?.hasValue && r.value) {
          const value = String(r.value);
          const now = Date.now();

          // Scanner data can be observed by more than one renderer window.
          // Prevent the same barcode from being injected twice into the focused field.
          if (lastInjectedRef.current.value === value && now - lastInjectedRef.current.at < 1500) {
            return;
          }

          lastInjectedRef.current = { value, at: now };
          setLastValue(value);
          dispatchScannerKeyboardValue(value, appSettings?.scannerKeyboardSuffix || 'enter');
        }
      } catch {
        // Ignore polling errors. Device Manager status remains the diagnostic surface.
      }
    }, 200);

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [appSettings?.scannerKeyboardMode, appSettings?.scannerKeyboardSuffix]);

  return <div className="scannerKeyboardBridge" title="Last scanner keyboard value">{lastValue ? `Scanner: ${lastValue}` : ''}</div>;
}


class ErrorBoundary extends React.Component<{children: React.ReactNode}, {error: any}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) { return { error }; }
  componentDidCatch(error: any, info: any) {
    try { console.error('Renderer ErrorBoundary crash', error, info); } catch {}
  }
  render() {
    if (this.state.error) {
      return <main className="fatalErrorScreen">
        <h1>Application UI error</h1>
        <p>The app caught a renderer error instead of showing a blank screen.</p>
        <pre>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
        <p>Open File → Open cloud log folder and send the log file.</p>
      </main>;
    }
    return this.props.children;
  }
}

window.addEventListener('error', (event) => {
  try { console.error('Renderer window error', event.error || event.message); } catch {}
});
window.addEventListener('unhandledrejection', (event) => {
  try { console.error('Renderer unhandled rejection', event.reason); } catch {}
});

function App(){
  const saved = loadDeviceState();
  const [tab,setTab]=useState('home');
  const [lang,setLang]=useState<Lang>('en');
  const [lightMode,setLightMode]=useState(false);
  const [appSettings,setAppSettings]=useState<any>(DEFAULT_APP_SETTINGS);
  const [nfcStatus,setNfcStatusRaw]=useState<any>(saved.nfc || {connected:false,portPath:'',message:'Not checked yet'});
  const [arduinoStatus,setArduinoStatusRaw]=useState<any>(saved.arduino || {connected:false,portPath:'',message:'Not checked yet'});
  const [scannerStatus,setScannerStatusRaw]=useState<any>(saved.scanner || {connected:false,mac:'',message:'Not checked yet'});

  const t=i18n[lang];
  const isDeviceManager=window.location.hash==='#device-manager';
  const isSettings=window.location.hash==='#settings';

  useEffect(()=>{
    window.settingsApi.read()
      .then((s:any)=>setAppSettings({...DEFAULT_APP_SETTINGS,...s}))
      .catch(()=>setAppSettings(DEFAULT_APP_SETTINGS));
  },[]);

  const deviceState = useMemo(()=>({nfc:nfcStatus, arduino:arduinoStatus, scanner:scannerStatus}),[nfcStatus,arduinoStatus,scannerStatus]);

  function persist(next:any){
    saveDeviceState({
      nfc: next.nfc ?? nfcStatus,
      arduino: next.arduino ?? arduinoStatus,
      scanner: next.scanner ?? scannerStatus
    });
  }

  function updateNfcStatus(s:any){
    if(s?.connected&&s?.portPath) window.__c2mNfcPort=s.portPath;
    setNfcStatusRaw(s);
    persist({nfc:s});
  }

  function updateArduinoStatus(s:any){
    if(s?.connected&&s?.portPath) window.__c2mArduinoPort=s.portPath;
    setArduinoStatusRaw(s);
    persist({arduino:s});
  }

  function updateScannerStatus(s:any){
    setScannerStatusRaw(s);
    persist({scanner:s});
  }

  async function detectNfc(){
    setNfcStatusRaw((s:any)=>({...s,connected:false,message:'Detecting NFC...'}));
    try{
      const r=await window.nfcApi.autoDetectPort();
      if(r?.portPath) updateNfcStatus({connected:true,portPath:r.portPath,message:'PN532 connected'});
      else updateNfcStatus({connected:false,portPath:'',message:'PN532 not detected'});
    }catch(e:any){
      updateNfcStatus({connected:false,portPath:'',message:errorText(e)});
    }
  }

  async function detectArduino(){
    setArduinoStatusRaw((s:any)=>({...s,connected:false,message:'Detecting Arduino...'}));
    try{
      const r=await window.arduinoApi.autoDetectPort();
      if(r?.portPath) updateArduinoStatus({connected:true,portPath:r.portPath,message:'Arduino connected',version:r.version});
      else updateArduinoStatus({connected:false,portPath:'',message:'Arduino not detected'});
    }catch(e:any){
      updateArduinoStatus({connected:false,portPath:'',message:errorText(e)});
    }
  }

  async function detectScanner(){
    setScannerStatusRaw((s:any)=>({...s,connected:false,message:'Detecting scanner...'}));
    try{
      const settings = await window.settingsApi.read().catch(()=>appSettings);
      const mac=localStorage.getItem('c2m-scanner-mac') || '';
      if(!mac){
        updateScannerStatus({connected:false,mac:'',message:'Scanner MAC is not configured'});
        return;
      }
      const r=await window.scannerApi.testConnection(mac);
      if (r?.connected) localStorage.setItem('c2m-scanner-mac', mac);
      updateScannerStatus(r);
    }catch(e:any){
      updateScannerStatus({connected:false,mac:'',message:errorText(e)});
    }
  }

  useEffect(()=>{
    if(saved.nfc?.connected&&saved.nfc?.portPath) window.__c2mNfcPort=saved.nfc.portPath; else detectNfc();
    if(saved.arduino?.connected&&saved.arduino?.portPath) window.__c2mArduinoPort=saved.arduino.portPath; else detectArduino();
  },[]);

  // v38 scanner auto connect
  useEffect(() => {
    window.settingsApi.read().then((settings:any) => {
      const mac = localStorage.getItem('c2m-scanner-mac') || settings?.scannerMacFragment;
      if (mac && (settings?.scannerAutoConnect ?? true)) {
        detectScanner();
      }
    }).catch(()=>{});
  }, []);

  if(isSettings){
    return <SettingsWindow lang={lang}/>;
  }

  if(isDeviceManager){
    return <main className={lightMode ? 'lightMode' : ''} dir={lang==='he'?'rtl':'ltr'}>
      <Header lightMode={lightMode} setLightMode={setLightMode} lang={lang} setLang={setLang} t={t} nfcStatus={nfcStatus} arduinoStatus={arduinoStatus} scannerStatus={scannerStatus} onDetectNfc={detectNfc} onDetectArduino={detectArduino} onDetectScanner={detectScanner}/>
      <ScannerKeyboardBridge appSettings={appSettings}/>
      <section className="appContent">
        <DeviceManager deviceState={deviceState} appSettings={appSettings} onNfcStatusChange={updateNfcStatus} onArduinoStatusChange={updateArduinoStatus} onDetectNfc={detectNfc} onDetectArduino={detectArduino} onDetectScanner={detectScanner}/>
      </section>
      <footer className="appFooter"><span>Version {APP_VERSION}</span><span>© 2025 Cust2Mate Inc.</span><span className="footerHelp">? &nbsp; Help & Support</span></footer>
    </main>;
  }

  return <main className={lightMode ? 'lightMode' : ''} dir={lang==='he'?'rtl':'ltr'}>
    <Header lightMode={lightMode} setLightMode={setLightMode} lang={lang} setLang={setLang} t={t} nfcStatus={nfcStatus} arduinoStatus={arduinoStatus} scannerStatus={scannerStatus} onDetectNfc={detectNfc} onDetectArduino={detectArduino} onDetectScanner={detectScanner}/>
    <ScannerKeyboardBridge appSettings={appSettings}/>
    <section className="appContent">
      {tab==='home'&&<Home lang={lang} setTab={setTab}/>}
      {tab==='setupWall'&&<GuidedWallSetup lang={lang} deviceState={deviceState} appSettings={appSettings} onFinish={()=>setTab('home')}/>}
      {tab==='editWall'&&<ConfigWall lang={lang} deviceState={deviceState} appSettings={appSettings} guidedTitle="Edit / proceed existing wall" onFinish={()=>setTab('home')}/>}
      {tab==='createWall'&&<GuidedWallSetup lang={lang} deviceState={deviceState} appSettings={appSettings} onFinish={()=>setTab('home')}/>}
      {tab==='configWall'&&<ConfigWall lang={lang} deviceState={deviceState} appSettings={appSettings} onFinish={()=>setTab('home')}/>}
      {tab==='createStation'&&<CreateStation lang={lang} appSettings={appSettings} onFinish={()=>setTab('home')}/>}
      {tab==='db'&&<DbViewer lang={lang} onFinish={()=>setTab('home')}/>}
      {tab==='testSlot'&&<TestSpecificSlot lang={lang} onFinish={()=>setTab('home')}/>}
      {tab==='deviceManager'&&<section className="deviceManagerScreen"><BackHomeButton onClick={()=>setTab('home')}/><DeviceManager deviceState={deviceState} appSettings={appSettings} onNfcStatusChange={updateNfcStatus} onArduinoStatusChange={updateArduinoStatus} onDetectNfc={detectNfc} onDetectArduino={detectArduino} onDetectScanner={detectScanner}/></section>}
    </section>
    <footer className="appFooter"><span>Version {APP_VERSION}</span><span>© 2025 Cust2Mate Inc.</span><span className="footerHelp">? &nbsp; Help & Support</span></footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);
