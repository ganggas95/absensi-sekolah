import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {SlidersHorizontal} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import ModalDialog from "../components/ModalDialog";
import {api} from "../services/api";
import type {TeacherAttendance} from "../types/attendance";
import type {Teacher} from "../types/management";

type Filters = { start_date: string; end_date: string; teacher_id: string; status: string };
const initialFilters: Filters = {start_date: "", end_date: "", teacher_id: "", status: ""};
const statusLabels: Record<string, string> = {HADIR: "Hadir", TERLAMBAT: "Terlambat"};

function clock(value?: string | null) {
    if (!value) return "-";
    return new Date(value).toLocaleTimeString("id-ID", {
        hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar",
    });
}

function messageFromError(error: unknown) {
    if (typeof error === "object" && error !== null && "response" in error) {
        const detail = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail;
        if (detail) return detail;
    }
    return "Data absensi guru gagal dimuat. Silakan coba lagi.";
}

export default function TeacherAttendancePage() {
    const [filters, setFilters] = useState(initialFilters);
    const [applied, setApplied] = useState<Partial<Filters>>({});
    const [open, setOpen] = useState(false);
    const [formError, setFormError] = useState("");
    const teachers = useQuery<Teacher[]>({
        queryKey: ["teacher-attendance-teachers"],
        queryFn: async () => (await api.get("/management/teachers")).data,
    });
    const records = useQuery<TeacherAttendance[]>({
        queryKey: ["teacher-attendance-records", applied],
        queryFn: async () => (await api.get("/attendance/teacher/records", {params: applied})).data,
    });

    function apply(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (filters.start_date && filters.end_date && filters.start_date > filters.end_date) {
            setFormError("Tanggal mulai harus sebelum atau sama dengan tanggal selesai.");
            return;
        }
        setFormError("");
        setApplied(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as Partial<Filters>);
        setOpen(false);
    }

    function reset() {
        setFilters(initialFilters);
        setApplied({});
        setFormError("");
    }

    const rows = records.data || [];
    const hadir = rows.filter((row) => row.status === "HADIR").length;
    const terlambat = rows.filter((row) => row.status === "TERLAMBAT").length;
    const activeCount = Object.keys(applied).length;

    return <AdminLayout adminOnly title="Absensi Guru"
                        description="Pantau absen datang dan pulang guru pada hari mereka mengajar.">
        <div className="reports-page">
            <section className="panel reports-results">
                <div className="panel-heading">
                    <div><p className="eyebrow">KEHADIRAN GURU</p><h3>Absen Datang &amp; Pulang</h3></div>
                    <div className="reports-toolbar">
                        <button type="button" className="reports-filter-button" onClick={() => setOpen(true)}>
                            <SlidersHorizontal size={16}/>Filter absensi guru
                        </button>
                    </div>
                </div>
                {activeCount > 0 && <p className="reports-filter-caption">Filter aktif · {activeCount} kriteria</p>}
                {records.isLoading ? <p className="muted" role="status">Memuat absensi guru...</p>
                    : records.isError ? <p className="reports-error" role="alert">{messageFromError(records.error)}</p>
                        : <>
                            <div className="reports-summary">
                                <strong>{rows.length} catatan</strong>
                                <span>Hadir: <strong>{hadir}</strong></span>
                                <span>Terlambat: <strong>{terlambat}</strong></span>
                            </div>
                            {rows.length ? <div className="reports-table-scroll">
                                <table className="reports-table">
                                    <thead>
                                    <tr>
                                        <th>Tanggal</th>
                                        <th>Nama Guru</th>
                                        <th>NIP</th>
                                        <th>Datang</th>
                                        <th>Pulang</th>
                                        <th>Status</th>
                                    </tr>
                                    </thead>
                                    <tbody>{rows.map((row) => <tr key={row.id}>
                                        <td data-label="Tanggal">{row.date}</td>
                                        <td data-label="Nama Guru">{row.teacher_name || "-"}</td>
                                        <td data-label="NIP">{row.nip || "-"}</td>
                                        <td data-label="Datang">{clock(row.check_in_time)}</td>
                                        <td data-label="Pulang">{clock(row.check_out_time)}</td>
                                        <td data-label="Status">{statusLabels[row.status] || row.status}</td>
                                    </tr>)}</tbody>
                                </table>
                            </div> : <p className="reports-empty">Belum ada catatan absensi guru untuk filter ini.</p>}
                        </>}
            </section>
        </div>
        <ModalDialog open={open} title="Filter absensi guru" onClose={() => setOpen(false)}>
            <form className="reports-filter-grid" onSubmit={apply}>
                <label><span>Tanggal mulai</span><input aria-label="Tanggal mulai" type="date"
                                                        value={filters.start_date}
                                                        onChange={(event) => setFilters({...filters, start_date: event.target.value})}/></label>
                <label><span>Tanggal selesai</span><input aria-label="Tanggal selesai" type="date"
                                                          value={filters.end_date}
                                                          onChange={(event) => setFilters({...filters, end_date: event.target.value})}/></label>
                <label><span>Guru</span><select aria-label="Guru" value={filters.teacher_id}
                                                onChange={(event) => setFilters({...filters, teacher_id: event.target.value})}>
                    <option value="">Semua guru</option>
                    {teachers.data?.map((item) => <option key={item.id} value={item.id}>{item.full_name || item.username}</option>)}
                </select></label>
                <label><span>Status</span><select aria-label="Status" value={filters.status}
                                                  onChange={(event) => setFilters({...filters, status: event.target.value})}>
                    <option value="">Semua status</option>
                    <option value="HADIR">Hadir</option>
                    <option value="TERLAMBAT">Terlambat</option>
                </select></label>
                {formError && <p className="reports-error" role="alert">{formError}</p>}
                <div className="flex justify-end">
                    <div className="block self-end">
                        <button type="submit">Terapkan filter</button>
                        <button type="button" className="reports-reset ml-2" onClick={reset}>Reset</button>
                    </div>
                </div>
            </form>
        </ModalDialog>
    </AdminLayout>;
}
