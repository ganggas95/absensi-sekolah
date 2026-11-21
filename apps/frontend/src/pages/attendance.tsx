import { FormEvent, useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, ScanLine } from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import ScheduleTimeWarning from "../components/ScheduleTimeWarning";
import Toast, { ToastVariant } from "../components/Toast";
import { api } from "../services/api";
import type { AttendanceSession, DailyAttendance, Rombel, ScheduleEvent, Student } from "../types";

function attendanceError(error: any): { title: string; message: string; variant: ToastVariant } {
  const detail = String(error?.response?.data?.detail || "");
  if (error?.response?.status === 404 || detail.includes("Siswa tidak ditemukan")) return { title: "Siswa tidak ditemukan", message: "Periksa kembali NISN atau QR Code yang dipindai.", variant: "error" };
  if (detail.includes("tidak aktif")) return { title: "Siswa tidak aktif", message: "Siswa sudah tidak aktif sehingga absensi tidak dapat dicatat.", variant: "warning" };
  if (detail.includes("bukan waktu absensi")) return { title: "Di luar waktu absensi", message: "Absensi hanya dapat dicatat sesuai jadwal yang telah dikonfigurasi.", variant: "warning" };
  return { title: "Absensi gagal", message: "Absensi gagal disimpan. Silakan coba lagi.", variant: "error" };
}

export default function Attendance() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [nisn, setNisn] = useState("");
  const [message, setMessage] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const [toast, setToast] = useState<{ title: string; message: string; variant: ToastVariant } | null>(null);

  const schedules = useQuery<ScheduleEvent[]>({
    queryKey: ["daily-attendance-schedules"],
    queryFn: async () => (await api.get("/attendance/daily/schedules")).data,
  });
  const rombels = useQuery<Rombel[]>({
    queryKey: ["rombels"],
    queryFn: async () => (await api.get("/management/rombels")).data,
  });
  const selectedSchedule = schedules.data?.find((schedule) => schedule.id === scheduleId);
  const selectedRombelIds = selectedSchedule?.rombel_ids?.length
    ? selectedSchedule.rombel_ids
    : selectedSchedule ? [selectedSchedule.rombel_id] : [];
  const selectedRombelNames = selectedRombelIds
    .map((id) => rombels.data?.find((rombel) => rombel.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const sessions = useQuery<AttendanceSession[]>({
    queryKey: ["attendance-session", selectedSchedule?.id],
    queryFn: async () => (await api.get("/attendance/daily/sessions", {
      params: { schedule_event_id: selectedSchedule!.id },
    })).data,
    enabled: Boolean(selectedSchedule),
  });
  // The backend persists one session per schedule and date, so reloading the
  // page (or switching back to this schedule) restores the exact same scope.
  const session = sessions.data?.[0];
  const sessionOpen = Boolean(session?.is_open);
  const sessionClosed = Boolean(session && !session.is_open);
  const students = useQuery<Student[]>({
    queryKey: ["attendance-students", selectedRombelIds, q],
    queryFn: async () => {
      const results = await Promise.all(selectedRombelIds.map(async (rombelId) =>
        (await api.get<Student[]>("/management/students", {
          params: { rombel_id: rombelId, ...(q.trim() ? { q: q.trim() } : {}) },
        })).data
      ));
      return results.flat();
    },
    enabled: Boolean(selectedSchedule),
  });
  const logs = useQuery<DailyAttendance[]>({
    queryKey: ["daily", session?.id],
    queryFn: async () => (await api.get("/attendance/daily", {
      params: { session_id: session!.id },
    })).data,
    enabled: Boolean(session),
  });
  const openSession = useMutation({
    mutationFn: async (scheduleEventId: string) =>
      (await api.post("/attendance/daily/sessions/open", { schedule_event_id: scheduleEventId })).data as AttendanceSession,
    onSuccess: (data) => {
      queryClient.setQueryData(["attendance-session", data.schedule_event_id], [data]);
      queryClient.invalidateQueries({ queryKey: ["attendance-session"] });
      setMessage("Sesi absensi dibuka dan tersimpan untuk jadwal ini.");
    },
    onError: () => setToast({
      title: "Sesi absensi gagal dibuka",
      message: "Sesi absensi gagal dibuka. Silakan coba lagi.",
      variant: "error",
    }),
  });
  const closeSession = useMutation({
    mutationFn: async (sessionId: string) =>
      (await api.post(`/attendance/daily/sessions/${sessionId}/close`)).data as AttendanceSession,
    onSuccess: (data) => {
      queryClient.setQueryData(["attendance-session", data.schedule_event_id], [data]);
      queryClient.invalidateQueries({ queryKey: ["attendance-session"] });
      queryClient.invalidateQueries({ queryKey: ["daily"] });
      setScannerOpen(false);
      setMessage("Sesi absensi ditutup.");
    },
    onError: () => setToast({
      title: "Sesi absensi gagal ditutup",
      message: "Sesi absensi gagal ditutup. Silakan coba lagi.",
      variant: "error",
    }),
  });
  const record = useMutation({
    mutationFn: async ({ value }: { value: string; label?: string }) => {
      if (!sessionOpen || !session) {
        throw new Error("Buka sesi absensi sebelum mencatat kehadiran.");
      }
      const identifier = value.trim();
      const payload = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier)
        ? { session_id: session.id, id_siswa: identifier, check_in: true }
        : { session_id: session.id, nisn: identifier, check_in: true };
      return (await api.post("/attendance/daily/record", payload)).data as DailyAttendance & { already_recorded?: boolean };
    },
    onMutate: () => setToast(null),
    onSuccess: (data, input) => {
      setNisn("");
      const label = input.label || input.value;
      const resultMessage = data.already_recorded
        ? `${label} sudah tercatat pada sesi ini.`
        : data.status === "TERLAMBAT"
          ? `${label} tercatat sebagai terlambat.`
          : `${label} berhasil tercatat hadir.`;
      setMessage(resultMessage);
      setScannerMessage(resultMessage);
      setToast({
        title: data.already_recorded ? "Sudah tercatat" : data.status === "TERLAMBAT" ? "Absensi terlambat" : "Absensi berhasil",
        message: resultMessage,
        variant: data.status === "TERLAMBAT" ? "warning" : "success",
      });
      queryClient.invalidateQueries({ queryKey: ["daily"] });
    },
    onError: (error: any) => {
      const friendly = attendanceError(error);
      setMessage(friendly.message);
      setScannerMessage(friendly.message);
      setToast(friendly);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (sessionOpen && nisn.trim()) record.mutate({ value: nisn });
  };
  const openScanner = () => {
    if (!sessionOpen || !selectedSchedule) return;
    setScannerMessage("");
    setScannerOpen(true);
  };
  const closeScanner = () => {
    if (!record.isPending) setScannerOpen(false);
  };
  const scan = useCallback(async (value: string) => {
    if (!sessionOpen) return;
    try {
      await record.mutateAsync({ value });
    } catch {
      // Mutation error handling updates the Toast and scanner message.
    }
  }, [record, sessionOpen]);

  return (
    <AdminLayout title="Absensi Harian" description="Catat kehadiran dengan scan kartu atau cari siswa berdasarkan rombel dan nama.">
      <div className="attendance-page grid gap-4">
        <section className="panel exam-attendance-tools">
          <div>
            <p className="eyebrow">JADWAL HARI INI</p>
            <h3>Pilih jadwal aktif</h3>
          </div>
          {schedules.data && schedules.data.length > 0 && (
            <div className="daily-schedule-options" aria-label="Pilih jadwal aktif hari ini">
              {schedules.data.map((schedule) => {
                const selected = scheduleId === schedule.id;
                const rombelNames = (schedule.rombel_ids || [schedule.rombel_id])
                  .map((id) => rombels.data?.find((rombel) => rombel.id === id)?.name)
                  .filter((name): name is string => Boolean(name));
                return (
                  <button
                    className={`daily-schedule-option ${selected ? "daily-schedule-option-selected" : ""}`}
                    type="button"
                    key={schedule.id}
                    aria-pressed={selected}
                    onClick={() => {
                      setScheduleId(schedule.id);
                      setScannerOpen(false);
                      setQ("");
                      setNisn("");
                      setMessage("");
                      setToast(null);
                    }}
                  >
                    <strong>{schedule.title}</strong>
                    <span>{rombelNames.join(", ") || "Rombel"}</span>
                    <span>{schedule.start_time}–{schedule.end_time}</span>
                  </button>
                );
              })}
            </div>
          )}
          {selectedSchedule && (
            <div className="attendance-session-controls">
              <ScheduleTimeWarning schedule={selectedSchedule} />
              {sessionOpen ? (
                <button type="button" className="attendance-session-close" onClick={() => session && closeSession.mutate(session.id)} disabled={closeSession.isPending}>
                  Tutup sesi absensi
                </button>
              ) : (
                <button type="button" onClick={() => openSession.mutate(selectedSchedule.id)} disabled={openSession.isPending || sessions.isLoading}>
                  Buka sesi absensi
                </button>
              )}
              {sessionOpen && (
                <p className="attendance-session-open" role="status">
                  Sesi absensi dibuka dan tersimpan. Pemindaian dan pencatatan kehadiran tersedia.
                </p>
              )}
              {sessionClosed && (
                <p className="muted" role="status">
                  Sesi absensi sudah ditutup. Buka kembali sesi untuk melanjutkan pencatatan.
                </p>
              )}
            </div>
          )}
          {schedules.isLoading && <p className="muted">Memuat jadwal hari ini...</p>}
          {schedules.isError && <p className="error">Jadwal absensi gagal dimuat.</p>}
          {!schedules.isLoading && schedules.data?.length === 0 && <p className="muted">Tidak ada jadwal aktif hari ini untuk akun Anda.</p>}
        </section>
        <form className="scan-card flex flex-col gap-3 md:flex-row md:items-center" onSubmit={submit}>
          <div className="scan-icon"><CheckCircle2 size={24} /></div>
          <div className="scan-copy">
            <strong>Catat kehadiran</strong>
            <span>Scan QR/barcode atau masukkan NISN</span>
          </div>
          <div className="scan-input-group">
            <input aria-label="Scan QR, barcode, atau masukkan NISN" placeholder="Scan QR/barcode atau NISN" value={nisn} onChange={(event) => setNisn(event.target.value)} disabled={!sessionOpen} required />
            <button className="scan-suffix-button" type="button" aria-label="Buka scanner QR atau barcode" onClick={openScanner} disabled={!sessionOpen}><ScanLine size={19} /></button>
          </div>
          <button className="button-with-icon" type="submit" disabled={!sessionOpen || record.isPending}><Check size={16} aria-hidden="true" />Tandai hadir</button>
        </form>
        {message && <p className="inline-message">{message}</p>}

        <div className="attendance-grid grid gap-4 lg:grid-cols-2">
          <div className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">DATA SISWA</p><h3>Daftar siswa</h3></div>
            </div>
            {selectedSchedule && <p className="muted">Rombel: {selectedRombelNames.join(", ") || "Memuat rombel..."}</p>}
            <input className="search-input" placeholder="Cari nama siswa" value={q} onChange={(event) => setQ(event.target.value)} disabled={!selectedSchedule} />
            {!selectedSchedule ? (
              <p className="muted">Pilih jadwal aktif untuk menampilkan daftar siswa.</p>
            ) : students.isLoading ? (
              <p>Memuat...</p>
            ) : students.isError ? (
              <p className="error">Daftar siswa gagal dimuat.</p>
            ) : students.data?.length ? (
              <table>
                <thead><tr><th>Nama</th><th>NISN</th><th>Aksi</th></tr></thead>
                <tbody>
                  {students.data.map((student) => (
                    <tr key={student.id}>
                      <td data-label="Nama">{student.full_name}</td>
                      <td data-label="NISN">{student.nisn || "-"}</td>
                      <td data-label="Aksi">
                        <button className="button-with-icon" type="button" disabled={!sessionOpen || record.isPending} onClick={() => sessionOpen && record.mutate({ value: student.id_siswa, label: student.full_name })}>
                          <Check size={14} aria-hidden="true" />Hadir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Siswa tidak ditemukan pada rombel jadwal ini.</p>
            )}
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div><p className="eyebrow">RIWAYAT SESI</p><h3>Log absensi sesi ini</h3></div>
            </div>
            {!selectedSchedule ? (
              <p className="muted">Pilih jadwal aktif untuk melihat log sesi absensi.</p>
            ) : !session ? (
              <p className="muted">Belum ada sesi absensi untuk jadwal ini. Buka sesi untuk mulai mencatat.</p>
            ) : logs.isLoading ? (
              <p>Memuat...</p>
            ) : logs.isError ? (
              <p className="error">Log absensi sesi gagal dimuat.</p>
            ) : logs.data?.length ? (
              <table>
                <thead><tr><th>Tanggal</th><th>Siswa</th><th>Waktu absensi</th><th>Status</th></tr></thead>
                <tbody>
                  {logs.data.map((log) => (
                    <tr key={log.id}>
                      <td data-label="Tanggal">{log.date}</td>
                      <td data-label="Siswa">{log.student_name || "-"}</td>
                      <td data-label="Waktu absensi">{log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                      <td data-label="Status"><span className={`status-badge status-${log.status.toLowerCase()}`}>{log.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="muted">Belum ada catatan pada sesi ini.</p>}
          </div>
        </div>
      </div>
      <BarcodeScannerModal open={scannerOpen} busy={record.isPending} message={scannerMessage} onClose={closeScanner} onScan={scan} />
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </AdminLayout>
  );
}
