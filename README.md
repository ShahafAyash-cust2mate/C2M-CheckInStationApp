# C2M Check-in Station Setup v13

## New in this version

- Added `data/local-cloud-db-default.json`.
- Added **File -> Reset app data to default**.
- Clicking reset overwrites `data/local-cloud-db.json` with `data/local-cloud-db-default.json` and reloads the app.

You can edit the default values in:

```text
data/local-cloud-db-default.json
```

Runtime app data is stored in:

```text
data/local-cloud-db.json
```

## Run

```cmd
npm install
npm run dev
```


## v14 NFC Cell Test

Added a new **Cell Test** tab.

Features:
- Serial port dropdown.
- Refresh ports.
- Auto detect PN532 port.
- Read NFC tag and show full page table.
- Write NFC tag using UTF-8 string across user pages 6-27.
- Original uploaded PN532 CLI is stored at `src/nfc/pn532-cli-reference.cjs`.
- Reusable PN532 API is in `src/nfc/pn532Service.cjs`.

Install now includes the `serialport` package.


## Windows Installer

This project now supports building a Windows installer for the cart.

### Build installer

```cmd
npm install
npm run dist
```

The installer will be created under:

```text
release/
```

### Build portable version

```cmd
npm run dist:portable
```

### Important data files

Editable default database:

```text
data/local-cloud-db-default.json
```

Runtime database in development:

```text
data/local-cloud-db.json
```

Runtime database after installation is stored in the Windows user data folder:

```text
%APPDATA%\C2M Check-in Station Setup\data\local-cloud-db.json
```

Use **File → Reset app data to default** to overwrite the runtime DB from `local-cloud-db-default.json`.

### NFC / PN532

The installer includes the `serialport` dependency and unpack rules for native serialport binaries.


## Installer build fix

`electron` must be under `devDependencies`, not `dependencies`.
If you already have an old `node_modules` and `package-lock.json`, run:

```cmd
rd /s /q node_modules
del package-lock.json
npm install
npm run dist
```

Output folder:

```text
release/
```


## v16 Installer build without native rebuild

This version disables Electron Builder native module rebuild:

```json
"npmRebuild": false,
"buildDependenciesFromSource": false
```

This avoids the `node-gyp failed to rebuild @serialport/bindings-cpp` error and should create the EXE without requiring Visual Studio to be detected by node-gyp.

Build from a clean folder:

```cmd
rd /s /q node_modules
del package-lock.json
npm install
npm run dist
```

Output:

```text
release/
```


## v17 Blank screen fix

The installed app showed a dark blank screen because the production Vite build used absolute asset paths.
Electron loads the renderer through `file://`, so the renderer assets must be relative.

Fixed in `vite.config.ts`:

```ts
base: './'
```

Build installer:

```cmd
rd /s /q node_modules
del package-lock.json
npm install
npm run dist
```

Then install the new setup from `release/`.

If you already have a working `release/win-unpacked`, you can also create the NSIS setup from it:

```cmd
npm run dist:setup-from-unpacked
```


## v18 NFC API update

Replaced the NFC API behavior with the latest uploaded `pn532.js` logic.

Important NFC change:
- Writable/user page range now starts at page **4**.
- Writable range is now pages **4-27**.
- Max writable text capacity is now **96 bytes**.
- The uploaded CLI file is stored as `src/nfc/pn532-cli-reference.cjs`.
- The app uses the reusable service wrapper at `src/nfc/pn532Service.cjs`.

Build installer:

```cmd
rd /s /q node_modules
del package-lock.json
npm install
npm run dist
```


## v19 Device Manager

Changes:
- Main window resolution changed to 920x1080.
- Cell Test removed from the main tabs.
- Cell Test is now opened from **File -> Device manager** in a separate window.
- App runs PN532 auto-detect on startup.
- Header shows NFC device indicator:
  - green = PN532 connected/responding
  - red = PN532 not connected/responding
- Device Manager includes:
  - serial port dropdown
  - auto detect PN532
  - test selected port
  - read NFC tag
  - write NFC tag

Build installer:
```cmd
npm install
npm run dist
```


## v20 Device Manager update

Changes:
- Main and Device Manager window resolution: 1920x1080.
- Device Manager window is opened from File -> Device manager.
- Device Manager layout:
  - Connect device with port selection and auto select.
  - Read NFC Tag: reads only the tag content/user text.
  - Write Tag: writes a user value.
  - Status bar.
  - Read NFC Data: reads the full page table.
- NFC actions support:
  - immediate mode
  - delayed mode
  - configurable delay before operation
  - configurable NFC detect timeout
- Added Arduino device support based on `ArduinoRev2.cs` protocol:
  - `REQ|id|COMMAND|payload`
  - `GET_VERSIONS` for connection
  - `GET_BATTERY` for battery and charging status
  - `TOP_LED_ON` for green LED
- Added `src/devices/arduinoService.cjs` runtime service.
- Added `src/devices/arduinoService.ts` TypeScript protocol/types reference.
- Header now shows both NFC and Arduino connection indicators.


## v21 LED fix

Fixed Arduino `TOP_LED_ON` payload.

Previous payload sent:

```text
time=729
```

The firmware returned:

```text
LED_INVALID_TIME
```

`ArduinoRev2.cs` uses enum `GetHashCode()` values for `LedLightTime` and `LedDuration`.
For the default LED command, the payload now sends:

```text
red=0;green=255;blue=0;on_duration=0;off_duration=0;time=0
```


## v22 13.3 inch optimization and Configure Charging Wall slot test

Changes:
- UI optimized for 13.3 inch Full HD screen in full-screen / maximized mode.
- Main window and Device Manager open maximized at 1920x1080.
- Added Arduino auto-detect persistence for Configure Charging Wall.
- Added Handle LED command:
  - green on success
  - red on failure
- Configure Charging Wall cell test flow:
  1. Show "Please Enter the Unit into the Slot" and blink/highlight relevant slot.
  2. Wait for charging status via Arduino battery/charging API for 10 seconds.
  3. Write cell serial to NFC tag.
  4. Read NFC tag and compare to expected serial.
  5. Turn handle LED green if all passed, red if failed.

Installer command after win-unpacked exists:
```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v23 compact screen + slot prompt

Changes:
- Reduced vertical height for 13.3 inch Full HD screens.
- Re-enabled scrolling where needed.
- Configure Charging Wall now opens a modal popup:
  - "Please Enter the Unit into the Slot"
  - OK button starts the 10 second charging timeout.
- Added visible charging countdown while waiting for charging detection.


## v24 stability, Arduino detection and layout fix

Changes:
- Fixed Configure Charging Wall crash caused by missing popup/countdown state.
- Header NFC/Arduino indicators are clickable; clicking them runs auto-detect again.
- Arduino auto-detect now waits after opening the port because Arduino boards can reset on serial open.
- Arduino auto-detect retries GET_VERSIONS and better prioritizes USB Serial Device ports.
- Layout rewritten to fit inside the visible screen using compact header, responsive grid and internal scrolling.


## v25 full fix

Changes:
- Configure Charging Wall verifies NFC and Arduino are connected before starting.
- Slot test retries charging, NFC write and NFC read/compare until success or 10 seconds pass.
- Added countdown progress bar.
- Device Manager split into tabs.
- Main indicators and Device Manager share the same connection state using local storage.
- Clicking NFC/Arduino indicators reruns auto-detect.
- Cloud validates unique charging wall and welcome screen serial numbers.

Debug:
```cmd
cd C:\code\CheckInStationSetup
npm install
npm run debug
```

Build portable app:
```cmd
npm run dist
```

Build Setup.exe after `release\win-unpacked` exists:
```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v26 Build fix

Fixed Vite/React build error:

```text
Identifier 'sleep' has already been declared
```

Commands:

Debug:
```cmd
cd C:\code\CheckInStationSetup
npm install
npm run debug
```

Build portable app:
```cmd
npm run dist
```

Build Setup.exe after `release\win-unpacked` exists:
```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v27 tested fix

Fixed and rebuilt cleanly:
- Removed broken duplicate helpers and invalid references.
- Configure Charging Wall verifies NFC and Arduino connection before test.
- Test current slot now retries charging, NFC write, and NFC read/compare until success or 10 seconds pass per step.
- Added countdown progress bar.
- Device Manager split into tabs and shares device state with the main screen.
- Welcome screen serial is entered and validated in Configure Charging Wall and Create Check-in Station.
- Local cloud validates unique charging wall serials and welcome screen serials.

Debug:
```cmd
cd C:\code\CheckInStationSetup
npm install
npm run debug
```

Build portable app:
```cmd
npm run dist
```

Build Setup.exe after `release\win-unpacked` exists:
```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v28 Horizontal wall test

Changes:
- Configure Charging Wall and Create Check-in Station use serial-number text input instead of wall dropdown.
- Added cloud API `getUnassignedWallBySerial`.
- Wall test flow:
  - Start wall test marks the first slot blinking.
  - Each passed slot is marked with ✓.
  - Each failed slot is marked with ✕.
  - After each slot, the flow automatically moves to the next slot.
- NFC write and read/compare retry until success or 10 seconds pass.
- Countdown bar updates smoothly every 100ms.
- Layout forced to horizontal on 13.3 inch / 1920x1080 screens.
- Cloud checks duplicates for selected walls and welcome screen serials.

Debug:
```cmd
cd C:\code\CheckInStationSetup
npm install
npm run debug
```

Build portable app:
```cmd
npm run dist
```

Build Setup.exe after `release\win-unpacked` exists:
```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v29 based on v28: NFC v1.2 + BLE Scanner + Settings

This version keeps the v28 horizontal wall test capabilities and adds:
- NFC service updated with the uploaded PN532 v1.2 logic.
- BLE scanner service based on the uploaded scanner API.
- File -> Settings:
  - NFC / cell-test timeout
  - charge-detect timeout
  - NFC delay / immediate mode
  - scanner MAC fragment
  - scanner read timeout
  - BLE scan helper for finding scanner MAC
- Scanner tab in Device Manager.
- Scanner indicator in the main header.
- Scan button for the charging wall serial.
- Cell test turns the handle LED off at the beginning of the test.

Important scanner setup:
```cmd
npm install
```
The app uses `@stoprocent/noble` for BLE on Windows.

Debug:
```cmd
cd C:\code\CheckInStationSetup
npm install
npm run debug
```

Build portable:
```cmd
npm run dist
```

Build Setup.exe after `release\win-unpacked` exists:
```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v30 build fix

Fixed:
- Build error: duplicated `onDetectScanner` in the Header parameter list.
- Removed subtitle rendering from header to avoid wrapping/layout issues.

Commands:

```cmd
npm install
npm run debug
```

Build portable:

```cmd
npm run dist
```

Build Setup.exe after `release\win-unpacked` exists:

```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v31 JSX fix

Fixed:
- Invalid escaped quotes in JSX, for example `className=\"headerLeft\"`.
- Kept the previous v30 fix for duplicate `onDetectScanner`.

Commands:

```cmd
npm install
npm run debug
```

Build portable:

```cmd
npm run dist
```

Build Setup.exe after `release\win-unpacked` exists:

```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v32 runtime fix

Fixed:
- Blank screen caused by `scannerStatus`, `setScannerStatus`, and `setScannerStatusRaw` being used without state declarations.
- Device Manager Scanner tab now receives `appSettings` and `onDetectScanner`.
- Settings window route is now handled by the app.

Commands:

```cmd
npm install
npm run debug
```

Build portable:

```cmd
npm run dist
```

Build Setup.exe after `release\win-unpacked` exists:

```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v33 scanner MAC connect fix

Scanner connection was changed to the exact requested flow:

1. `scanForPeripheral(macAddress)` receives the MAC address / MAC fragment from the UI, scans BLE advertisements and returns the matching `peripheral`.
2. `connectPeripheral(peripheral)` receives that peripheral object and connects to it.
3. Only after connection does the app discover RX/TX BLE characteristics and test/read.

Use:
- File -> Settings -> Scanner MAC address / fragment
- Or Device Manager -> Scanner -> enter Scanner MAC address / fragment -> Connect scanner

Example MAC fragment:
```text
303D:40-c7
```

Commands:
```cmd
npm install
npm run debug
```

Build:
```cmd
npm run dist
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v34 scanner fix

Fixed:
- `withBindings is not a function` by using `@stoprocent/noble` correctly as the noble instance.
- Device Manager -> Scanner tab was rebuilt so it is no longer blank.
- Scanner tab now has:
  - MAC address / fragment input
  - Connect scanner
  - Read scanner value
  - Scan BLE devices
  - Status bar

Scanner connection still follows:
```text
scanForPeripheral(macAddress) -> peripheral
connectPeripheral(peripheral)
```

Commands:
```cmd
npm install
npm run debug
```

Build:
```cmd
npm run dist
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v35 scanner connection fix

Changes:
- Removed scanner MAC from File -> Settings. Scanner MAC is entered only in Device Manager -> Scanner.
- Fixed scanner noble import to support both package shapes:
  - `withBindings('win')` when available
  - direct noble instance when `withBindings` is not exported
- Scanner connection uses the same flow as the working API:
  1. `scanForPeripheral(macAddress)`
  2. `connectPeripheral(peripheral)`
  3. discover RX/TX characteristics
  4. subscribe RX
  5. send `VERSON?`
- If scanner is not found, the error includes discovered BLE devices to help identify the right MAC fragment.

Commands:
```cmd
npm install
npm run debug
```

Build:
```cmd
npm run dist
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v36 scanner persistent connection

Answer to the disconnect question:
- Previous scanner connection test sent `VERSON?` and then disconnected in `finally`.
- This version does not send any command on Connect.
- This version keeps the BLE connection open after Connect.
- `Read scanner value` reuses the active connection.

Commands:
```cmd
npm install
npm run debug
```

Build:
```cmd
npm run dist
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v37 scanner timeout fix

Fixed scanner operations getting stuck:
- Restored robust `@stoprocent/noble` loader that supports both `withBindings('win')` and direct noble exports.
- Added hard timeouts for BLE connect, characteristic discovery, RX subscribe, scan, and adapter ready.
- Scan BLE and Connect Scanner now always return success or a clear timeout/error.
- Connect still sends no scanner command and keeps the BLE connection open.

Commands:
```cmd
npm install
npm run debug
```

Build:
```cmd
npm run dist
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v38 scanner auto-connect and auto-read

Changes:
- Scanner MAC is saved to `localStorage` as `c2m-scanner-mac`.
- On app load, if scanner auto-connect is enabled, the app uses the saved MAC and connects automatically.
- Device Manager -> Scanner now includes `Get version`.
- Scanner connection keeps a persistent RX listener.
- After scanner is connected, scanned values are captured automatically without pressing `Read scanner value`.
- `Read scanner value` still exists as a manual wait/read action.

Commands:
```cmd
npm install
npm run debug
```

Build:
```cmd
npm run dist
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v39 scanner keyboard mode

Changes:
- Scanner now behaves like a keyboard wedge inside the app.
- When a scan is received, the value is typed into the currently focused input or textarea.
- Default suffix is Enter.
- File -> Settings includes:
  - Scanner keyboard mode
  - Scanner keyboard suffix: None / Enter / Tab
- Device Manager still shows the last scanned value.

Usage:
1. Connect scanner.
2. Click/focus any input field in the app.
3. Scan a barcode.
4. The scanned value is inserted into the focused field automatically.

Commands:
```cmd
npm install
npm run debug
```

Build:
```cmd
npm run dist
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v40 scanner input fix
- Fixed React controlled inputs not receiving scanner values.
- Scanner now injects values correctly into Serial Number and all React inputs.


## v41 scanner global keyboard fix

Fix:
- The previous keyboard injection happened inside the Device Manager window.
- When you scanned while the Serial Number input was focused in the main window, the value was consumed by Device Manager and could not be typed into the main window.
- ScannerKeyboardBridge now runs in the main app window and polls the shared scanner service, so scans are inserted into the focused input in the main window.

Usage:
1. Connect scanner in Device Manager.
2. Click the Serial Number field in the main window.
3. Scan the barcode.
4. The value is typed into the Serial Number field automatically.


## v42 scanner duplicate fix

Fix:
- Scanner keyboard mode was injecting the same value twice when Device Manager and the main window were both observing the scanner.
- Added de-duplication in `ScannerKeyboardBridge`.
- Added input-level protection so the same scanned value is not appended twice.

Expected behavior:
- Scanned value `1122613000012` is inserted once as `1122613000012`.


## v43 blank screen fix

Fix:
- v42 introduced `useRef` for scanner de-duplication but the React import did not include `useRef`, causing the renderer to fail and show a blank screen.
- Added `useRef` to the React import.
- Made scanner de-duplication less aggressive: it now blocks only exact duplicate field content, not any field that ends with the scanned value.
- Added renderer error logging for future debugging.

Commands:
```cmd
npm install
npm run dev
```

Build:
```cmd
npm run dist
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v46 visible clear buttons

Fix:
- v45 did not match the real input variable names in the current source.
- Added visible red ✕ buttons to:
  - Create Charging Wall -> Serial Number
  - Create Charging Wall -> Welcome screen serial
  - Configure Charging Wall -> Charging wall serial
  - Create Check-in Station -> Charging wall serial
  - Create Check-in Station -> Welcome screen serial when shown
  - Create Check-in Station -> Check-in station name


## v47 nice clear buttons

Change:
- Replaced the large red clear button with a small rounded icon button next to each scan input.


## v48 inline clear button
- Clear button is now a small inline X inside the textbox without border.


## v49 centered clear button

Fix:
- The inline clear button is now absolutely positioned inside the textbox and vertically centered.
- Removed border/background from the clear button.
- Fixed alignment in serial + Find wall rows.


## v50 clear button right

Fix:
- Clear button is no longer positioned as an absolute overlay.
- Each serial textbox is slightly shorter and has a small clear button on its right.
- Fixed serial + Find wall rows so input, clear button and Find wall button are aligned.


## v51 clear button and wall test fixes

Fixes:
- Clear X is now a compact 24px button on the same line as the text box.
- No margin / no large button / no new line.
- Wall test should stop on the first failed slot.
- Slot test now attempts to turn the handle LED off after each cell result.


## v52 LED flow and wall-test behavior

Changes:
- Device Manager -> Arduino now has `Turn LEDs off`.
- `Turn LEDs off` turns off both top LED and handle LED.
- Charging wall test should stop the full test on the first failed cell.
- At the start of each cell test, after pressing OK on the popup, both LEDs are turned off.
- After charge detection passes, top LED turns green.
- After NFC write + read verification passes, handle LED turns green.
- After each cell test result, both LEDs are turned off before the next cell or before stopping.


## v53 duplicate helper fix

Fix:
- Removed duplicate `safeTurnHandleLedOff` declaration that caused Vite/React build failure.


## v54 slot-test flow

Implemented the slot test as a closed flow:
1. After OK in the popup, both top and handle LEDs are turned off.
2. Charge test runs.
   - Pass: top LED green.
   - Fail: top LED red, slot fails, wall test stops.
3. NFC write runs.
4. NFC read + compare runs.
   - Pass: handle LED green.
   - Fail: handle LED red, slot fails, wall test stops.
5. If both charge and NFC pass, both LEDs remain green for 5 seconds, then both turn off.
6. After every slot test result, both LEDs are turned off.
7. Full wall test stops immediately on the first failed cell.

Device Manager:
- Added Arduino -> Turn LEDs off, for top LED and handle LED.


## v55 NFC serial list + existing allocation behavior

Changes:
- Configure Charging Wall now shows the NFC serial list on the right side of the wall cells.
- The current slot row is highlighted.
- Passed/failed slots are visually marked in the list.
- Cloud-side allocation now returns existing ChargingSlots for the selected wall if they already exist.
- Cloud only generates new CW00######## serials when the wall has no existing NFC serials.


## v56 Open Wall command

- Added new Arduino command: Open Wall
- Available in Device Manager / Arduino page
- Successful cell test now automatically opens the wall for 10 seconds
- Open Wall duration is passed as Arduino command parameter


## v57 Open Wall + NFC generation at create wall

Verified changes:
- Device Manager -> Arduino includes `Open Wall`.
- Arduino service exports a real `openWall(portPath, durationMs)` implementation using the existing request/response protocol.
- Renderer preload and main IPC expose `arduino.openWall`.
- Successful cell test calls Open Wall for 10 seconds after the cell passes.
- NFC sticker serials are generated and saved to `ChargingSlots` during `Create Charging Wall`.
- Configure Charging Wall now only reads existing NFC sticker serials.
- If an older wall has no NFC sticker serials, allocation generates once, saves them, and returns them.
- Save Wall Configuration no longer deletes and regenerates NFC serial rows.


## v58 verified Open Wall button

Fixed:
- The Device Manager / Arduino tab now definitely renders an `Open Wall` button.
- The button calls `window.arduinoApi.openWall(arduinoPort, 10000)`.
- The Arduino service, preload, and main IPC were verified to expose `openWall`.


## v59 Open Wall protocol fix

Fix:
- Open Wall now sends the documented command:
  `REQ|38|OPEN_WALL|time_to_open=10\n`
- The app passes 10000 ms internally, and Arduino service converts it to seconds.
- Removed unsupported fallback commands `WALL_OPEN` and `OPEN_WALL_MS`.


## v60 Open Wall after NFC pass + setting

Changes:
- Added `Open Wall duration (seconds)` to Settings.
- Default value: 10 seconds.
- Device Manager -> Arduino -> Open Wall uses the configured setting.
- Cell test now runs Open Wall immediately after NFC write/read verification passes.
- The command still uses the verified protocol:
  `REQ|38|OPEN_WALL|time_to_open=<seconds>\n`


## v61 Create Check-in Station wall linking UI

Changes:
- Create Check-in Station no longer asks the user to enter the Welcome Screen serial.
- When a wall is found, the app shows the Welcome Screen serial stored in the local cloud DB.
- Adding a wall uses the DB Welcome Screen serial automatically.
- Create Check-in Station preview now shows selected walls visually linked as one station.
- Show Check-in Stations now uses the same linked-wall station visual UI.
- Cloud `withModel` now returns `WelcomeScreenSerial` together with the wall.
- Cloud station creation also derives the welcome screen serial from the DB if the UI does not send it.


## v62 Charging wall and slot statuses

Changes:
- UI station walls now have zero margin/gap so walls appear side-by-side as one large wall.
- Added `Status` to ChargingWalls and ChargingSlots:
  - 0 = unknown
  - 1 = pass
  - 2 = failed
- Create Charging Wall creates the wall with Status=0 and all ChargingSlots with Status=0.
- Configure Charging Wall cell test updates each ChargingSlot:
  - pass -> Status=1
  - fail -> Status=2
- Full wall test:
  - stops on first failed cell
  - if any cell fails, ChargingWall Status=2
  - if all pass, ChargingWall Status=1
- Create Check-in Station:
  - Find wall returns the wall status
  - Adding a wall is blocked unless wall Status=1
- Updated local-cloud-db.json, local-cloud-db-default.json and schema with Status properties.


## v63 Cell prompt timing + station wall visual

Changes:
- After a cell test ends, the next slot popup appears immediately. The app no longer waits for the LED hold timeout before showing the next prompt.
- LEDs still stay on for the configured Open Wall duration, then turn off in the background.
- Added a red Cancel button to the slot prompt.
- Station wall preview now uses one shared border/frame for all walls, with zero gap between wall units, so the station looks like one large wall.


## v64 Inline test instructions + compact station wall
- Slot test instructions now appear in the left panel instead of a popup overlay.
- OK/Cancel are on the left panel, so the wall preview remains visible.
- Check-in station walls use compact wall-width units with vertical properties above each wall and zero gap between walls.


## v65 Wall test view stays active + tighter station walls

Changes:
- Configure Charging Wall left panel now stays in Test View during the running cell test.
- It only returns to the normal Configure view when the wall test is completed, failed, or cancelled.
- Station wall preview headers now have the same height.
- Station wall units are narrowed to wall width and pulled together so adjacent walls appear as one large wall.


## v66 Final requested test flow and station wall spacing

- Configure Charging Wall has two left-panel modes:
  - wall-selection mode
  - test mode
- Starting either `Test current slot` or `Start wall test` switches the left panel to test mode.
- During full wall test, the left panel stays in test mode between cells and while each cell is running.
- The app switches back to wall-selection mode only when the full wall test completes, fails, or is cancelled.
- Check-in Station wall preview uses tight wall-sized units and no visible spacing between wall previews.

## v68 Real Cloud Adapter

This version adds an optional real cloud mode in Settings.

Cloud differences handled:
- Controller paths are under `/check-in-stations`.
- DTOs are camelCase on the real cloud and normalized to the app's existing PascalCase UI model.
- Device statuses are string enum values on the cloud: `unknown`, `pass`, `fail`; the app still displays and uses local numeric equivalents internally.
- Charging slots now use `nfcId` / `nfcTag` and are saved through `PUT /check-in-stations/charging-walls/:id/slots`.
- The app stores NFC UID to `NFCId` and the written/read sticker value to `NFCTag`.
- OAuth client-credentials authentication was added for all real cloud requests.

Settings to configure before using the real cloud:
- Use real cloud = Enabled
- Cloud Base URL = the API host or full `/check-in-stations` URL
- OAuth Token URL = the `/oauth2/token` URL
- OAuth Client ID
- OAuth Client Secret

Developer commands:
```cmd
npm install
npm run dev
```

Build setup.exe from an existing unpacked build:
```cmd
npx electron-builder --win nsis --x64 --prepackaged release\win-unpacked --config.directories.output=release
```


## v69 Cloud-only mode and logging

This version does not use the local cloud DB for app cloud operations.
All `cloud:*` IPC calls use `src/cloud/remoteCloud.cjs` only.

Cloud log file:
- Development from source: `C:\code\CheckInStationSetup\logs\cloud-api.log` only if Electron userData is not available.
- Normal Electron runtime: `%APPDATA%\c2m-checkin-station-setup\logs\cloud-api.log`.
- You can also open it from the app menu: `File -> Open cloud log folder`.

The log includes:
- OAuth token request start/success/failure.
- Every cloud request URL, method and request body.
- Every cloud response status/body.
- IPC cloud call success/failure.
- Secrets, Basic auth and Bearer tokens are redacted.


## v71 Continue from selected slot

Changes:
- In Configure Charging Wall, slots are manually selectable by clicking the wall preview or NFC tag list.
- The first non-passed slot is selected automatically when loading a wall.
- `Test current slot` runs only the selected slot.
- `Start wall test from selected slot` starts/continues the wall test from the currently selected slot instead of always starting from slot 1.
- After a failed wall test, a `Continue wall test from Slot X` button appears and resumes from the failed/selected slot.
- Existing slot statuses from the cloud initialize the Pass/Failed UI.


## v72 Find Wall renderer crash fix
- Fixed `WallPreview` missing `onSlotClick` prop declaration that caused a renderer crash after Find wall.
- Added safe normalization for cloud slot payloads before using `.filter()` / `.findIndex()`.
- Added renderer error boundary so future UI errors show an error screen instead of a blank blue screen.
- Added renderer console/crash logging into `%APPDATA%\c2m-checkin-station-setup\logs\cloud-api.log`.


## v74 Retailer API support

- Create Check-in Station now supports the Retailer Service endpoints from `ENDPOINTS 1.md`.
- Retailer loading prefers `GET /retailers`.
- Store loading prefers `GET /stores?retailerId={id}`.
- Response mapping supports `retailerId/name/stores` and `storeId/name/retailerId/retailerStoreId`.
- The app still uses the configured OAuth token for these requests.
- If the Retailer Service is deployed on a different hostname than Device Management, configure Cloud Base URL to a gateway that can route both services, or ask cloud for the final retailer-service URL.
