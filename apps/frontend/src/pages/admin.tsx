import Link from "next/link";
import {useQuery} from "@tanstack/react-query";
import {ArrowUpRight, CheckCircle2, Clock3, GraduationCap, Layers3, Users, XCircle} from "lucide-react";
import AdminLayout from "../components/AdminLayout";
import StatCard from "../components/StatCard";
import {api} from "../services/api";
import type {AcademicYear, DailyAttendance, Rombel, Student, User} from "../types";

export default function AdminDashboard() {
    const users = useQuery<User[]>({
        queryKey: ["users"],
        queryFn: async () => (await api.get("/management/users")).data
    });
    const students = useQuery<Student[]>({
        queryKey: ["management-students"],
        queryFn: async () => (await api.get("/management/students", {params: {limit: 100}})).data
    });
    const rombels = useQuery<Rombel[]>({
        queryKey: ["rombels"],
        queryFn: async () => (await api.get("/management/rombels")).data
    });
    const years = useQuery<AcademicYear[]>({
        queryKey: ["academic-years"],
        queryFn: async () => (await api.get("/management/academic-years")).data
    });
    const attendance = useQuery<DailyAttendance[]>({
        queryKey: ["daily"],
        queryFn: async () => (await api.get("/attendance/daily")).data
    });
    const loading = [users, students, rombels, years, attendance].some((query) => query.isLoading);
    const logs = attendance.data || [];
    const activeYear = years.data?.find((year) => year.is_active);
    const hadir = logs.filter((log) => log.status === "HADIR" || log.status === "TERLAMBAT").length;
    const izin = logs.filter((log) => log.status === "IZIN" || log.status === "SAKIT").length;

    return <AdminLayout adminOnly title="Dashboard"
                        description="Pantau aktivitas dan data operasional sekolah dalam satu tempat.">
        {loading ? <div className="dashboard-loading flex min-h-40 items-center justify-center gap-2">
            <div className="loading-spinner"/>
            <span>Memuat ringkasan data...</span></div> : <>
            <section className="stat-grid">
                <StatCard label="Total Siswa" value={students.data?.length || 0}
                          helper="Siswa aktif terdata" icon={GraduationCap}
                          tone="blue"/>
                <StatCard label="Total User"
                          value={users.data?.filter((user) => user.is_active).length || 0}
                          helper="Admin dan guru aktif" icon={Users}
                          tone="violet"/><StatCard
                label="Total Rombel" value={rombels.data?.length || 0} helper="Kelompok belajar" icon={Layers3}
                tone="amber"/>
                <StatCard label="Hadir Hari Ini" value={hadir}
                          helper={activeYear ? activeYear.year_name : "Belum ada tahun aktif"}
                          icon={CheckCircle2} tone="green"/></section>
            <section className="dashboard-grid">
                <article className="panel attendance-summary">
                    <div className="panel-heading">
                        <div><p className="eyebrow">KEHADIRAN</p><h3>Ringkasan absensi</h3></div>
                        <Link href="/attendance" className="text-link">Lihat absensi <ArrowUpRight size={15}/></Link>
                    </div>
                    <div className="summary-row">
                        <div className="summary-number"><strong>{logs.length}</strong><span>Total catatan</span></div>
                        <div className="summary-item"><CheckCircle2 size={18}/>
                            <div><strong>{hadir}</strong><span>Hadir / terlambat</span></div>
                        </div>
                        <div className="summary-item warning"><Clock3 size={18}/>
                            <div><strong>{izin}</strong><span>Izin / sakit</span></div>
                        </div>
                        <div className="summary-item danger"><XCircle size={18}/>
                            <div><strong>{Math.max((students.data?.length || 0) - logs.length, 0)}</strong><span>Belum tercatat</span>
                            </div>
                        </div>
                    </div>
                </article>
                <article className="panel quick-actions">
                    <div className="panel-heading">
                        <div><p className="eyebrow">AKSES CEPAT</p><h3>Kelola sistem</h3></div>
                    </div>
                    <Link href="/management" className="quick-action"><span
                        className="quick-action-icon blue-bg"><Layers3
                        size={18}/></span><span><strong>Master data</strong><small>Kelola siswa, user, dan rombel</small></span><ArrowUpRight
                        size={17}/></Link><Link href="/attendance" className="quick-action"><span
                    className="quick-action-icon green-bg"><CheckCircle2
                    size={18}/></span><span><strong>Absensi harian</strong><small>Catat kehadiran siswa</small></span><ArrowUpRight
                    size={17}/></Link></article>
            </section>
            <section className="panel recent-panel">
                <div className="panel-heading">
                    <div><p className="eyebrow">AKTIVITAS TERBARU</p><h3>Log absensi</h3></div>
                    <Link href="/attendance" className="text-link">Lihat semua <ArrowUpRight size={15}/></Link></div>
                {logs.length ? <div className="recent-table">
                        <table>
                            <thead>
                            <tr>
                                <th>Siswa</th>
                                <th>Tanggal</th>
                                <th>Waktu masuk</th>
                                <th>Status</th>
                            </tr>
                            </thead>
                            <tbody>{logs.slice(0, 6).map((log) => <tr key={log.id}>
                                <td>
                                    <div className="student-cell"><span
                                        className="mini-avatar">{log.student_name?.slice(0, 1).toUpperCase() || "?"}</span><span>{log.student_name || "-"}</span>
                                    </div>
                                </td>
                                <td>{log.date}</td>
                                <td>{log.check_in_time ? new Date(log.check_in_time).toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit"
                                }) : "-"}</td>
                                <td><span className={`status-badge status-${log.status.toLowerCase()}`}>{log.status}</span>
                                </td>
                            </tr>)}</tbody>
                        </table>
                    </div> :
                    <div className="empty-state">
                        <CheckCircle2 size={28}/><strong>Belum ada aktivitas</strong><span>Catatan absensi akan muncul di sini.</span>
                    </div>}</section>
        </>}
    </AdminLayout>;
}
