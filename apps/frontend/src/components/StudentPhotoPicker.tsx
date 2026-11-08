import { ChangeEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import ModalDialog from "./ModalDialog";
import StudentPhoto from "./StudentPhoto";

const CROP_RESOLUTION = 1600;
const MAX_CROP_PIXELS = 20_000_000;

type StudentPhotoPickerProps = {
  photoUrl?: string | null;
  file?: File | null;
  alt: string;
  fallback: ReactNode;
  onFileChange: (file: File | null) => void;
};

export default function StudentPhotoPicker({
  photoUrl,
  file,
  alt,
  fallback,
  onFileChange,
}: StudentPhotoPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cropFrameRef = useRef<HTMLDivElement>(null);
  const cropImageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [cropSource, setCropSource] = useState<File | null>(null);
  const [cropSourceUrl, setCropSourceUrl] = useState("");
  const [crop, setCrop] = useState<{ left: number; top: number; scale: number; frameSize: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [cropError, setCropError] = useState("");

  useEffect(() => {
    if (!cropSource) {
      setCropSourceUrl("");
      return;
    }
    const url = URL.createObjectURL(cropSource);
    setCropSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cropSource]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setCropError("Pilih file JPEG, PNG, atau WebP.");
      return;
    }
    setCropError("");
    setCrop(null);
    setZoom(1);
    setCropSource(file);
  };

  const initializeCrop = () => {
    const image = cropImageRef.current;
    const frameSize = cropFrameRef.current?.clientWidth;
    if (!image || !frameSize) return;
    if (image.naturalWidth * image.naturalHeight > MAX_CROP_PIXELS) {
      setCropError("Resolusi foto terlalu besar.");
      return;
    }
    const scale = Math.max(frameSize / image.naturalWidth, frameSize / image.naturalHeight);
    setCrop({
      left: (frameSize - image.naturalWidth * scale) / 2,
      top: (frameSize - image.naturalHeight * scale) / 2,
      scale,
      frameSize,
    });
  };

  const updateZoom = (value: number) => {
    setZoom(value);
    const image = cropImageRef.current;
    if (!image || !crop) return;
    const baseScale = Math.max(crop.frameSize / image.naturalWidth, crop.frameSize / image.naturalHeight);
    const scale = baseScale * value;
    const centerX = (crop.frameSize / 2 - crop.left) / crop.scale;
    const centerY = (crop.frameSize / 2 - crop.top) / crop.scale;
    setCrop({
      ...crop,
      scale,
      left: Math.max(crop.frameSize - image.naturalWidth * scale, Math.min(0, crop.frameSize / 2 - centerX * scale)),
      top: Math.max(crop.frameSize - image.naturalHeight * scale, Math.min(0, crop.frameSize / 2 - centerY * scale)),
    });
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!crop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, left: crop.left, top: crop.top };
  };

  const moveCrop = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || !crop || !cropImageRef.current) return;
    setCrop({
      ...crop,
      left: Math.max(crop.frameSize - cropImageRef.current.naturalWidth * crop.scale, Math.min(0, drag.left + event.clientX - drag.x)),
      top: Math.max(crop.frameSize - cropImageRef.current.naturalHeight * crop.scale, Math.min(0, drag.top + event.clientY - drag.y)),
    });
  };

  const finishCrop = () => {
    const image = cropImageRef.current;
    if (!image || !crop || !cropSource) return;
    const canvas = document.createElement("canvas");
    canvas.width = CROP_RESOLUTION;
    canvas.height = CROP_RESOLUTION;
    const context = canvas.getContext("2d");
    if (!context) {
      setCropError("Browser tidak dapat memproses foto ini.");
      return;
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, CROP_RESOLUTION, CROP_RESOLUTION);
    const sourceX = -crop.left / crop.scale;
    const sourceY = -crop.top / crop.scale;
    const sourceSize = crop.frameSize / crop.scale;
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, CROP_RESOLUTION, CROP_RESOLUTION);
    canvas.toBlob((blob) => {
      if (!blob) {
        setCropError("Gagal membuat hasil crop foto.");
        return;
      }
      const name = cropSource.name.replace(/\.[^.]+$/, "") || "student-photo";
      onFileChange(new File([blob], `${name}-crop.jpg`, { type: "image/jpeg" }));
      setCropSource(null);
      setCrop(null);
      setCropError("");
    }, "image/jpeg", 0.88);
  };

  const cancelCrop = () => {
    setCropSource(null);
    setCrop(null);
    setCropError("");
  };

  return (
    <div className="student-photo-upload">
      <span>Foto siswa (JPEG, PNG, atau WebP, maksimal 5 MB)</span>
      <button
        className="student-photo-picker-card"
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Pilih foto siswa"
      >
        <StudentPhoto
          photoUrl={photoUrl}
          file={file}
          className="student-photo-upload-preview"
          alt={alt}
          fallback={fallback}
        />
        <span className="student-photo-picker-overlay">
          <span className="student-photo-picker-button">
            <Camera size={16} aria-hidden="true" />Pilih foto
          </span>
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        hidden
        onChange={handleChange}
      />
      {cropError && !cropSource && <p className="student-photo-crop-error" role="alert">{cropError}</p>}
      <ModalDialog
        open={Boolean(cropSource)}
        title="Sesuaikan foto siswa"
        onClose={cancelCrop}
      >
        <div className="student-photo-cropper">
          <p>Geser foto untuk mengatur posisi, lalu sesuaikan zoom. Hasil crop berbentuk persegi {CROP_RESOLUTION} × {CROP_RESOLUTION} px.</p>
          {cropError && <p className="student-photo-crop-error" role="alert">{cropError}</p>}
          <div
            ref={cropFrameRef}
            className="student-photo-crop-frame"
            onPointerDown={startDrag}
            onPointerMove={moveCrop}
            onPointerUp={() => { dragRef.current = null; }}
            onPointerCancel={() => { dragRef.current = null; }}
            aria-label="Area crop foto; geser foto untuk mengatur posisi"
          >
            {cropSourceUrl && (
              <img
                ref={cropImageRef}
                src={cropSourceUrl}
                alt="Foto yang akan di-crop"
                onLoad={initializeCrop}
                onError={() => setCropError("Foto tidak dapat dibuka. Silakan pilih file gambar lain.")}
                draggable={false}
                style={crop ? {
                  width: cropImageRef.current?.naturalWidth ? cropImageRef.current.naturalWidth * crop.scale : undefined,
                  height: cropImageRef.current?.naturalHeight ? cropImageRef.current.naturalHeight * crop.scale : undefined,
                  left: crop.left,
                  top: crop.top,
                } : undefined}
              />
            )}
          </div>
          <label className="student-photo-zoom">
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => updateZoom(Number(event.target.value))}
              aria-label="Zoom foto"
            />
          </label>
          <div className="student-photo-crop-actions">
            <button type="button" className="student-photo-cancel-button" onClick={cancelCrop}>Batal</button>
            <button type="button" onClick={finishCrop} disabled={!crop}>Gunakan foto</button>
          </div>
        </div>
      </ModalDialog>
    </div>
  );
}
