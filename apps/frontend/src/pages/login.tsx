import { FormEvent, useState } from "react";
import { useRouter } from "next/router";
import {
    Eye,
    EyeOff,
    GraduationCap,
    LayoutDashboard,
    LockKeyhole,
    LogIn,
    ShieldCheck,
    UserRound,
} from "lucide-react";
import { api } from "../services/api";

export default function Login() {
    const router = useRouter();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError("");
        setLoading(true);
        try {
            const {data} = await api.post("/auth/login", {username, password});
            localStorage.setItem("access_token", data.access_token);
            await router.push(data.user.role === "ADMIN" ? "/admin" : "/attendance");
        } catch {
            setError("Username atau password salah. Silakan coba lagi.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className="login-page grid min-h-screen lg:grid-cols-2">
            <section className="login-showcase flex flex-col p-6 md:p-10">
                <div className="login-brand">
                    <span className="login-brand-mark">
                        <img src="/logo.png" alt="Logo SMPI Bina Cendekia Aqwam" />
                    </span>
                    <span>
                        <strong>SMPI</strong>
                        <small>Bina Cendekia Aqwam</small>
                    </span>
                </div>

                <div className="login-showcase-content">
                    <div className="login-illustration">
                        <GraduationCap size={76} strokeWidth={1.35} />
                        <span className="login-illustration-dot login-dot-one" />
                        <span className="login-illustration-dot login-dot-two" />
                        <span className="login-illustration-dot login-dot-three" />
                    </div>
                    <p className="eyebrow">PANEL ADMINISTRASI SEKOLAH</p>
                    <h1>Kelola absensi dengan lebih mudah.</h1>
                    <p>
                        Satukan data siswa, jadwal, guru, dan kehadiran dalam satu ruang kerja yang sederhana.
                    </p>
                    <div className="login-features">
                        <span>
                            <LayoutDashboard size={15} />
                            Dashboard terpusat
                        </span>
                        <span>
                            <ShieldCheck size={15} />
                            Data lebih teratur
                        </span>
                    </div>
                </div>

                <p className="login-showcase-footer">Absensi Siswa SMPI · Bina Cendekia Aqwam</p>
            </section>

            <section className="login-form-area flex items-center justify-center p-4 md:p-8">
                <form className="login-card w-full max-w-md" onSubmit={submit}>
                    <div className="login-form-heading">
                        <span className="login-mobile-mark">
                            <img src="/logo.png" alt="Logo SMPI Bina Cendekia Aqwam" />
                        </span>
                        <p className="eyebrow">SELAMAT DATANG</p>
                        <h2>Masuk ke akun Anda</h2>
                        <p>Gunakan akun admin atau guru untuk melanjutkan.</p>
                    </div>

                    <div className="login-fields grid gap-3">
                        <label htmlFor="username">
                            Username
                            <div className="login-input-wrap">
                                <UserRound size={17} />
                                <input
                                    id="username"
                                    autoComplete="username"
                                    value={username}
                                    onChange={(event) => setUsername(event.target.value)}
                                    placeholder="Masukkan username"
                                    required
                                />
                            </div>
                        </label>

                        <label htmlFor="password">
                            Password
                            <div className="login-input-wrap">
                                <LockKeyhole size={17} />
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                    placeholder="Masukkan password"
                                    minLength={6}
                                    required
                                />
                                <button
                                    className="login-password-toggle icon-button"
                                    type="button"
                                    aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                                    onClick={() => setShowPassword((value) => !value)}
                                >
                                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                                </button>
                            </div>
                        </label>
                    </div>

                    {error && (
                        <p className="login-error" role="alert">
                            {error}
                        </p>
                    )}

                    <button className="login-submit button-with-icon" type="submit" disabled={loading}>
                        {loading ? (
                            <span className="loading-spinner" />
                        ) : (
                            <LogIn size={17} aria-hidden="true" />
                        )}
                        {loading ? "Memproses..." : "Masuk ke dashboard"}
                    </button>

                    <p className="login-help">Pastikan username dan password Anda sudah benar.</p>
                </form>
            </section>
        </main>
    );
}
