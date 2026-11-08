# Rencana fondasi CBT

**Status: ON-HOLD** — Dokumen ini menjadi acuan pengembangan berikutnya. Belum ada implementasi yang dimulai; lanjutkan hanya setelah pekerjaan CBT diaktifkan kembali.

## Masalah dan pendekatan

Sistem saat ini sudah memiliki jadwal ujian (`EXAM`), tetapi belum memiliki akun siswa maupun fitur ujian digital. Bangun CBT MVP di atas jadwal tersebut: guru/admin menyiapkan ujian pilihan ganda, siswa masuk dengan akun yang terhubung ke data siswa dan mengerjakan ujian lewat antarmuka mobile-first, lalu backend menyimpan jawaban, batas waktu, nilai, dan catatan pelanggaran.

Fondasi backend mencakup model ujian, soal, opsi, percobaan, jawaban, dan peristiwa keamanan yang terhubung ke jadwal ujian dan siswa; migration Alembic; API ber-RBAC; serta penilaian pilihan ganda di server. Tambahkan peran `SISWA` dan relasi akun-siswa agar identitas serta kelayakan peserta diverifikasi dari server, bukan dari data browser.

Di frontend Pages Router, sediakan alur pengelolaan/penerbitan ujian untuk staf dan alur siswa untuk daftar ujian, instruksi, pengerjaan satu soal per tampilan, autosave, timer, pemulihan percobaan yang belum selesai, dan pengumpulan jawaban. Semua layout mengutamakan layar ponsel dan target sentuh minimal 44×44 px.

## Batasan pengamanan tab

Browser web tidak dapat menjamin siswa tidak berpindah tab/aplikasi atau menutup halaman; khususnya browser ponsel tidak konsisten mendukung fullscreen dan tidak memberi aplikasi kendali atas perpindahan aplikasi. Terapkan pencegahan terbaik: jelaskan aturan sebelum mulai, minta fullscreen bila tersedia, deteksi halaman tersembunyi/perpindahan fokus, catat pelanggaran di server, dan tampilkan peringatan. Pengumpulan otomatis karena pelanggaran berulang perlu diputuskan sebagai kebijakan sekolah; jangan menjanjikan pencegahan yang secara teknis tidak dapat dijamin.

## Todo pengembangan

1. **Menetapkan identitas siswa dan skema CBT** — Tambahkan role siswa dan pengaitan akun ke siswa, rancangkan model CBT yang terhubung ke jadwal EXAM, serta migration Alembic dan aturan status/attempt satu kali.
2. **Membangun API dan aturan ujian** — Provisioning/reset kredensial siswa oleh admin, pengelolaan dan publikasi soal pilihan ganda, pemeriksaan jadwal/kelas/attempt, autosave dan finalisasi idempoten, batas waktu server, penilaian, serta pencatatan pelanggaran.
3. **Membangun pengalaman CBT mobile-first** — UI staf untuk menyiapkan ujian pada jadwal yang ada dan UI siswa untuk masuk, mengerjakan, menyimpan, mengumpulkan, melihat status, dan mendapat peringatan perpindahan tab.
4. **Memverifikasi alur dan dokumentasi** — Tambahkan pengujian skema, izin, kelayakan peserta, timing, scoring, penyimpanan jawaban, finalisasi, dan pencatatan pelanggaran; perbarui spesifikasi API/skema aktual dan verifikasi build frontend.

Urutan: todo 2 bergantung pada todo 1; todo 3 bergantung pada todo 1 dan 2; todo 4 bergantung pada todo 2 dan 3.

## Di luar cakupan MVP

Tidak mencakup soal esai, bank soal lintas ujian/acak, analitik lanjutan, pengawasan kamera, mode offline, aplikasi native/kiosk, atau jaminan bahwa browser dapat dikunci. Pilihan ganda satu jawaban dan penilaian server cukup untuk memvalidasi fondasi sebelum fitur CBT kompleks ditambahkan.

## Acuan repo

Instruksi merujuk `system-prompt.md`, `architecture-and-schema.md`, dan `api-specifications.md`, tetapi berkas itu tidak ada pada root. Konteks yang tersedia ada di `docs/ai_agent_rules_instructions.md`, `docs/architecture_and_database_schema.md`, dan `docs/fastapi_endpoints_specification.md`; ketiganya menjadi acuan rencana ini.
