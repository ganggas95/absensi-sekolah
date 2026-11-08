import Link from "next/link";

export default function Home() { return <main className="flex min-h-screen items-center justify-center p-4"><div className="card grid w-full max-w-xl gap-4"><h1>Absensi Siswa SMPI</h1><p className="muted">MVP administrasi dan pencatatan absensi harian.</p><div className="toolbar flex flex-wrap gap-2"><Link href="/login">Masuk</Link><Link href="/attendance">Buka absensi</Link><Link href="/management">Master data</Link></div></div></main>; }
