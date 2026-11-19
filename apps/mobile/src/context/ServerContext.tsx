import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  clearStoredServerUrl,
  getStoredServerUrl,
  setApiBaseUrl,
} from "../api/client";
import { scanSubnet, testServerUrl } from "../utils/subnet";
import { ScanProgress } from "../types";

interface ServerContextType {
  serverUrl: string | null;
  isConfigured: boolean;
  isLoading: boolean;
  scanProgress: ScanProgress;
  startScan: (subnetPrefix: string, port: number) => Promise<string | null>;
  stopScan: () => void;
  setServer: (url: string) => Promise<boolean>;
  disconnectServer: () => Promise<void>;
}

const initialScanProgress: ScanProgress = {
  currentIp: "",
  scannedCount: 0,
  totalCount: 254,
  percentage: 0,
  foundServer: null,
  isScanning: false,
};

const ServerContext = createContext<ServerContextType | undefined>(undefined);

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [serverUrl, setServerUrlState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [scanProgress, setScanProgress] =
    useState<ScanProgress>(initialScanProgress);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Initialize stored server on app startup
  useEffect(() => {
    (async () => {
      try {
        const stored = await getStoredServerUrl();
        if (stored) {
          await setApiBaseUrl(stored);
          setServerUrlState(stored);
        }
      } catch (err) {
        console.warn("Failed to load stored server URL:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const startScan = async (
    subnetPrefix: string,
    port: number
  ): Promise<string | null> => {
    // Abort any existing scan
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setScanProgress({
      currentIp: `${subnetPrefix}1`,
      scannedCount: 0,
      totalCount: 254,
      percentage: 0,
      foundServer: null,
      isScanning: true,
      error: null,
    });

    try {
      const found = await scanSubnet({
        subnetPrefix,
        port,
        timeoutMs: 1200,
        batchSize: 16,
        signal: controller.signal,
        onProgress: (scanned, total, currentIp) => {
          setScanProgress((prev) => ({
            ...prev,
            currentIp,
            scannedCount: scanned,
            totalCount: total,
            percentage: Math.round((scanned / total) * 100),
          }));
        },
      });

      if (found) {
        await setApiBaseUrl(found);
        setServerUrlState(found);
        setScanProgress((prev) => ({
          ...prev,
          foundServer: found,
          isScanning: false,
        }));
        return found;
      } else {
        setScanProgress((prev) => ({
          ...prev,
          isScanning: false,
          error: "Server tidak ditemukan di subnet ini. Coba cek IP manual.",
        }));
        return null;
      }
    } catch (err: any) {
      setScanProgress((prev) => ({
        ...prev,
        isScanning: false,
        error: err?.message || "Pemindaian server dibatalkan.",
      }));
      return null;
    }
  };

  const stopScan = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setScanProgress((prev) => ({
      ...prev,
      isScanning: false,
    }));
  };

  const setServer = async (url: string): Promise<boolean> => {
    const clean = url.trim().replace(/\/+$/, "");
    const ok = await testServerUrl(clean, 3000);
    if (!ok) {
      return false;
    }
    await setApiBaseUrl(clean);
    setServerUrlState(clean);
    return true;
  };

  const disconnectServer = async () => {
    await clearStoredServerUrl();
    setServerUrlState(null);
  };

  return (
    <ServerContext.Provider
      value={{
        serverUrl,
        isConfigured: Boolean(serverUrl),
        isLoading,
        scanProgress,
        startScan,
        stopScan,
        setServer,
        disconnectServer,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
};

export function useServer(): ServerContextType {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error("useServer must be used within a ServerProvider");
  }
  return context;
}
