import React, { createContext, useContext } from 'react';
import { appConfig } from '@/apps/sos/app.config';

const AppConfigContext = createContext(appConfig);

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  return (
    <AppConfigContext.Provider value={appConfig}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig() {
  return useContext(AppConfigContext);
}
