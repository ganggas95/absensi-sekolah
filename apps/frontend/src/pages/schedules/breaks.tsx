import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import ModalDialog from "../../components/ModalDialog";
import { api } from "../../services/api";

type ScheduleBreak = {
  id: string;
  day_of_weeks: number[];
  start_time: string;
  end_time: string;
};

const weekdays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const emptyForm = { day_of_weeks: [] as number[], start_time: "", end_time: "" };

export default function BreakSchedules() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ScheduleBreak | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const breaks = useQuery<ScheduleBreak[]>({
    queryKey: ["schedule-breaks"],
    queryFn: async () => (await api.get("/schedules/breaks")).data,
  });
  const save = useMutation({
    mutationFn: async () => editing
      ? api.put(`/schedules/breaks/${editing.id}`, form)
      : api.post("/schedules/breaks", form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedule-breaks"] });
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
      setMessage("Jadwal istirahat berhasil disimpan.");
    },
    onError: (error: any) => setMessage(error?.response?.data?.detail || "Operasi gagal."),
  });
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setMessage("");
    setModalOpen(true);
  };
  const edit = (item: ScheduleBreak) => {
    setEditing(item);
    setForm({
      day_of_weeks: item.day_of_weeks,
      start_time: item.start_time,
      end_time: item.end_time,
    });
    setMessage("");
    setModalOpen(true);
  };
  const remove = async (item: ScheduleBreak) => {
    if (!window.confirm("Hapus jadwal istirahat ini?")) return;
    try {
      await api.delete(`/schedules/breaks/${item.id}`);
      await queryClient.invalidateQueries({ queryKey: ["schedule-breaks"] });
      setMessage("Jadwal istirahat berhasil dihapus.");
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Operasi gagal.");
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.day_of_weeks.length) {
      setMessage("Pilih minimal satu hari.");
      return;
    }
    save.mutate();
  };
  const close = () => {
    if (!save.isPending) {
      setModalOpen(false);
      setEditing(null);
      setForm(emptyForm);
    }
  };

  return (
    <AdminLayout
      adminOnly
      title="Jadwal Istirahat"
      description="Atur waktu istirahat mingguan. Beberapa hari dapat menggunakan waktu yang sama."
    >
      <section className="panel resource-list overflow-hidden rounded-2xl">
        <div className="panel-heading flex items-center justify-between gap-3">
          <div><p className="eyebrow">DAFTAR JADWAL</p><h3>Jadwal Istirahat</h3></div>
          <button className="button-with-icon min-h-11" type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" />Tambah jadwal
          </button>
        </div>
        {message && <p className={message.includes("gagal") ? "error" : "success"} role="status">{message}</p>}
        {breaks.isError && <p className="error" role="alert">Jadwal istirahat gagal dimuat.</p>}
        <div className="recent-table overflow-x-auto">
          <table>
            <thead>
              <tr><th>Hari</th><th>Waktu Istirahat</th><th>Aksi</th></tr>
            </thead>
            <tbody>
              {breaks.data?.map((item) => (
                <tr key={item.id}>
                  <td data-label="Hari">{item.day_of_weeks.map((day) => weekdays[day]).join(", ")}</td>
                  <td data-label="Waktu Istirahat">{item.start_time}–{item.end_time}</td>
                  <td className="action-cell">
                    <button className="button-with-icon min-h-11" type="button" onClick={() => edit(item)}>
                      <Pencil size={14} aria-hidden="true" />Edit
                    </button>
                    <button className="button-with-icon min-h-11" type="button" onClick={() => remove(item)}>
                      <Trash2 size={14} aria-hidden="true" />Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {breaks.isPending && <div className="empty-state"><strong>Memuat jadwal...</strong></div>}
          {!breaks.isPending && !breaks.isError && !breaks.data?.length && (
            <div className="empty-state"><strong>Belum ada jadwal istirahat</strong></div>
          )}
        </div>
      </section>

      <ModalDialog
        open={modalOpen}
        title={`${editing ? "Edit" : "Tambah"} Jadwal Istirahat`}
        onClose={close}
      >
        <form className="resource-form-grid grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={submit}>
          <fieldset className="grid gap-2 md:col-span-2">
            <legend>Hari (pilih satu atau lebih)</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {weekdays.map((day, index) => (
                <label className="flex min-h-11 items-center gap-2" key={day}>
                  <input
                    type="checkbox"
                    checked={form.day_of_weeks.includes(index)}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      day_of_weeks: event.target.checked
                        ? [...current.day_of_weeks, index].sort((a, b) => a - b)
                        : current.day_of_weeks.filter((value) => value !== index),
                    }))}
                  />
                  <span>{day}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label><span>Mulai istirahat</span>
            <input type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} required />
          </label>
          <label><span>Selesai istirahat</span>
            <input type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} required />
          </label>
          <div className="modal-actions md:col-span-2">
            <button className="button-with-icon min-h-11" type="button" onClick={close}>
              <X size={16} aria-hidden="true" />Batal
            </button>
            <button className="button-with-icon min-h-11" disabled={save.isPending}>
              {save.isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </ModalDialog>
    </AdminLayout>
  );
}
