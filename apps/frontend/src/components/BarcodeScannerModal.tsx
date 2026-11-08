import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { AlertCircle, Camera, CheckCircle2, LoaderCircle, ScanLine, X } from "lucide-react";

function cameraErrorMessage(error: unknown) {
  if (error instanceof DOMException && ["NotAllowedError", "PermissionDeniedError", "SecurityError"].includes(error.name)) {
    return "Izin kamera ditolak. Izinkan kamera untuk situs ini di browser, lalu coba lagi. Anda tetap bisa memasukkan NISN secara manual.";
  }
  if (error instanceof DOMException && ["NotFoundError", "DevicesNotFoundError"].includes(error.name)) {
    return "Kamera tidak ditemukan. Periksa perangkat atau masukkan NISN secara manual.";
  }
  return "Kamera tidak dapat diakses. Periksa kamera dan izin browser, atau masukkan NISN secara manual.";
}

type BarcodeScannerModalProps = {
  open: boolean;
  busy?: boolean;
  message?: string;
  messageError?: boolean;
  onClose: () => void;
  onScan: (value: string) => Promise<void>;
};

export default function BarcodeScannerModal({ open, busy = false, message, messageError = false, onClose, onScan }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const onScanRef = useRef(onScan);
  const lockedRef = useRef(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState("");

  onScanRef.current = onScan;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      try {
        setError("");
        setDevices([]);
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          setError("Kamera hanya dapat digunakan melalui HTTPS dengan sertifikat yang dipercaya perangkat. Anda tetap bisa memasukkan NISN secara manual.");
          return;
        }
        const availableDevices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (cancelled) return;
        setDevices(availableDevices);
        if (!availableDevices.length) {
          setError("Kamera tidak ditemukan. Periksa perangkat atau masukkan NISN secara manual.");
          return;
        }
        const preferred = availableDevices.find((device) => /back|rear|environment/i.test(device.label)) || availableDevices[0];
        setDeviceId((current) => current || preferred?.deviceId || "");
      } catch (cameraError) {
        if (!cancelled) setError(cameraErrorMessage(cameraError));
      }
    };
    start();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !videoRef.current || !deviceId) return;
    const video = videoRef.current;
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    const start = async () => {
      try {
        controlsRef.current = await reader.decodeFromVideoDevice(deviceId, video, async (result) => {
          if (!result || lockedRef.current || cancelled) return;
          const value = result.getText().trim();
          if (!value) return;
          lockedRef.current = true;
          try {
            await onScanRef.current(value);
          } catch {
            // The caller owns user-facing error feedback; scanner callbacks must not reject.
          } finally {
            window.setTimeout(() => { lockedRef.current = false; }, 1200);
          }
        });
      } catch (cameraError) {
        if (!cancelled) setError(cameraErrorMessage(cameraError));
      }
    };
    start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      BrowserMultiFormatReader.releaseAllStreams();
    };
  }, [open, deviceId]);

  if (!open) return null;
  return <div className="scanner-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="scanner-title">
    <div className="scanner-card w-full max-w-[620px] overflow-hidden rounded-2xl">
      <header className="scanner-header"><div><p className="eyebrow">ABSENSI REALTIME</p><h2 id="scanner-title">Scan QR / Barcode</h2></div><button className="icon-button" type="button" aria-label="Tutup scanner" onClick={onClose}><X size={20} /></button></header>
      <div className="scanner-body">
        <div className="scanner-preview"><video ref={videoRef} autoPlay muted playsInline /><div className="scanner-frame"><ScanLine size={28} /></div>{busy && <div className="scanner-busy"><LoaderCircle className="loading-icon" size={20} />Memproses absensi...</div>}</div>
        {devices.length > 1 && <label className="scanner-camera-select"><span><Camera size={15} />Kamera</span><select value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>{devices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Kamera ${index + 1}`}</option>)}</select></label>}
        {error && <p className="scanner-error" role="alert">{error}</p>}
        {message && <p className={messageError ? "scanner-error" : "scanner-message"}>{messageError ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}{message}</p>}
        <p className="scanner-hint">Arahkan QR Code atau barcode siswa ke dalam bingkai kamera.</p>
      </div>
    </div>
  </div>;
}
