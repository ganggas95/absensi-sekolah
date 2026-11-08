import { ReactNode, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

type ModalDialogProps = { open: boolean; title: string; onClose: () => void; children: ReactNode };

export default function ModalDialog({ open, title, onClose, children }: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={dialogRef} aria-labelledby={titleId} className="modal-dialog w-[calc(100%-20px)] max-w-[620px] max-h-[calc(100vh-20px)] rounded-2xl p-0" onCancel={(event) => { event.preventDefault(); onClose(); }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-card max-h-[calc(100vh-20px)] overflow-y-auto rounded-2xl"><header className="modal-header flex items-center justify-between gap-3 px-3.5 py-3.5 md:px-5 md:py-[18px]"><h2 id={titleId} className="m-0 text-[17px]">{title}</h2><button type="button" className="icon-button min-h-11 min-w-11" aria-label="Tutup dialog" onClick={onClose}><X size={19} /></button></header><div className="modal-body p-3.5 md:p-5">{children}</div></div>
  </dialog>;
}
