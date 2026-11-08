import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import AdminLayout from "../../components/AdminLayout";
import ModalDialog from "../../components/ModalDialog";
import { api } from "../../services/api";
import type { AcademicYear, ExamPeriod } from "../../types";

const periodLabels: Record<ExamPeriod["period_type"], string> = {
  GANJIL: "Semester Ganjil",
  GENAP: "Semester Genap",
  MID_SEMESTER: "Mid Semester",
};

function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return "Operasi gagal. Silakan coba lagi.";
}

export default function ExamPeriodsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ExamPeriod | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");

  const years = useQuery<AcademicYear[]>({
    queryKey: ["academic-years"],
    queryFn: async () => (await api.get("/management/academic-years")).data,
  });
  const periods = useQuery<ExamPeriod[]>({
    queryKey: ["exam-periods"],
    queryFn: async () => (await api.get("/schedules/exam-periods")).data,
  });
  const save = useMutation({
    mutationFn: async (payload: Record<string, string>) => (
      editing
        ? api.put(`/schedules/exam-periods/${editing.id}`, payload)
        : api.post("/schedules/exam-periods", payload)
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["exam-periods"] });
      setEditing(null);
      setForm({});
      setModalOpen(false);
      setMessage("Periode ujian berhasil disimpan.");
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setMessage("");
    setModalOpen(true);
  };
  const edit = (period: ExamPeriod) => {
    setEditing(period);
    setForm({ ...period });
    setMessage("");
    setModalOpen(true);
  };
  const close = () => {
    if (!save.isPending) {
      setEditing(null);
      setForm({});
      setModalOpen(false);
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Hapus periode ujian ini?")) return;
    try {
      await api.delete(`/schedules/exam-periods/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["exam-periods"] });
      setMessage("Periode ujian berhasil dihapus.");
    } catch (error) {
      setMessage(getErrorMessage(error));
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(form);
  };

  return (
    <AdminLayout
      adminOnly
      title="Periode Ujian"
      description="Tentukan jenis ujian dan rentang tanggal dalam setiap tahun ajaran sebelum membuat jadwal mapel."
    >
      <section className="panel resource-list overflow-hidden rounded-2xl">
        <div className="panel-heading flex items-center justify-between gap-3">
          <div><p className="eyebrow">MASTER UJIAN</p><h3>Daftar Periode Ujian</h3></div>
          <button className="button-with-icon" type="button" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" />Tambah periode
          </button>
        </div>
        {message && <p className={message.includes("berhasil") ? "success" : "error"} role="status">{message}</p>}
        <div className="recent-table overflow-x-auto">
          <table>
            <thead><tr><th>Tahun Ajaran</th><th>Periode</th><th>Rentang Tanggal</th><th>Aksi</th></tr></thead>
            <tbody>
              {periods.data?.map((period) => (
                <tr key={period.id}>
                  <td data-label="Tahun Ajaran">{years.data?.find((year) => year.id === period.academic_year_id)?.year_name || "-"}</td>
                  <td data-label="Periode">{periodLabels[period.period_type]}</td>
                  <td data-label="Rentang Tanggal">{period.start_date} – {period.end_date}</td>
                  <td className="action-cell">
                    <button className="button-with-icon" type="button" onClick={() => edit(period)}>
                      <Pencil size={14} aria-hidden="true" />Edit
                    </button>
                    <button className="button-with-icon" type="button" onClick={() => remove(period.id)}>
                      <Trash2 size={14} aria-hidden="true" />Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!periods.data?.length && <div className="empty-state"><strong>Belum ada periode ujian</strong><span>Buat periode agar dapat menambahkan jadwal ujian mapel.</span></div>}
        </div>
      </section>

      <ModalDialog open={modalOpen} title={`${editing ? "Edit" : "Tambah"} Periode Ujian`} onClose={close}>
        <form className="flex flex-col gap-3" onSubmit={submit}>
          <select
            value={form.academic_year_id || ""}
            onChange={(event) => setForm((value) => ({ ...value, academic_year_id: event.target.value }))}
            required
          >
            <option value="">Pilih Tahun Ajaran</option>
            {years.data?.map((year) => <option key={year.id} value={year.id}>{year.year_name}</option>)}
          </select>
          <select
            value={form.period_type || ""}
            onChange={(event) => setForm((value) => ({ ...value, period_type: event.target.value }))}
            required
          >
            <option value="">Pilih Jenis Ujian</option>
            <option value="GANJIL">Semester Ganjil</option>
            <option value="GENAP">Semester Genap</option>
            <option value="MID_SEMESTER">Mid Semester</option>
          </select>
          <label className="exam-date-field">Tanggal mulai<input type="date" value={form.start_date || ""} onChange={(event) => setForm((value) => ({ ...value, start_date: event.target.value }))} required /></label>
          <label className="exam-date-field">Tanggal selesai<input type="date" value={form.end_date || ""} min={form.start_date} onChange={(event) => setForm((value) => ({ ...value, end_date: event.target.value }))} required /></label>
          <div className="modal-actions">
            <button className="button-with-icon" type="button" onClick={close}><X size={16} aria-hidden="true" />Batal</button>
            <button className="button-with-icon" disabled={save.isPending}><Save size={16} aria-hidden="true" />{save.isPending ? "Menyimpan..." : "Simpan"}</button>
          </div>
        </form>
      </ModalDialog>
    </AdminLayout>
  );
}
