import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Download, Eye, Printer } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import StudentPhoto from "../components/StudentPhoto";
import { api } from "../services/api";
import type { AcademicYear, ExamCardPreview, ExamPeriod, Rombel, Student } from "../types";

const periodLabels: Record<ExamPeriod["period_type"], string> = {
  GANJIL: "Semester Ganjil",
  GENAP: "Semester Genap",
  MID_SEMESTER: "Mid Semester",
};

function downloadPdf(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.detail === "string") {
    return error.response.data.detail;
  }
  return "Kartu ujian gagal diproses. Silakan coba lagi.";
}

export default function ExamCardsPage() {
  const [yearId, setYearId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [rombelId, setRombelId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const academicYears = useQuery<AcademicYear[]>({
    queryKey: ["academic-years"],
    queryFn: async () => (await api.get("/management/academic-years")).data,
  });
  const periods = useQuery<ExamPeriod[]>({
    queryKey: ["exam-periods"],
    queryFn: async () => (await api.get("/schedules/exam-periods")).data,
  });
  const availablePeriods = periods.data?.filter((period) => period.academic_year_id === yearId) || [];
  const selectedPeriod = availablePeriods.find((period) => period.id === periodId);
  const rombels = useQuery<Rombel[]>({
    queryKey: ["rombels"],
    queryFn: async () => (await api.get("/management/rombels")).data,
  });
  const availableRombels = rombels.data?.filter((rombel) => rombel.academic_year_id === yearId) || [];
  const selectedRombel = availableRombels.find((rombel) => rombel.id === rombelId);
  const students = useQuery<Student[]>({
    queryKey: ["exam-card-students", rombelId],
    queryFn: async () => (
      await api.get("/management/students", { params: { rombel_id: rombelId, limit: 100 } })
    ).data,
    enabled: Boolean(selectedRombel),
  });
  const preview = useQuery<ExamCardPreview>({
    queryKey: ["exam-card-preview", periodId, rombelId, previewId],
    queryFn: async () => (await api.get(`/cards/exams/preview/${periodId}/${rombelId}/${previewId}`)).data,
    enabled: Boolean(periodId && rombelId && previewId),
  });
  const exportSingle = useMutation({
    mutationFn: async (studentId: string) => (
      await api.get(`/cards/exams/export/${periodId}/${rombelId}/${studentId}`, { responseType: "blob" })
    ).data as Blob,
    onSuccess: (pdf) => {
      downloadPdf(pdf, "kartu-peserta-ujian.pdf");
      setMessage("PDF kartu ujian berhasil diunduh.");
    },
    onError: (error) => setMessage(errorMessage(error)),
  });
  const exportBulk = useMutation({
    mutationFn: async (student_ids?: string[]) => (
      await api.post(
        "/cards/exams/batch-print",
        { exam_period_id: periodId, rombel_id: rombelId, ...(student_ids ? { student_ids } : {}) },
        { responseType: "blob" },
      )
    ).data as Blob,
    onSuccess: (pdf) => {
      downloadPdf(pdf, "kartu-peserta-ujian.pdf");
      setSelectedIds([]);
      setMessage("PDF kartu ujian berhasil diunduh.");
    },
    onError: (error) => setMessage(errorMessage(error)),
  });

  const busy = exportSingle.isPending || exportBulk.isPending;
  return (
    <AdminLayout
      adminOnly
      title="Kartu Ujian"
      description="Cetak kartu ujian per periode; satu kartu berlaku untuk semua mata pelajaran dan sesi dalam periode tersebut."
    >
      <div className="card-page">
        <section className="panel card-tools">
          <label>
            Tahun ajaran
            <select
              value={yearId}
              onChange={(change) => {
                setYearId(change.target.value);
                setPeriodId("");
                setRombelId("");
                setPreviewId("");
                setSelectedIds([]);
                setMessage("");
              }}
            >
              <option value="">Pilih Tahun Ajaran</option>
              {academicYears.data?.map((year) => (
                <option key={year.id} value={year.id}>{year.year_name}</option>
              ))}
            </select>
          </label>
          <label>
            Jenis ujian
            <select
              value={periodId}
              onChange={(change) => {
                setPeriodId(change.target.value);
                setRombelId("");
                setPreviewId("");
                setSelectedIds([]);
                setMessage("");
              }}
            >
              <option value="">Pilih jenis ujian</option>
              {availablePeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {periodLabels[period.period_type]} · {period.start_date} – {period.end_date}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rombel
            <select
              value={rombelId}
              onChange={(change) => {
                setRombelId(change.target.value);
                setPreviewId("");
                setSelectedIds([]);
                setMessage("");
              }}
            >
              <option value="">Pilih rombel</option>
              {availableRombels.map((rombel) => (
                <option key={rombel.id} value={rombel.id}>
                  {rombel.name}
                </option>
              ))}
            </select>
          </label>
          {academicYears.isError && <p className="error">Tahun ajaran gagal dimuat.</p>}
          {periods.isError && <p className="error">Periode ujian gagal dimuat.</p>}
          {rombels.isError && <p className="error">Rombel gagal dimuat.</p>}
          {yearId && !periods.isLoading && !availablePeriods.length && (
            <p className="error">Belum ada periode ujian untuk tahun ajaran ini.</p>
          )}
          {selectedRombel && selectedPeriod && (
            <div className="exam-card-event-summary">
              <strong>{periodLabels[selectedPeriod.period_type]} · {academicYears.data?.find((year) => year.id === yearId)?.year_name}</strong>
              <span>{selectedRombel.name} · Berlaku untuk seluruh mapel selama periode ini</span>
            </div>
          )}
          <div className="card-export-actions">
            <button
              className="button-with-icon"
              type="button"
              disabled={!selectedIds.length || busy}
              onClick={() => {
                setMessage("");
                exportBulk.mutate(selectedIds);
              }}
            >
              <Download size={16} aria-hidden="true" />
              Ekspor pilihan ({selectedIds.length})
            </button>
            <button
              className="button-with-icon"
              type="button"
              disabled={!periodId || !rombelId || busy}
              onClick={() => {
                setMessage("");
                exportBulk.mutate(undefined);
              }}
            >
              <Printer size={16} aria-hidden="true" />
              Ekspor semua peserta
            </button>
          </div>
          {message && <p className="card-export-message" role="status">{message}</p>}
        </section>

        <div className="card-content-grid">
          <section className="panel card-student-list">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PESERTA UJIAN</p>
                <h3>{students.data?.length ?? 0} siswa ditampilkan</h3>
              </div>
            </div>
            {!periodId || !rombelId ? (
              <p className="muted">Pilih tahun ajaran, jenis ujian, dan rombel untuk melihat peserta.</p>
            ) : students.isLoading ? (
              <p className="muted">Memuat peserta ujian...</p>
            ) : students.isError ? (
              <p className="error">Daftar peserta gagal dimuat.</p>
            ) : students.data?.length ? (
              <>
                <div className="recent-table">
                  <table>
                    <thead><tr><th>Pilih</th><th>Nama</th><th>NISN</th><th>Aksi</th></tr></thead>
                    <tbody>
                      {students.data.map((student) => (
                        <tr key={student.id}>
                          <td data-label="Pilih">
                            <input
                              aria-label={`Pilih kartu ${student.full_name}`}
                              type="checkbox"
                              checked={selectedIds.includes(student.id)}
                              onChange={() => setSelectedIds((ids) => ids.includes(student.id)
                                ? ids.filter((id) => id !== student.id)
                                : [...ids, student.id])}
                            />
                          </td>
                          <td data-label="Nama">{student.full_name}</td>
                          <td data-label="NISN">{student.nisn || "-"}</td>
                          <td className="action-cell" data-label="Aksi">
                            <button className="button-with-icon" type="button" onClick={() => setPreviewId(student.id)}>
                              <Eye size={14} aria-hidden="true" />Pratinjau
                            </button>
                            <button
                              className="button-with-icon"
                              type="button"
                              disabled={busy}
                              onClick={() => {
                                setMessage("");
                                exportSingle.mutate(student.id);
                              }}
                            >
                              <Download size={14} aria-hidden="true" />Ekspor PDF
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="card-export-note">Daftar menampilkan maksimal 100 siswa. Ekspor semua peserta tetap menyertakan seluruh siswa aktif pada rombel ujian.</p>
              </>
            ) : (
              <p className="muted">Belum ada siswa aktif pada rombel ujian.</p>
            )}
          </section>

          <section className="panel card-preview-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">PRATINJAU KARTU</p><h3>{preview.data?.full_name || "Pilih siswa"}</h3></div>
            </div>
            {preview.isLoading ? (
              <p className="muted">Memuat pratinjau kartu...</p>
            ) : preview.isError ? (
              <p className="error">Pratinjau kartu gagal dimuat.</p>
            ) : preview.data ? (
              <>
                <article className="student-card-preview">
                  <header>
                    <img className="student-card-logo" src="/logo.png" alt="Logo SMPI Bina Cendekia Aqwam" />
                    <div><strong>SMPI BINA CENDEKIA AQWAM</strong><span>KARTU {preview.data.exam_name.toUpperCase()} · {preview.data.academic_year_name}</span></div>
                  </header>
                  <div className="student-card-body">
                    <StudentPhoto
                      photoUrl={preview.data.photo_url}
                      className="student-card-photo"
                      alt={`Foto ${preview.data.full_name}`}
                      fallback={<div className="student-card-photo student-card-initials">
                        {preview.data.full_name.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}
                      </div>}
                    />
                    <div className="student-card-name"><span>NAMA</span><strong>{preview.data.full_name}</strong></div>
                    <div className="student-card-details">
                      <span>NISN</span><strong>{preview.data.nisn || "-"}</strong>
                      <span>KELAS</span><strong>{preview.data.class_name || "-"}</strong>
                    </div>
                    <img className="student-card-qr" src={preview.data.qr_data_url} alt={`QR ID siswa ${preview.data.id_siswa}`} />
                  </div>
                </article>
                <button
                  className="button-with-icon card-preview-export"
                  type="button"
                  disabled={busy}
                  onClick={() => exportSingle.mutate(preview.data!.id)}
                >
                  <Download size={16} aria-hidden="true" />Unduh PDF satuan
                </button>
                <p className="card-export-note">PDF CR80 berisi sisi depan-belakang. Kartu berlaku untuk semua mapel dan jadwal dalam periode ujian yang dipilih.</p>
              </>
            ) : (
              <p className="muted">Pilih siswa untuk melihat kartu dan QR absensi.</p>
            )}
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
