export {};

declare global {
  interface Window {
    cloudApi: {
      getDb: () => Promise<any>;
      getCustomers: () => Promise<any[]>;
      getStoresByCustomer: (customerId: number) => Promise<any[]>;
      getWallModels: () => Promise<any[]>;
      createWall: (payload: any) => Promise<any>;
      getUnassignedWalls: () => Promise<any[]>;
      getWallDetails: (chargingWallId: number) => Promise<any>;
      allocateSlotNfcSerials: (chargingWallId: number) => Promise<any[]>;
      saveWallConfiguration: (payload: any) => Promise<any>;
      createCheckInStation: (payload: any) => Promise<any>;
    };
  }
}
