
/**
 * TypeScript reference implementation for the Arduino Rev2 protocol.
 * Runtime Electron code uses arduinoService.cjs with the same API.
 */

export type SerialPortInfo = {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  vendorId?: string;
  productId?: string;
  label?: string;
};

export type ArduinoConnectionStatus = {
  connected: boolean;
  portPath: string;
  message: string;
  version?: string;
  hardwareVersion?: string;
  revision?: string;
  payload?: Record<string, string>;
};

export type ArduinoBatteryStatus = {
  batteryPercent: number;
  charging: boolean;
  averageTimeToFullMinutes: number;
  runTimeToEmptyMinutes: number;
  raw: Record<string, string>;
};

export type LedColor = { red: number; green: number; blue: number };

export const ARDUINO_PROTOCOL = {
  baudRate: 115200,
  requestFormat: 'REQ|{id}|{command}|{payload}\\n',
  responseFormat: 'RES|{id}|{command}|key=value;status=OK',
  commands: {
    getVersions: 'GET_VERSIONS',
    getBattery: 'GET_BATTERY',
    topLedOn: 'TOP_LED_ON',
    topLedOff: 'TOP_LED_OFF',
  },
} as const;


// LED payload note:
// ArduinoRev2.cs uses enum GetHashCode() for LedLightTime and LedDuration.
// The default SetTopLed(Color.Green) payload is equivalent to:
// red=0;green=255;blue=0;on_duration=0;off_duration=0;time=0
