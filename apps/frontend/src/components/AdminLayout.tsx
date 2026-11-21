import {ReactNode, useEffect, useState} from "react";
import {useRouter} from "next/router";
import Link from "next/link";
import {api} from "../services/api";
import type {User} from "../types";
import {
    Bell,
    BookOpen,
    CalendarDays,
    CheckSquare,
    ChevronRight,
    Database,
    FileText,
    GraduationCap,
    LayoutDashboard,
    LogOut,
    Menu,
    Settings,
    UserCheck,
    Users,
    UserRound,
    X
} from "lucide-react";
import type {LucideIcon} from "lucide-react";

type AdminLayoutProps = { children: ReactNode; title?: string; description?: string; adminOnly?: boolean };
type NavItem = { label: string; href: string; icon: LucideIcon; disabled?: boolean };
type NavEntry = NavItem | { label: string; icon: LucideIcon; children: NavItem[] };

const adminNav: NavEntry[] = [
    {label: "Dashboard", href: "/admin", icon: LayoutDashboard},
    {
        label: "Master Data", icon: Database, children: [
            {label: "Tahun Ajaran", href: "/management/academic-years", icon: CalendarDays},
            {label: "User", href: "/management/users", icon: Users},
            {label: "Guru", href: "/management/teachers", icon: UserRound},
            {label: "Mata Pelajaran", href: "/management/subjects", icon: BookOpen},
            {label: "Rombel", href: "/management/rombels", icon: Database},
            {label: "Siswa", href: "/management/students", icon: GraduationCap},
        ]
    },
    {
        label: "Rekam Absensi", icon: CheckSquare, children: [
            {label: "Absensi Harian", href: "/attendance", icon: CheckSquare},
            {label: "Absensi Ujian", href: "/exam-attendance", icon: CheckSquare},
        ]
    },
    {
        label: "Data Jadwal", icon: CalendarDays, children: [
            {label: "Jadwal Mapel", href: "/schedules/subjects", icon: BookOpen},
            {label: "Grid Jadwal", href: "/schedules/weekly", icon: CalendarDays},
            {label: "Periode Ujian", href: "/schedules/exam-periods", icon: CalendarDays},
            {label: "Jadwal Ujian", href: "/schedules/exams", icon: CalendarDays},
            {label: "Jadwal Istirahat", href: "/schedules/breaks", icon: CalendarDays},
        ]
    },
    {
        label: "Data Kartu", icon: GraduationCap, children: [
            {label: "Kartu Pelajar", href: "/cards", icon: GraduationCap},
            {label: "Kartu Ujian", href: "/exam-cards", icon: GraduationCap},
        ]
    },
    {label: "Absensi Guru", href: "/teacher-attendance", icon: UserCheck},
    {label: "Laporan", href: "/reports", icon: FileText},
];

export default function AdminLayout({children, title, description, adminOnly = false}: AdminLayoutProps) {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [ready, setReady] = useState(false);
    const [open, setOpen] = useState(false);
    const [openNavGroup, setOpenNavGroup] = useState<string | null>(null);

    useEffect(() => {
        let mounted = true;

        async function loadUser() {
            if (!localStorage.getItem("access_token")) {
                await router.replace("/login");
                return;
            }
            try {
                const {data} = await api.get<User>("/auth/me");
                if (!mounted) return;
                if (adminOnly && data.role !== "ADMIN") {
                    await router.replace("/attendance");
                    return;
                }
                setUser(data);
                setReady(true);
            } catch {
                localStorage.removeItem("access_token");
                await router.replace("/login");
            }
        }

        loadUser();
        return () => {
            mounted = false;
        };
    }, [adminOnly, router]);

    useEffect(() => {
        const activeGroup = adminNav.find((item) =>
            "children" in item && item.children.some((child) => router.pathname === child.href)
        );
        if (activeGroup) setOpenNavGroup(activeGroup.label);
    }, [router.pathname]);

    function logout() {
        localStorage.removeItem("access_token");
        router.push("/login");
    }

    if (!ready || !user) return <main className="page-loading flex min-h-screen items-center justify-center gap-2">
        <div className="loading-spinner"/>
        <span>Memuat dashboard...</span></main>;

    const nav = user.role === "ADMIN" ? adminNav : adminNav.flatMap((item) => {
        if ("children" in item) {
            const children = item.children.filter((child) => ["/attendance", "/exam-attendance"].includes(child.href));
            return children.length ? [{...item, children}] : [];
        }
        return [];
    });
    return <div className="app-shell min-h-screen">
        {open && <button className="sidebar-backdrop" aria-label="Tutup menu" onClick={() => setOpen(false)}/>}
        <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
            <div className="sidebar-brand">
                <div className="brand-mark"><img src="/logo.png" alt="Logo SMPI Bina Cendekia Aqwam"/></div>
                <div><strong>SMPI</strong><span>Bina Cendekia Aqwam</span></div>
                <button className="icon-button mobile-only" aria-label="Tutup menu" onClick={() => setOpen(false)}><X
                    size={20}/></button>
            </div>
            <div className="sidebar-section-label">MENU UTAMA</div>
            <nav className="sidebar-nav">{nav.map((item) => {
                if ("children" in item) {
                    const Icon = item.icon;
                    const groupActive = item.children.some((child) => router.pathname === child.href);
                    const groupOpen = openNavGroup === item.label;
                    return <div className="nav-group" key={item.label}>
                        <button className={`nav-item nav-group-toggle ${groupActive ? "nav-group-active" : ""}`}
                                aria-expanded={groupOpen}
                                onClick={() => setOpenNavGroup(groupOpen ? null : item.label)}>
                            <Icon size={18}/><span>{item.label}</span>
                            <ChevronRight className={`nav-group-chevron ${groupOpen ? "nav-group-chevron-open" : ""}`}
                                          size={16}/>
                        </button>
                        {groupOpen && <div className="nav-children">{item.children.map((child) => {
                            const ChildIcon = child.icon;
                            const active = router.pathname === child.href;
                            return <Link className={`nav-item nav-child ${active ? "nav-active" : ""}`}
                                         href={child.href} key={child.label} onClick={() => setOpen(false)}>
                                <ChildIcon size={16}/><span>{child.label}</span>{active &&
                                <ChevronRight className="nav-chevron" size={15}/>}
                            </Link>;
                        })}</div>}
                    </div>;
                }
                const Icon = item.icon;
                const active = router.pathname === item.href;
                return item.disabled
                    ? <span className="nav-item nav-disabled" key={item.label}><Icon
                        size={18}/><span>{item.label}</span><small>Segera</small></span>
                    : <Link className={`nav-item ${active ? "nav-active" : ""}`} href={item.href} key={item.label}
                            onClick={() => setOpen(false)}>
                        <Icon size={18}/><span>{item.label}</span>{active &&
                        <ChevronRight className="nav-chevron" size={16}/>}
                    </Link>;
            })}</nav>
            {/*{user.role === "ADMIN" &&*/}
            {/*    <div className="sidebar-bottom"><Link className="nav-item" href="/management"><Settings*/}
            {/*        size={18}/><span>Pengaturan</span></Link></div>}*/}
            <div className="sidebar-user sidebar-bottom">
                <div className="avatar">{user.full_name.charAt(0).toUpperCase()}</div>
                <div className="user-meta">
                    <strong>{user.full_name}</strong><span>{user.role === "ADMIN" ? "Administrator" : "Guru"}</span>
                </div>
                <button className="icon-button" aria-label="Keluar" onClick={logout}><LogOut size={18}/></button>
            </div>
        </aside>
        <div className="main-shell min-w-0">
            <header className="topbar">
                <button className="icon-button mobile-menu-button" aria-label="Buka menu" onClick={() => setOpen(true)}>
                    <Menu size={22}/></button>
                <div className="topbar-title"><span>Panel Administrasi</span>{title && <h1>{title}</h1>}</div>
                <div className="topbar-actions">
                    <button className="icon-button notification-button" aria-label="Notifikasi"><Bell size={19}/><i/>
                    </button>
                    <div className="topbar-avatar">{user.full_name.charAt(0).toUpperCase()}</div>
                </div>
            </header>
            <main className="content-area min-w-0">{description && <div className="page-intro">
                <div><p className="eyebrow">OVERVIEW</p><h2>{title}</h2><p>{description}</p></div>
            </div>}{children}</main>
        </div>
    </div>;
}
