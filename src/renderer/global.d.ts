export {};
declare global {
  interface Window {
    cloudApi: any;
    nfcApi: any;
    arduinoApi: any;
    settingsApi: any;
    scannerApi: any;
    __c2mNfcPort?: string;
    __c2mArduinoPort?: string;
  }
}
