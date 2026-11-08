import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ScanLine } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import ScheduleTimeWarning from "../components/ScheduleTimeWarning";
import Toast, { ToastVariant } from "../components/Toast";
import { api } from "../services/api";
import type { ExamAttendance, Rombel, ScheduleEvent } from "../types";

type Notice = { title: string; message: string; variant: ToastVariant };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function ExamAttendancePage() {
  const queryClient = useQueryClient();
  const [eventId, setEventId] = useState("");
  const [openedEventId, setOpenedEventId] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const [scannerMessageError, setScannerMessageError] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const events = useQuery<ScheduleEvent[]>({
    queryKey: ["exam-attendance-events"],
    queryFn: async () => (await api.get("/schedules/events", { params: { event_type: "EXAM" } })).data,
  });
  const rombels = useQuery<Rombel[]>({
    queryKey: ["rombels"],
    queryFn: async () => (await api.get("/management/rombels")).data,
  });
  const attendance = useQuery<ExamAttendance[]>({
    queryKey: ["exam-attendance", eventId],
    queryFn: async () => (await api.get(`/attendance/event/${eventId}`)).data,
    enabled: Boolean(eventId),
  });
  const record = useMutation({
    mutationFn: async (studentId: string) => {
      if (!eventId || openedEventId !== eventId) throw new Error("Buka sesi absensi sebelum mencatat kehadiran.");
      return (await api.post("/attendance/event/record", { schedule_event_id: eventId, student_id: studentId })).data as ExamAttendance;
    },
    onSuccess: (result) => {
      const message = result.already_recorded
        ? `${result.full_name} sudah tercatat hadir pada sesi ini.`
        : `${result.full_name} berhasil tercatat hadir.`;
      setScannerMessage(message);
      setScannerMessageError(false);
      setNotice({ title: result.already_recorded ? "Sudah tercatat" : "Absensi berhasil", message, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["exam-attendance", eventId] });
    },
    onError: (error) => {
      const detail = axios.isAxiosError(error) && typeof error.response?.data?.detail === "string"
        ? error.response.data.detail
        : "Absensi ujian gagal disimpan. Silakan coba lagi.";
      setScannerMessage(detail);
      setScannerMessageError(true);
      setNotice({ title: "Absensi gagal", message: detail, variant: "error" });
    },
  });

  const selectedEvent = events.data?.find((event) => event.id === eventId);
  const sessionOpen = Boolean(selectedEvent && openedEventId === selectedEvent.id);
  const scan = useCallback(async (value: string) => {
    if (!sessionOpen) return;
    const studentId = value.trim();
    if (!UUID_PATTERN.test(studentId)) {
      const message = "QR tidak berisi UUID siswa yang valid.";
      setScannerMessage(message);
      setScannerMessageError(true);
      setNotice({ title: "QR tidak valid", message, variant: "warning" });
      return;
    }
    try {
      await record.mutateAsync(studentId);
    } catch {
      // Mutation error handling updates the scanner message and notice.
    }
  }, [record, sessionOpen]);
  const closeScanner = () => {
    if (!record.isPending) setScannerOpen(false);
  };
  const presentCount = attendance.data?.filter((item) => item.status === "HADIR").length ?? 0;
  const visibleAttendance = attendance.data?.filter((item) =>
    item.full_name.toLocaleLowerCase("id").includes(studentQuery.trim().toLocaleLowerCase("id"))
  ) ?? [];
  const rombelName = rombels.data?.find((rombel) => rombel.id === selectedEvent?.rombel_id)?.name;

  return (
    <AdminLayout title="Absensi Ujian" description="Pilih sesi ujian, lalu scan QR kartu peserta untuk mencatat kehadiran.">
      <div className="attendance-page">
        <section className="panel exam-attendance-tools">
          <label>
            Pilih sesi ujian
            <select
              value={eventId}
              onChange={(change) => {
                setEventId(change.target.value);
                setOpenedEventId("");
                setScannerOpen(false);
                setStudentQuery("");
                setScannerMessage("");
                setScannerMessageError(false);
                setNotice(null);
              }}
            >
              <option value="">Pilih jadwal ujian</option>
              {events.data?.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title} · {event.schedule_date || "Tanggal belum ditentukan"}
                </option>
              ))}
            </select>
          </label>
          {events.isError && <p className="error">Jadwal ujian gagal dimuat.</p>}
          {selectedEvent && (
            <div className="exam-attendance-session">
              <ScheduleTimeWarning schedule={selectedEvent} exam />
              <div>
                <p className="eyebrow">SESI TERPILIH</p>
                <strong>{selectedEvent.title}</strong>
                <span>{selectedEvent.schedule_date} · {rombelName || "Rombel"}</span>
              </div>
              {sessionOpen ? (
                <div className="attendance-session-controls">
                  <p className="attendance-session-open" role="status">Sesi absensi dibuka.</p>
                  <button
                    className="button-with-icon"
                    type="button"
                    disabled={!attendance.data?.length || record.isPending}
                    onClick={() => {
                      setScannerMessage("");
                      setScannerMessageError(false);
                      setNotice(null);
                      setScannerOpen(true);
                    }}
                  >
                    <ScanLine size={17} aria-hidden="true" />Scan kartu ujian
                  </button>
                  <button type="button" className="attendance-session-close" onClick={() => {
                    setOpenedEventId("");
                    setScannerOpen(false);
                  }}>Tutup sesi absensi</button>
                </div>
              ) : (
                <button type="button" onClick={() => setOpenedEventId(selectedEvent.id)}>Buka sesi absensi</button>
              )}
            </div>
          )}
        </section>

        <section className="panel exam-attendance-list">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DAFTAR PESERTA</p>
              <h3>{presentCount} dari {attendance.data?.length ?? 0} siswa hadir</h3>
            </div>
          </div>
          {!eventId ? (
            <p className="muted">Pilih sesi ujian untuk melihat daftar peserta.</p>
          ) : attendance.isLoading ? (
            <p className="muted">Memuat daftar kehadiran...</p>
          ) : attendance.isError ? (
            <p className="error">Daftar kehadiran gagal dimuat.</p>
          ) : attendance.data?.length ? (
            <>
              <input
                className="search-input"
                placeholder="Cari nama siswa pada rombel ini"
                aria-label="Cari nama siswa pada rombel ujian"
                value={studentQuery}
                onChange={(change) => setStudentQuery(change.target.value)}
              />
              <div className="recent-table">
              <table>
                <thead><tr><th>Nama</th><th>NISN</th><th>Status</th><th>Waktu scan</th><th>Aksi</th></tr></thead>
                <tbody>
                  {visibleAttendance.map((item) => (
                    <tr key={item.student_id}>
                      <td data-label="Nama">{item.full_name}</td>
                      <td data-label="NISN">{item.nisn || "-"}</td>
                      <td data-label="Status">
                        {item.status ? (
                          <span className={`status-badge status-${item.status.toLowerCase()}`}>{item.status}</span>
                        ) : <span className="muted">Belum hadir</span>}
                      </td>
                      <td data-label="Waktu scan">{item.recorded_at ? new Date(item.recorded_at).toLocaleTimeString("id-ID") : "-"}</td>
                      <td data-label="Aksi">
                        {!item.status && (
                          <button
                            className="button-with-icon"
                            type="button"
                            disabled={!sessionOpen || record.isPending}
                            onClick={() => sessionOpen && record.mutate(item.student_id)}
                          >
                            Hadir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
                {!visibleAttendance.length && <p className="muted">Siswa tidak ditemukan pada rombel ini.</p>}
              </div>
            </>
          ) : (
            <p className="muted">Tidak ada siswa aktif pada rombel ujian.</p>
          )}
        </section>
      </div>
      <BarcodeScannerModal
        open={scannerOpen}
        busy={record.isPending}
        message={scannerMessage}
        messageError={scannerMessageError}
        onClose={closeScanner}
        onScan={scan}
      />
      {notice && <Toast {...notice} onClose={() => setNotice(null)} />}
    </AdminLayout>
  );
}
