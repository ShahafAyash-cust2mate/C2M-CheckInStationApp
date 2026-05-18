import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import cust2mateLogo from './assets/cust2mate-logo.webp';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));


type Row = Record<string, any>;
type Lang = 'he' | 'en';
type DeviceStatus = { connected: boolean; portPath: string; message: string; version?: string };

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
  return <div className={`wallCanvas ${compact?'compactWall':''}`} dir="ltr" style={{gridTemplateColumns:`repeat(${model.ColumnCount}, ${compact?44:74}px)`, gridTemplateRows:`repeat(${model.RowCount}, ${compact?78:118}px)`}}>{cells}</div>;
}

function Header({ lang, setLang, t, nfcStatus, arduinoStatus, scannerStatus, onDetectNfc, onDetectArduino, onDetectScanner }: any) {
  return <header className="topHeader">
    <div className="headerLeft"><Logo/><div><h1>{t.title}</h1></div></div>
    <div className="headerRight">
      <button type="button" className={`deviceIndicator ${nfcStatus?.connected ? 'connected' : 'disconnected'}`} onClick={onDetectNfc} title="Run NFC auto-detect"><span className="deviceDot"></span><div><strong>NFC</strong><small>{nfcStatus?.connected ? `Connected (${nfcStatus.portPath})` : 'Disconnected'}</small></div></button>
      <button type="button" className={`deviceIndicator ${arduinoStatus?.connected ? 'connected' : 'disconnected'}`} onClick={onDetectArduino} title="Run Arduino auto-detect"><span className="deviceDot"></span><div><strong>Arduino</strong><small>{arduinoStatus?.connected ? `Connected (${arduinoStatus.portPath})` : 'Disconnected'}</small></div></button>
      <button type="button" className={`deviceIndicator ${scannerStatus?.connected ? 'connected' : 'disconnected'}`} onClick={onDetectScanner} title="Run scanner connection test">
        <span className="deviceDot"></span>
        <div>
          <strong>Scanner</strong>
          <small>{scannerStatus?.connected ? `Connected (${scannerStatus.mac || 'BLE'})` : 'Disconnected'}</small>
        </div>
      </button>
      <label className="languageSwitch">{t.language}<select value={lang} onChange={e=>setLang(e.target.value)}><option value="en">English</option><option value="he">עברית</option></select></label>
    </div>
  </header>;
}
function Tabs({ tab, setTab, t }: any) {
  const tabs = [['home', t.home], ['createWall', t.createWall], ['configWall', t.configWall], ['createStation', t.createStation], ['db', t.db]];
  return <nav className="tabs">{tabs.map(([k,l])=><button key={k} className={tab===k?'active':''} onClick={()=>setTab(k)}>{l}</button>)}</nav>;
}


function ClearableTextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="clearableInputWrap">
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      <button type="button" className="clearInputBtn" onClick={() => onChange('')} aria-label={`Clear ${placeholder}`} title="Clear">×</button>
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

function CreateWall({ lang, appSettings }: {lang:Lang; appSettings:any}) {
  const t=i18n[lang];
  const [models,setModels]=useState<Row[]>([]);
  const [serial,setSerial]=useState('');
  const [screenSerial,setScreenSerial]=useState('');
  const [modelId,setModelId]=useState('');
  const [msg,setMsg]=useState('');
  useEffect(()=>{window.cloudApi.getWallModels().then((m:Row[])=>{setModels(m); if(m[0]) setModelId(String(m[0].ChargingWallModelId));}).catch((e:any)=>setMsg(errorText(e)));},[]);
  useEffect(()=>{
    const autoModel = bestModelForSerial(models, serial);
    if (autoModel) setModelId(String(autoModel.ChargingWallModelId));
  }, [serial, models]);
  const serialModelTarget = targetHasWelcomeScreenFromSerial(serial);
  const visibleModels = serialModelTarget === null ? models : models.filter(m => Boolean(m?.HasWelcomeScreen) === serialModelTarget);
  const model=models.find(m=>String(m.ChargingWallModelId)===modelId)||null;
  async function submit(){
    setMsg('');
    try {
      const row=await window.cloudApi.createWall({SerialNumber:serial.trim(),ChargingWallModelId:Number(modelId),WelcomeScreenSerialNumber:screenSerial.trim()||null});
      setMsg(`ChargingWallId: ${row.ChargingWallId}`); setSerial(''); setScreenSerial('');
    } catch (e:any) { setMsg(errorText(e)); }
  }
  return <section className="pageGrid"><div className="panel formPanel"><h2>{t.createWall}</h2><label>{t.serial}</label><ClearableTextInput value={serial} onChange={setSerial} placeholder={t.serial}/><label>{t.wallModel}</label><select value={modelId} onChange={e=>setModelId(e.target.value)}>{visibleModels.map(m=><option key={m.ChargingWallModelId} value={m.ChargingWallModelId}>{modelOptionLabel(m)}</option>)}</select>{serialModelTarget!==null&&<div className="fieldHint">Model auto-selected by barcode prefix: {serial.trim().startsWith('11')?'11 = without welcome screen':'12 = with welcome screen'}</div>}{model?.HasWelcomeScreen&&<><label>{t.welcomeSerial}</label><ClearableTextInput value={screenSerial} onChange={setScreenSerial} placeholder={t.welcomeSerial}/></>}<button onClick={submit}>{t.saveWall}</button>{msg&&<div className="notice">{msg}</div>}</div><div className="panel previewPanel"><h2>{t.modelPreview}</h2><WallPreview model={model} t={t}/></div></section>;
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

function ConfigWall({ lang, deviceState, appSettings }: {lang:Lang; deviceState:any; appSettings:any}) {
  const t=i18n[lang];
  const [wallSerial,setWallSerial]=useState('');
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

  async function findWallBySerial(){
    setMsg('');
    setPassed([]); setFailed([]); setIdx(0); setCountdownMs(null); setWallTestMode(false); setTestInstruction(null); setTestViewActive(false);
    try {
      const wall = await window.cloudApi.getUnassignedWallBySerial(wallSerial.trim());
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
        {msg&&<div className="notice">{msg}</div>}
      </> : <>
        <h2>{t.configWall}</h2>
        <label>Charging wall serial</label>
        <div className="row serialFindRow"><ClearableTextInput value={wallSerial} onChange={setWallSerial} placeholder="Enter charging wall serial"/><button onClick={findWallBySerial}>Find wall</button></div>
        {details?.model?.HasWelcomeScreen&&<><label>{t.welcomeSerial}</label><ClearableTextInput value={screenSerial} onChange={setScreenSerial} placeholder={t.welcomeSerial}/></>}
        <div className="progress">{passed.length}/{alloc.length}</div>
        {countdownMs!==null&&<div className="countdownBox"><div>Timeout: <strong>{countdownSec}</strong>s</div><div className="timeoutBar"><span style={{width:`${countdownPct}%`}}></span></div></div>}
        <button onClick={startCurrentSlotTest} disabled={!currentItem}>{t.testSlot}</button>
        <button onClick={startWallTest} disabled={!alloc.length}>Start wall test from selected slot</button>
        {(failed.length>0 || msg.includes('stopped')) && <button className="continueBtn" onClick={startWallTest} disabled={!alloc.length}>Continue wall test from Slot {currentItem?.SlotNumber || ''}</button>}
        <button className="secondary" onClick={save} disabled={!alloc.length||passed.length!==alloc.length}>{t.submit}</button>
        {msg&&<div className="notice">{msg}</div>}
      </>}
    </div>
    <div className="panel previewPanel">
      <h2>{t.configWall}</h2>
      <p>{currentItem?`${t.currentSlot}: ${currentItem.SlotNumber}`:''}</p>
      <div className="wallWithSerials">
        <WallPreview model={details?.model||null} t={t} activeSlot={currentItem?.SlotNumber} completedSlots={passed} failedSlots={failed} onSlotClick={selectSlot}/>
        <div className="nfcSerialList">
          <h3>{t.nfcSerials}</h3>
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
            <div className="wallPropLine"><strong>Wall #{i}</strong></div>
            <div className="wallPropLine mono">{w.SerialNumber}</div>
            <div className="wallPropLine">{w.ModelInfo?.Model}</div>
            <div className="wallPropLine welcomeLine">{w.ModelInfo?.HasWelcomeScreen ? `Welcome: ${w.WelcomeScreenSerial || 'Missing'}` : '\u00A0'}</div>
            <em className={`statusPill ${statusClass(w.Status)}`}>{statusLabel(w.Status)}</em>
          </div>
          <div className="linkedWallPreviewWrap"><WallPreview model={w.ModelInfo} t={t} compact/></div>
        </div>
      ))}
    </div>
  </div>;
}

function CreateStation({ lang, appSettings }: {lang:Lang; appSettings?: any}) {
  const t=i18n[lang];
  const [customers,setCustomers]=useState<Row[]>([]); const [customerId,setCustomerId]=useState(''); const [stores,setStores]=useState<Row[]>([]); const [storeId,setStoreId]=useState('');
  const [name,setName]=useState(''); const [wallSerial,setWallSerial]=useState(''); const [currentWall,setCurrentWall]=useState<Row|null>(null); const [selectedWalls,setSelectedWalls]=useState<Row[]>([]); const [msg,setMsg]=useState('');
  useEffect(()=>{window.cloudApi.getCustomers().then(setCustomers).catch((e:any)=>setMsg(errorText(e)));},[]);
  useEffect(()=>{if(customerId) window.cloudApi.getStoresByCustomer(customerId).then(setStores).catch((e:any)=>setMsg(errorText(e))); else setStores([]);},[customerId]);
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
      setWallSerial(''); setCurrentWall(null);
    } catch(e:any){setMsg(errorText(e));}
  }
  async function submit(){
    setMsg('');
    try { const r=await window.cloudApi.createCheckInStation({Name:name,StoreId:Number(storeId),Walls:selectedWalls.map(w=>({ChargingWallId:w.ChargingWallId,WelcomeScreenSerial:w.WelcomeScreenSerial||''}))}); setMsg(`${t.station} #${r.CheckInStationId}`); setSelectedWalls([]); setName(''); }
    catch(e:any){setMsg(errorText(e));}
  }
  return <section className="pageGrid horizontalPage">
    <div className="panel formPanel">
      <h2>{t.createStation}</h2>
      <label>{t.stationName}</label>
      <ClearableTextInput value={name} onChange={setName} placeholder={t.stationName}/>
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
      <div className="row serialFindRow"><ClearableTextInput value={wallSerial} onChange={setWallSerial} placeholder="Enter charging wall serial"/><button onClick={findWall}>Find wall</button></div>
      {currentWall&&<div className="miniCard foundWallCard">
        <strong>{currentWall.SerialNumber}</strong>
        <span>{currentWall.ModelInfo?.Model}</span>
        <span className={`statusPill ${statusClass(currentWall.Status)}`}>Status: {statusLabel(currentWall.Status)}</span>
        {currentWall.ModelInfo?.HasWelcomeScreen&&<span>Welcome screen: {currentWall.WelcomeScreenSerial || 'Missing in DB'}</span>}
      </div>}
      <button onClick={addWall} disabled={!currentWall}>{t.addWall}</button>
      <button className="secondary" onClick={submit} disabled={!storeId||!selectedWalls.length}>{t.submit}</button>
      {msg&&<div className="notice">{msg}</div>}
    </div>
    <div className="panel previewPanel">
      <h2>{t.createStation}</h2>
      <StationWallsVisual walls={selectedWalls} t={t}/>
    </div>
  </section>;
}

function DbViewer({ lang }: {lang:Lang}) {
  const t=i18n[lang]; const [db,setDb]=useState<any>(null); const [customer,setCustomer]=useState(''); const [store,setStore]=useState(''); const [showJson,setShowJson]=useState(false);
  async function load(){setDb(await window.cloudApi.getDb())}
  useEffect(()=>{load()},[]);
  if(!db) return <section className="panel"><h2>Loading...</h2></section>;
  const stations=(db.CheckInStations||[]).filter((s:Row)=>(!store||String(s.StoreId)===store));
  return <section className="panel dbPanel">
    <div className="toolbar"><h2>{t.db}</h2><button onClick={load}>Refresh</button></div>
    <div className="filters">
      <select value={customer} onChange={e=>{setCustomer(e.target.value);setStore('')}}><option value="">{t.allRetailers}</option>{(db.Customers||[]).filter((c:Row)=>c.CustomerId).map((c:Row)=><option key={c.CustomerId} value={c.CustomerId}>{c.CustomerName||c.Name||`Customer ${c.CustomerId}`}</option>)}</select>
      <select value={store} onChange={e=>setStore(e.target.value)}><option value="">{t.allStores}</option>{(db.Stores||[]).filter((s:Row)=>s.StoreId&&(!customer||String(s.CustomerId)===customer)).map((s:Row)=><option key={s.StoreId} value={s.StoreId}>{s.StoreName||s.Name||`Store ${s.StoreId}`}</option>)}</select>
    </div>
    {stations.map((s:Row)=>{
      const stationWalls=(db.ChargingWalls||[])
        .filter((w:Row)=>Number(w.CheckInStationId)===Number(s.CheckInStationId))
        .sort((a:Row,b:Row)=>Number(a.ChargingWallIndex)-Number(b.ChargingWallIndex))
        .map((w:Row)=>({
          ...w,
          ModelInfo:(db.ChargingWallModels||[]).find((m:Row)=>Number(m.ChargingWallModelId)===Number(w.ChargingWallModelId))||null,
          WelcomeScreenSerial:((db.WelcomeScreens||[]).find((ws:Row)=>Number(ws.ChargingWallId)===Number(w.ChargingWallId))||{}).SerialNumber||'',
          Status:Number(w.Status||0)
        }));
      return <div key={s.CheckInStationId} className="stationCard">
        <h3>{s.Name||`${t.station} #${s.CheckInStationId}`}</h3>
        <p>StoreId: {s.StoreId}</p>
        <StationWallsVisual walls={stationWalls} t={t}/>
      </div>
    })}
    <button className="textBtn" onClick={()=>setShowJson(!showJson)}>{t.fullJson}</button>
    {showJson&&<pre className="jsonBlock">{JSON.stringify(db,null,2)}</pre>}
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

  return <section className="deviceManagerTabbed">
    <div className="deviceTabs">
      <button className={activeTab==='connect'?'active':''} onClick={()=>setActiveTab('connect')}>Connect devices</button>
      <button className={activeTab==='nfc'?'active':''} onClick={()=>setActiveTab('nfc')}>NFC actions</button>
      <button className={activeTab==='arduino'?'active':''} onClick={()=>setActiveTab('arduino')}>Arduino</button>
      <button className={activeTab==='scanner'?'active':''} onClick={()=>setActiveTab('scanner')}>Scanner</button>
      <button className={activeTab==='data'?'active':''} onClick={()=>setActiveTab('data')}>Read NFC Data</button>
    </div>

    {activeTab==='connect'&&<div className="panel deviceTabPanel">
      <h2>Connect devices</h2>
      <div className="twoCol">
        <div>
          <h3>NFC PN532</h3>
          <label>NFC port</label>
          <div className="row">
            <select value={nfcPort} onChange={e=>setNfcPort(e.target.value)}>
              <option value="">Choose NFC port</option>
              {nfcPorts.map((p:any)=><option key={p.path} value={p.path}>{p.label || p.path}</option>)}
            </select>
            <button onClick={loadPorts} disabled={busy}>Refresh</button>
          </div>
          <button onClick={onDetectNfc} disabled={busy}>Auto select NFC</button>
          <button className="secondary" onClick={testNfc} disabled={busy||!nfcPort}>Test NFC connection</button>
          <div className="statusBar">{nfcStatusText || deviceState?.nfc?.message || 'NFC status ready'}</div>
        </div>
        <div>
          <h3>Arduino</h3>
          <label>Arduino port</label>
          <div className="row">
            <select value={arduinoPort} onChange={e=>setArduinoPort(e.target.value)}>
              <option value="">Choose Arduino port</option>
              {arduinoPorts.map((p:any)=><option key={p.path} value={p.path}>{p.label || p.path}</option>)}
            </select>
            <button onClick={loadPorts} disabled={busy}>Refresh</button>
          </div>
          <button onClick={onDetectArduino} disabled={busy}>Auto select Arduino</button>
          <button className="secondary" onClick={testArduino} disabled={busy||!arduinoPort}>Test Arduino connection</button>
          <div className="statusBar">{arduinoStatusText || deviceState?.arduino?.message || 'Arduino status ready'}</div>
        </div>
      </div>
    </div>}

    {activeTab==='nfc'&&<div className="panel deviceTabPanel">
      <h2>NFC actions</h2>
      <div className="twoCol">
        <div>
          <label className="checkboxLine"><input type="checkbox" checked={nfcImmediate} onChange={e=>setNfcImmediate(e.target.checked)}/> Immediate NFC action</label>
          <label>Delay before NFC action (ms)</label>
          <input type="number" value={nfcDelayMs} onChange={e=>setNfcDelayMs(Number(e.target.value))} disabled={nfcImmediate}/>
          <label>NFC detect timeout (ms)</label>
          <input type="number" value={nfcTimeoutMs} onChange={e=>setNfcTimeoutMs(Number(e.target.value))}/>
          <button onClick={readNfcTagContent} disabled={busy||!nfcPort}>Read NFC Tag</button>
          <label>Read value</label>
          <input value={readText} readOnly placeholder="NFC tag content"/>
        </div>
        <div>
          <label>Value to write</label>
          <textarea className="nfcTextArea" value={writeValue} onChange={e=>setWriteValue(e.target.value)} placeholder="Enter NFC value to write. Max 96 bytes."/>
          <button onClick={writeTag} disabled={busy||!nfcPort||!writeValue}>Write Tag</button>
          {writeResult&&<div className="nfcSummary"><strong>Last write</strong><span>UID: {writeResult.uid}</span><span>Bytes: {writeResult.bytesWritten}</span><span>Pages: {writeResult.pagesWritten}</span></div>}
        </div>
      </div>
      <div className="statusBar">{nfcStatusText || 'NFC status ready'}</div>
    </div>}

    {activeTab==='arduino'&&<div className="panel deviceTabPanel">
      <h2>Arduino</h2>
      <div className="twoCol">
        <div>
          <div className="arduinoActionButtons">
            <button onClick={readBattery} disabled={busy||!arduinoPort}>Read battery / charging</button>
            <button onClick={turnTopLedOn} disabled={busy||!arduinoPort}>Turn top LED green on</button>
            <button onClick={turnHandleLedOn} disabled={busy||!arduinoPort}>Turn handle LED green on</button>
            <button className="secondary" onClick={turnAllLedsOff} disabled={busy||!arduinoPort}>Turn LEDs off</button>
            <button className="openWallBtn" onClick={openWallFromDeviceManager} disabled={busy||!arduinoPort}>Open Wall</button>
          </div>
          <div className="statusBar">{arduinoStatusText || 'Arduino status ready'}</div>
        </div>
        <div>{battery&&<div className="nfcSummary"><strong>Battery</strong><span>Capacity: {battery.batteryPercent}%</span><span>Charging: {battery.charging ? 'Yes' : 'No'}</span><span>Time to full: {battery.averageTimeToFullMinutes} min</span><span>Runtime to empty: {battery.runTimeToEmptyMinutes} min</span></div>}</div>
      </div>
    </div>}

    {activeTab==='scanner'&&<div className="panel deviceTabPanel">
      <h2>Scanner</h2>
      <div className="twoCol">
        <div>
          <label>Scanner MAC address / fragment</label>
          <input value={scannerMac} onChange={e=>{setScannerMac(e.target.value); localStorage.setItem('c2m-scanner-mac', e.target.value);}} placeholder="Example: DC0303D3E7C or 303D:40-c7"/>
          <button onClick={connectScannerFromManager} disabled={busy||!scannerMac}>Connect scanner</button>
          <button onClick={readScannerValue} disabled={busy||!scannerMac}>Read scanner value</button><button className="secondary" onClick={getScannerVersionFromManager} disabled={busy||!scannerMac}>Get version</button>
          <button className="secondary" onClick={scanBleDevices} disabled={busy}>Scan BLE devices</button>
          <div className="statusBar">{scannerStatusText || deviceState?.scanner?.message || 'Scanner status ready'}</div>
        </div>
        <div>
          <label>Last scanned value</label>
          <input value={scannerReadValue} readOnly placeholder="Scanner result"/>
          <div className="statusHint">Keyboard mode is enabled: scanned values are typed once into the focused input.</div>{scannerVersion&&<div className="nfcSummary"><strong>Scanner version</strong><span>{scannerVersion}</span></div>}
        </div>
      </div>
    </div>}

    {activeTab==='data'&&<div className="panel deviceTabPanel nfcResultPanel">
      <div className="toolbar"><h2>Read NFC Data</h2><button onClick={readNfcData} disabled={busy||!nfcPort}>Read NFC Data</button></div>
      {!readResult&&<div className="emptyState">Read NFC data to show full NFC page table.</div>}
      {readResult&&<>
        <div className="nfcSummary"><strong>UID: {readResult.uid}</strong><span>User text: {readResult.userText || '(empty)'}</span></div>
        <div className="tableWrap"><table className="nfcTable"><thead><tr><th>Page</th><th>Hex</th><th>ASCII</th><th>Label</th><th>Writable</th></tr></thead><tbody>{readResult.pages.map((p:any)=><tr key={p.page}><td>{p.page}</td><td className="mono">{p.hex}</td><td className="mono">{p.ascii}</td><td>{p.label}</td><td>{p.writable ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
      </>}
    </div>}
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
      <h2>Settings</h2><div className="notice">Build version: v85 restore working retailer + embedded stores</div>
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
        <div className="notice">Real cloud only. Local DB fallback is disabled.</div>
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
      {msg&&<div className="notice">{msg}</div>}
    </div>
  </main>
}

function Home({ lang }: {lang:Lang}) { const t=i18n[lang]; return <section className="panel homePanel"><h2>{t.home}</h2><p>{t.subtitle}</p></section>; }


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
  const [tab,setTab]=useState('createWall');
  const [lang,setLang]=useState<Lang>('en');
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
    return <main dir={lang==='he'?'rtl':'ltr'}>
      <Header lang={lang} setLang={setLang} t={t} nfcStatus={nfcStatus} arduinoStatus={arduinoStatus} scannerStatus={scannerStatus} onDetectNfc={detectNfc} onDetectArduino={detectArduino} onDetectScanner={detectScanner}/>
      <ScannerKeyboardBridge appSettings={appSettings}/>
      <DeviceManager deviceState={deviceState} appSettings={appSettings} onNfcStatusChange={updateNfcStatus} onArduinoStatusChange={updateArduinoStatus} onDetectNfc={detectNfc} onDetectArduino={detectArduino} onDetectScanner={detectScanner}/>
    </main>;
  }

  return <main dir={lang==='he'?'rtl':'ltr'}>
    <Header lang={lang} setLang={setLang} t={t} nfcStatus={nfcStatus} arduinoStatus={arduinoStatus} scannerStatus={scannerStatus} onDetectNfc={detectNfc} onDetectArduino={detectArduino} onDetectScanner={detectScanner}/>
    <ScannerKeyboardBridge appSettings={appSettings}/>
    <Tabs tab={tab} setTab={setTab} t={t}/>
    {tab==='home'&&<Home lang={lang}/>}
    {tab==='createWall'&&<CreateWall lang={lang} appSettings={appSettings}/>}
    {tab==='configWall'&&<ConfigWall lang={lang} deviceState={deviceState} appSettings={appSettings}/>}
    {tab==='createStation'&&<CreateStation lang={lang} appSettings={appSettings}/>}
    {tab==='db'&&<DbViewer lang={lang}/>}
  </main>;
}

createRoot(document.getElementById('root')!).render(<ErrorBoundary><App/></ErrorBoundary>);