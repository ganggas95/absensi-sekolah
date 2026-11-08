import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Download, Eye, Printer } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import StudentPhoto from "../components/StudentPhoto";
import { api } from "../services/api";
import type { Rombel, Student, StudentCardPreview } from "../types";

function downloadPdf(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
  }
  return "Ekspor kartu gagal. Silakan coba lagi.";
}

export default function StudentCardsPage() {
  const [rombelId, setRombelId] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");

  const rombels = useQuery<Rombel[]>({
    queryKey: ["rombels"],
    queryFn: async () => (await api.get("/management/rombels")).data,
  });
  const students = useQuery<Student[]>({
    queryKey: ["card-students", rombelId],
    queryFn: async () =>
      (
        await api.get("/management/students", {
          params: { limit: 100, ...(rombelId ? { rombel_id: rombelId } : {}) },
        })
      ).data,
  });
  const preview = useQuery<StudentCardPreview>({
    queryKey: ["student-card-preview", previewId],
    queryFn: async () => (await api.get(`/cards/preview/${previewId}`)).data,
    enabled: Boolean(previewId),
  });
  const exportSingle = useMutation({
    mutationFn: async (studentId: string) =>
      (
        await api.get(`/cards/export/${studentId}`, {
          responseType: "blob",
        })
      ).data as Blob,
    onSuccess: (pdf, studentId) => {
      downloadPdf(pdf, `kartu-pelajar-${studentId}.pdf`);
      setMessage("PDF kartu berhasil diunduh.");
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });
  const exportBulk = useMutation({
    mutationFn: async (filter: { student_ids: string[] } | { rombel_id: string }) =>
      (
        await api.post("/cards/batch-print", filter, {
          responseType: "blob",
        })
      ).data as Blob,
    onSuccess: (pdf) => {
      downloadPdf(pdf, "kartu-pelajar-bulk.pdf");
      setSelectedIds([]);
      setMessage("PDF kartu berhasil diunduh.");
    },
    onError: (error) => setMessage(getErrorMessage(error)),
  });

  function toggleStudent(studentId: string) {
    setSelectedIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  }

  const busy = exportSingle.isPending || exportBulk.isPending;

  return (
    <AdminLayout
      adminOnly
      title="Kartu Pelajar"
      description="Pratinjau dan ekspor kartu pelajar satuan atau per rombel."
    >
      <div className="card-page">
        <section className="panel card-tools">
          <label>
            Pilih rombel
            <select
              value={rombelId}
              onChange={(event) => {
                setRombelId(event.target.value);
                setSelectedIds([]);
                setPreviewId("");
              }}
            >
              <option value="">Semua rombel</option>
              {rombels.data?.map((rombel) => (
                <option key={rombel.id} value={rombel.id}>
                  {rombel.name}
                </option>
              ))}
            </select>
          </label>
          <div className="card-export-actions">
            <button
              className="button-with-icon"
              type="button"
              disabled={!selectedIds.length || busy}
              onClick={() => {
                setMessage("");
                exportBulk.mutate({ student_ids: selectedIds });
              }}
            >
              <Download size={16} aria-hidden="true" />
              Ekspor pilihan ({selectedIds.length})
            </button>
            <button
              className="button-with-icon"
              type="button"
              disabled={!rombelId || busy}
              onClick={() => {
                setMessage("");
                exportBulk.mutate({ rombel_id: rombelId });
              }}
            >
              <Printer size={16} aria-hidden="true" />
              Ekspor semua di rombel
            </button>
          </div>
          {message && <p className="card-export-message" role="status">{message}</p>}
        </section>

        <div className="card-content-grid">
          <section className="panel card-student-list">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">DAFTAR SISWA</p>
                <h3>{students.data?.length ?? 0} siswa ditampilkan</h3>
              </div>
            </div>
            {students.isLoading ? (
              <p className="muted">Memuat daftar siswa...</p>
            ) : students.isError ? (
              <p className="error">Daftar siswa gagal dimuat.</p>
            ) : students.data?.length ? (
              <div className="recent-table">
                <table>
                  <thead>
                    <tr>
                      <th>Pilih</th>
                      <th>Nama</th>
                      <th>NISN</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.data.map((student) => (
                      <tr key={student.id}>
                        <td data-label="Pilih">
                          <input
                            aria-label={`Pilih kartu ${student.full_name}`}
                            type="checkbox"
                            checked={selectedIds.includes(student.id)}
                            onChange={() => toggleStudent(student.id)}
                          />
                        </td>
                        <td data-label="Nama">{student.full_name}</td>
                        <td data-label="NISN">{student.nisn || "-"}</td>
                        <td className="action-cell" data-label="Aksi">
                          <button
                            className="button-with-icon"
                            type="button"
                            onClick={() => setPreviewId(student.id)}
                          >
                            <Eye size={14} aria-hidden="true" />
                            Pratinjau
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
                            <Download size={14} aria-hidden="true" />
                            Ekspor PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">Tidak ada siswa aktif untuk ditampilkan.</p>
            )}
          </section>

          <section className="panel card-preview-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PRATINJAU KARTU</p>
                <h3>{preview.data?.full_name || "Pilih siswa"}</h3>
              </div>
            </div>
            {preview.isLoading ? (
              <p className="muted">Memuat pratinjau kartu...</p>
            ) : preview.isError ? (
              <p className="error">Pratinjau kartu gagal dimuat.</p>
            ) : preview.data ? (
              <>
                <article className="student-card-preview">
                  <header>
                    <img
                      className="student-card-logo"
                      src="/logo.png"
                      alt="Logo SMPI Bina Cendekia Aqwam"
                    />
                    <div>
                      <strong>SMPI BINA CENDEKIA AQWAM</strong>
                      <span>KARTU PELAJAR</span>
                    </div>
                  </header>
                  <div className="student-card-body">
                    <StudentPhoto
                      photoUrl={preview.data.photo_url}
                      className="student-card-photo"
                      alt={`Foto ${preview.data.full_name}`}
                      fallback={<div className="student-card-photo student-card-initials">
                        {preview.data.full_name
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </div>}
                    />
                    <div className="student-card-name">
                      <span>NAMA</span>
                      <strong>{preview.data.full_name}</strong>
                    </div>
                    <div className="student-card-details">
                      <span>NISN</span>
                      <strong>{preview.data.nisn || "-"}</strong>
                      <span>KELAS</span>
                      <strong>{preview.data.class_name || "-"}</strong>
                    </div>
                    <img
                      className="student-card-qr"
                      src={preview.data.qr_data_url}
                      alt={`QR ID siswa ${preview.data.id_siswa}`}
                    />
                  </div>
                </article>
                <button
                  className="button-with-icon card-preview-export"
                  type="button"
                  disabled={busy}
                  onClick={() => exportSingle.mutate(preview.data!.id)}
                >
                  <Download size={16} aria-hidden="true" />
                  Unduh PDF satuan
                </button>
                <p className="card-export-note">
                  PDF berukuran CR80 dan berisi sisi depan-belakang. Foto belum disertakan pada PDF; area foto memakai inisial siswa.
                </p>
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
