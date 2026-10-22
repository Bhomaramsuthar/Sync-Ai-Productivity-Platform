import React, { createContext, useContext, useState, type ReactNode } from 'react';

export interface BreadcrumbItem {
  label: string;
  path?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

interface BreadcrumbContextType {
  breadcrumbs: BreadcrumbItem[];
  setBreadcrumbs: (items: BreadcrumbItem[]) => void;
  cacheWorkspaceName: (id: string, name: string) => void;
  cacheProjectName: (id: string, name: string) => void;
  getWorkspaceName: (id: string) => string | undefined;
  getProjectName: (id: string) => string | undefined;
}

const BreadcrumbContext = createContext<BreadcrumbContextType | undefined>(undefined);

const WS_CACHE_KEY = 'syncai_ws_names';
const PROJ_CACHE_KEY = 'syncai_proj_names';

export const BreadcrumbProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([]);
  const [wsCache, setWsCache] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(WS_CACHE_KEY) || '{}');
    } catch {
      return {};
    }
  });
  const [projCache, setProjCache] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(PROJ_CACHE_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const cacheWorkspaceName = (id: string, name: string) => {
    if (!id || !name) return;
    setWsCache((prev) => {
      if (prev[id] === name) return prev;
      const updated = { ...prev, [id]: name };
      try {
        localStorage.setItem(WS_CACHE_KEY, JSON.stringify(updated));
      } catch (e) {
        // ignore storage error
      }
      return updated;
    });
  };

  const cacheProjectName = (id: string, name: string) => {
    if (!id || !name) return;
    setProjCache((prev) => {
      if (prev[id] === name) return prev;
      const updated = { ...prev, [id]: name };
      try {
        localStorage.setItem(PROJ_CACHE_KEY, JSON.stringify(updated));
      } catch (e) {
        // ignore storage error
      }
      return updated;
    });
  };

  const getWorkspaceName = (id: string) => wsCache[id];
  const getProjectName = (id: string) => projCache[id];

  return (
    <BreadcrumbContext.Provider
      value={{
        breadcrumbs,
        setBreadcrumbs,
        cacheWorkspaceName,
        cacheProjectName,
        getWorkspaceName,
        getProjectName,
      }}
    >
      {children}
    </BreadcrumbContext.Provider>
  );
};

export const useBreadcrumbs = () => {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) {
    throw new Error('useBreadcrumbs must be used within a BreadcrumbProvider');
  }
  return ctx;
};
