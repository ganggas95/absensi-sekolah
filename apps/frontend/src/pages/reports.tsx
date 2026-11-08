import {useMemo, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {FileSpreadsheet, FileText, SlidersHorizontal} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import ModalDialog from "../components/ModalDialog";
import {api} from "../services/api";
import type {ExamPeriod, Rombel, ScheduleEvent, Student, Subject} from "../types";

type ReportType = "daily" | "class" | "exam";
type ReportFilters = {
    date_from: string;
    date_to: string;
    rombel_id: string;
    student_id: string;
    subject_id: string;
    schedule_event_id: string;
    exam_period_id: string;
    status: string;
};
type ReportRow = {
    date: string;
    student_name: string;
    nisn: string;
    rombel: string;
    subject: string;
    session: string;
    status: string;
    check_in: string;
    check_out: string;
    notes: string;
};
type ReportData = { total: number; summary: Record<string, number>; rows: ReportRow[] };

const initialFilters: ReportFilters = {
    date_from: "",
    date_to: "",
    rombel_id: "",
    student_id: "",
    subject_id: "",
    schedule_event_id: "",
    exam_period_id: "",
    status: "",
};
const reportNames: Record<ReportType, string> = {
    daily: "Absensi Harian",
    class: "Absensi KBM",
    exam: "Absensi Ujian",
};
const summaryLabels: Record<string, string> = {
    HADIR: "Hadir",
    TERLAMBAT: "Terlambat",
    IZIN: "Izin",
    SAKIT: "Sakit",
    ALPA: "Alpa",
};

function messageFromError(error: unknown) {
    if (typeof error === "object" && error !== null && "response" in error) {
        const response = (error as { response?: { data?: { detail?: string } } }).response;
        if (response?.data?.detail) return response.data.detail;
    }
    return "Laporan gagal dimuat. Silakan coba lagi.";
}

export default function ReportsPage() {
    const [type, setType] = useState<ReportType>("daily");
    const [filters, setFilters] = useState(initialFilters);
    const [applied, setApplied] = useState<Partial<ReportFilters> | null>(null);
    const [downloadError, setDownloadError] = useState("");
    const [studentSearch, setStudentSearch] = useState("");
    const [filtersOpen, setFiltersOpen] = useState(false);
    const rombels = useQuery<Rombel[]>({
        queryKey: ["report-rombels"],
        queryFn: async () => (await api.get("/management/rombels")).data,
    });
    const students = useQuery<Student[]>({
        queryKey: ["report-students", studentSearch, filters.rombel_id],
        queryFn: async () => (await api.get("/management/students", {
            params: {limit: 100, q: studentSearch || undefined, rombel_id: filters.rombel_id || undefined},
        })).data,
    });
    const subjects = useQuery<Subject[]>({
        queryKey: ["report-subjects"],
        queryFn: async () => (await api.get("/management/subjects")).data,
    });
    const periods = useQuery<ExamPeriod[]>({
        queryKey: ["report-periods"],
        queryFn: async () => (await api.get("/schedules/exam-periods")).data,
    });
    const events = useQuery<ScheduleEvent[]>({
        queryKey: ["report-events", type],
        queryFn: async () => (await api.get("/schedules/events", {
            params: {event_type: type === "exam" ? "EXAM" : "KBM"},
        })).data,
        enabled: type !== "daily",
    });
    const report = useQuery<ReportData>({
        queryKey: ["report-data", type, applied],
        queryFn: async () => (await api.get(`/reports/${type}`, {params: applied})).data,
        enabled: applied !== null,
    });
    const visibleEvents = useMemo(() => (events.data || []).filter((event) =>
        (!filters.rombel_id || (event.rombel_ids || [event.rombel_id]).includes(filters.rombel_id))
        && (!filters.subject_id || event.subject_id === filters.subject_id)
        && (type !== "exam" || !filters.exam_period_id || event.exam_period_id === filters.exam_period_id)
    ), [events.data, filters.rombel_id, filters.subject_id, filters.exam_period_id, type]);

    function changeType(value: ReportType) {
        setType(value);
        setFilters(initialFilters);
        setApplied(null);
        setStudentSearch("");
        setDownloadError("");
    }

    function changeFilter(key: keyof ReportFilters, value: string) {
        setApplied(null);
        setFilters((current) => ({
            ...current,
            [key]: value, ...(key === "rombel_id" || key === "subject_id" || key === "exam_period_id" ? {schedule_event_id: ""} : {})
        }));
    }

    function applyFilters(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) {
            setDownloadError("Tanggal mulai harus sebelum atau sama dengan tanggal selesai.");
            return;
        }
        const selected = Object.fromEntries(
            Object.entries(filters).filter(([key, value]) => value && (
                key === "date_from" || key === "date_to"
                || key === "rombel_id" || key === "student_id"
                || (type !== "daily" && (key === "subject_id" || key === "schedule_event_id"))
                || (type === "daily" && key === "status")
                || (type === "exam" && key === "exam_period_id")
            )),
        ) as Partial<ReportFilters>;
        setDownloadError("");
        setApplied(selected);
        setFiltersOpen(false);
    }

    async function download(format: "pdf" | "xlsx") {
        setDownloadError("");
        try {
            const response = await api.get(`/reports/${type}/export`, {
                params: {...applied, format},
                responseType: "blob",
            });
            const url = URL.createObjectURL(response.data);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `laporan-absensi-${type}.${format}`;
            anchor.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            setDownloadError(messageFromError(error));
        }
    }

    return <AdminLayout adminOnly title="Laporan"
                        description="Tinjau dan unduh laporan kehadiran berdasarkan filter yang dipilih.">
        <div className="reports-page">
            <section className="panel reports-results">
                <div className="panel-heading">
                    <div><p className="eyebrow">HASIL LAPORAN</p><h3>{reportNames[type]}</h3></div>
                    <div className="reports-toolbar">
                        <button type="button" className="reports-filter-button" onClick={() => setFiltersOpen(true)}>
                            <SlidersHorizontal size={16}/>Filter laporan
                        </button>
                        <div className="reports-downloads">
                            <button type="button" disabled={!report.data || report.isFetching}
                                    onClick={() => download("pdf")}><FileText size={16}/>Unduh PDF
                            </button>
                            <button type="button" disabled={!report.data || report.isFetching}
                                    onClick={() => download("xlsx")}><FileSpreadsheet size={16}/>Unduh Excel
                            </button>
                        </div>
                    </div>
                </div>
                {applied &&
                    <p className="reports-filter-caption">Filter aktif · {Object.keys(applied).length} kriteria</p>}
                {downloadError && !filtersOpen && <p className="reports-error" role="alert">{downloadError}</p>}
                {applied === null ? <p className="muted">Terapkan filter untuk menampilkan hasil laporan.</p>
                    : report.isLoading ? <p className="muted" role="status">Memuat laporan...</p>
                        : report.isError ?
                            <p className="reports-error" role="alert">{messageFromError(report.error)}</p>
                            : report.data && <>
                            <div className="reports-summary">
                                <strong>{report.data.total} catatan</strong>{Object.entries(report.data.summary).map(([status, count]) =>
                                <span key={status}>{summaryLabels[status] || status}: <strong>{count}</strong></span>)}
                            </div>
                            {report.data.rows.length ? <div className="reports-table-scroll">
                                <table className="reports-table">
                                    <thead>
                                    <tr>
                                        <th>Tanggal</th>
                                        <th>Nama Siswa</th>
                                        <th>NISN</th>
                                        <th>Rombel</th>
                                        {type !== "daily" && <>
                                            <th>Mata Pelajaran</th>
                                            <th>Sesi</th>
                                        </>}
                                        <th>Status</th>
                                        {type === "daily" && <>
                                            <th>Masuk</th>
                                            <th>Pulang</th>
                                        </>}
                                        <th>Catatan</th>
                                    </tr>
                                    </thead>
                                    <tbody>{report.data.rows.map((row, index) => <tr
                                        key={`${row.date}-${row.student_name}-${row.session}-${index}`}>
                                        <td data-label="Tanggal">{row.date}</td>
                                        <td data-label="Nama Siswa">{row.student_name}</td>
                                        <td data-label="NISN">{row.nisn || "-"}</td>
                                        <td data-label="Rombel">{row.rombel || "-"}</td>
                                        {type !== "daily" && <>
                                            <td data-label="Mata Pelajaran">{row.subject}</td>
                                            <td data-label="Sesi">{row.session}</td>
                                        </>}
                                        <td data-label="Status">{summaryLabels[row.status] || row.status}</td>
                                        {type === "daily" && <>
                                            <td data-label="Masuk">{row.check_in || "-"}</td>
                                            <td data-label="Pulang">{row.check_out || "-"}</td>
                                        </>}
                                        <td data-label="Catatan">{row.notes || "-"}</td>
                                    </tr>)}</tbody>
                                </table>
                            </div> : <p className="reports-empty">Tidak ada catatan absensi untuk filter ini.</p>}
                        </>}
            </section>
        </div>
        <ModalDialog open={filtersOpen} title="Filter laporan" onClose={() => setFiltersOpen(false)}>
            <form className="reports-filter-grid" onSubmit={applyFilters}>
                <label className="reports-type"><span>Jenis laporan</span><select aria-label="Jenis laporan"
                                                                                  value={type}
                                                                                  onChange={(event) => changeType(event.target.value as ReportType)}>
                    <option value="daily">Absensi Harian</option>
                    <option value="class">Absensi KBM</option>
                    <option value="exam">Absensi Ujian</option>
                </select></label>
                <label><span>Tanggal mulai</span><input aria-label="Tanggal mulai" type="date" value={filters.date_from}
                                                        onChange={(event) => changeFilter("date_from", event.target.value)}/></label>
                <label><span>Tanggal selesai</span><input aria-label="Tanggal selesai" type="date"
                                                          value={filters.date_to}
                                                          onChange={(event) => changeFilter("date_to", event.target.value)}/></label>
                {type === "daily" && <label><span>Rombel</span><select aria-label="Rombel" value={filters.rombel_id}
                                                                       onChange={(event) => changeFilter("rombel_id", event.target.value)}>
                    <option value="">Semua rombel</option>
                    {rombels.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select></label>}
                {type === "exam" &&
                    <label><span>Periode ujian</span><select aria-label="Periode ujian" value={filters.exam_period_id}
                                                             onChange={(event) => changeFilter("exam_period_id", event.target.value)}>
                        <option value="">Semua periode</option>
                        {periods.data?.map((item) => <option key={item.id}
                                                             value={item.id}>{item.period_type.replace("_", " ")} · {item.start_date} – {item.end_date}</option>)}
                    </select></label>}
                <label><span>Cari siswa</span>
                    <input aria-label="Cari siswa" type="search" value={studentSearch}
                           onChange={(event) => setStudentSearch(event.target.value)}
                           placeholder="Ketik nama atau NISN"/></label>
                {type === "daily" && <label><span>Siswa</span><select aria-label="Siswa" value={filters.student_id}
                                                                      onChange={(event) => changeFilter("student_id", event.target.value)}>
                    <option value="">Semua siswa</option>
                    {students.data?.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
                </select></label>}
                {type !== "daily" && <>
                    <label><span>Rombel</span><select aria-label="Rombel" value={filters.rombel_id}
                                                      onChange={(event) => changeFilter("rombel_id", event.target.value)}>
                        <option value="">Semua rombel</option>
                        {rombels.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select></label>
                    <label><span>Siswa</span><select aria-label="Siswa" value={filters.student_id}
                                                     onChange={(event) => changeFilter("student_id", event.target.value)}>
                        <option value="">Semua siswa</option>
                        {students.data?.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
                    </select></label>
                    <label><span>Mata pelajaran</span><select aria-label="Mata pelajaran" value={filters.subject_id}
                                                              onChange={(event) => changeFilter("subject_id", event.target.value)}>
                        <option value="">Semua mata pelajaran</option>
                        {subjects.data?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select></label>
                    <label><span>Sesi</span><select aria-label="Sesi" value={filters.schedule_event_id}
                                                    onChange={(event) => changeFilter("schedule_event_id", event.target.value)}>
                        <option value="">Semua sesi</option>
                        {visibleEvents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select></label>
                </>}
                {type === "daily" && <label><span>Status</span><select aria-label="Status" value={filters.status}
                                                                       onChange={(event) => changeFilter("status", event.target.value)}>
                    <option value="">Semua status</option>
                    <option value="HADIR">Hadir</option>
                    <option value="TERLAMBAT">Terlambat</option>
                    <option value="IZIN">Izin</option>
                    <option value="SAKIT">Sakit</option>
                    <option value="ALPA">Alpa</option>
                </select></label>}
                {downloadError && <p className="reports-error" role="alert">{downloadError}</p>}
                <div className={"flex justify-end"}>
                    <div className="block self-end">
                        <button type="submit">Terapkan filter</button>
                        <button type="button" className="reports-reset ml-2" onClick={() => {
                            setFilters(initialFilters);
                            setApplied(null);
                            setStudentSearch("");
                            setDownloadError("");
                        }}>Reset
                        </button>
                    </div>
                </div>
            </form>
        </ModalDialog>
    </AdminLayout>;
}
