import * as Network from "expo-network";

export interface ScanOptions {
  subnetPrefix: string; // e.g. "192.168.8."
  port: number; // e.g. 8000
  timeoutMs?: number; // e.g. 1200
  batchSize?: number; // e.g. 15
  onProgress?: (scanned: number, total: number, currentIp: string) => void;
  signal?: AbortSignal;
}

/**
 * Detect local device IP and return estimated subnet prefix e.g. "192.168.8."
 */
export async function detectLocalSubnet(): Promise<string> {
  try {
    const ip = await Network.getIpAddressAsync();
    if (ip && ip.includes(".")) {
      const parts = ip.split(".");
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.`;
      }
    }
  } catch (err) {
    console.warn("Failed to detect local IP:", err);
  }
  return "192.168.8.";
}

/**
 * Test a single server URL for /api/v1/health or /health
 */
export async function testServerUrl(
  baseUrl: string,
  timeoutMs: number = 2000,
  signal?: AbortSignal
): Promise<boolean> {
  const cleanBase = baseUrl.trim().replace(/\/+$/, "");
  const controller = new AbortController();

  const abortListener = () => controller.abort();
  if (signal) {
    signal.addEventListener("abort", abortListener);
  }

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // Try /api/v1/health first
    let res = await fetch(`${cleanBase}/api/v1/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      clearTimeout(timeoutId);
      return true;
    }

    // Try /health fallback
    res = await fetch(`${cleanBase}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
    if (signal) {
      signal.removeEventListener("abort", abortListener);
    }
  }
}

/**
 * Scan candidate IP addresses in the subnet concurrently in batches
 */
export async function scanSubnet(options: ScanOptions): Promise<string | null> {
  const {
    subnetPrefix,
    port,
    timeoutMs = 1200,
    batchSize = 16,
    onProgress,
    signal,
  } = options;

  const total = 254;
  let scanned = 0;
  let foundUrl: string | null = null;

  // Generate all candidate IPs from 1 to 254
  const ips: string[] = [];
  for (let i = 1; i <= total; i++) {
    ips.push(`${subnetPrefix}${i}`);
  }

  // Split into chunks of batchSize
  for (let i = 0; i < ips.length; i += batchSize) {
    if (signal?.aborted || foundUrl) break;

    const chunk = ips.slice(i, i + batchSize);

    // Run tests in parallel for this batch
    const promises = chunk.map(async (ip) => {
      if (signal?.aborted || foundUrl) return null;
      const targetUrl = `http://${ip}:${port}`;
      const isOk = await testServerUrl(targetUrl, timeoutMs, signal);
      scanned++;
      if (onProgress) {
        onProgress(Math.min(scanned, total), total, ip);
      }
      if (isOk) {
        return targetUrl;
      }
      return null;
    });

    const results = await Promise.all(promises);
    const match = results.find((r) => r !== null);
    if (match) {
      foundUrl = match;
      break;
    }
  }

  return foundUrl;
}
