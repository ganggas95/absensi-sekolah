import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";

export type ToastVariant = "success" | "error" | "warning";

type ToastProps = {
  title: string;
  message: string;
  variant?: ToastVariant;
  onClose: () => void;
};

const icons = { success: CheckCircle2, error: AlertCircle, warning: Info };

export default function Toast({ title, message, variant = "success", onClose }: ToastProps) {
  const Icon = icons[variant];
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4500);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  return <div className={`toast toast-${variant} flex items-start gap-3`} role={variant === "error" ? "alert" : "status"}>
    <Icon className="toast-icon" size={20} aria-hidden="true" />
    <div className="toast-copy flex min-w-0 flex-1 flex-col"><strong>{title}</strong><span>{message}</span></div>
    <button className="toast-close icon-button min-h-11 min-w-11" type="button" aria-label="Tutup notifikasi" onClick={onClose}><X size={16} /></button>
  </div>;
}
