# Absensi Siswa SMPI

MVP sistem absensi untuk Admin dan Guru. Backend memakai FastAPI + PostgreSQL, frontend memakai Next.js Pages Router dan TanStack Query.

## Menjalankan dengan Docker

Untuk akses dari perangkat lain di intranet, salin `.env.example` menjadi `.env`
di root project lalu isi `INTRANET_HOST` dengan hostname yang tercantum pada
sertifikat dan dapat diakses semua client. Ganti `JWT_SECRET_KEY` dan
`ADMIN_PASSWORD` sebelum seed admin pertama. Sediakan `cert/server.key` secara
aman di server; private key tidak disimpan di Git. Jalankan ulang build setelah
mengubahnya:

```bash
cp .env.example .env
# edit INTRANET_HOST, JWT_SECRET_KEY, dan ADMIN_PASSWORD di .env
docker compose up --build
docker compose exec backend alembic upgrade head
docker compose exec backend python scripts/seed_admin.py
```

Nginx menyajikan aplikasi melalui HTTPS pada port `443` dan mengalihkan HTTP
port `80` ke HTTPS. API diproxy di origin yang sama pada `/api`; port backend
dan frontend tidak dipublikasikan langsung ke jaringan. API docs tersedia di
`https://<INTRANET_HOST>/docs`.

Pasang sertifikat CA publik lokal `cert/myCA.pem` sebagai CA tepercaya pada
perangkat guru (di Android biasanya melalui pengaturan keamanan/credential
storage; nama menu tergantung versi perangkat). Buka aplikasi memakai hostname
yang cocok dengan SAN sertifikat, misalnya `https://intranet.bca.local`; jangan
lanjutkan bila browser masih menampilkan peringatan sertifikat. Sertifikat
yang ada juga mencakup IP `10.47.190.195`, tetapi gunakan hostname bila
memungkinkan. Pastikan DNS intranet mengarah ke server ini.

Buka akses firewall intranet hanya untuk TCP port `443` (dan `80` bila ingin
redirect otomatis). Database tidak memublikasikan port ke host atau intranet;
hanya backend yang terhubung ke jaringan database internal Docker. Login awal
mengikuti `ADMIN_USERNAME` dan `ADMIN_PASSWORD` di `.env`.

Jangan commit atau membagikan `cert/myCA.key` maupun `cert/server.key`.
Batasi akses file key pada server dan distribusikan CA certificate
(`cert/myCA.pem`) ke perangkat melalui kanal tepercaya. Jika private key pernah
ter-commit atau terbagikan, anggap bocor lalu ganti key dan sertifikat terkait.

Docker Compose memakai bind mount dan hot reload saat development. Perubahan
source Python/TypeScript/CSS langsung terlihat tanpa build atau restart.
Jalankan `alembic upgrade head` setelah membuat migration baru.

`AttendanceConfig` mengatur waktu absensi datang/pulang harian, bukan absensi
KBM. Untuk pencatatan KBM, status menjadi terlambat hanya setelah lebih dari
10 menit sejak `start_time` jadwal yang dipilih.

## Menjalankan lokal

Backend dijalankan dari `apps/backend` setelah PostgreSQL tersedia:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Format kode backend dengan Black (jalankan dari `apps/backend`):

```bash
pip install -r requirements-dev.txt
black .
```

Untuk memeriksa format tanpa mengubah file, jalankan `black --check .`.

Frontend:

```bash
npm install
npm run dev
```

Frontend end-to-end testing with Playwright uses its own disposable database and Docker Compose project. See [`docs/frontend-e2e-testing.md`](docs/frontend-e2e-testing.md) for setup and commands.

## Struktur modular

- Backend endpoints are grouped by feature in `apps/backend/app/api/`; `main.py` configures the app and includes those routers.
- Frontend routes stay in the Pages Router. Shared domain types live in `apps/frontend/src/types/`, and `styles/globals.css` imports the feature-specific stylesheets.
- Student cards are available from the admin navigation. Individual and bulk downloads use CR80 PDFs with front/back pages and QR codes containing each student's UUID. Existing `photo_url` values appear in previews; exported PDFs use initials until a photo-upload/storage source is available to the backend.

## Status MVP

Sudah tersedia auth JWT + refresh cookie, RBAC Admin/Guru, CRUD master data Tahun Ajaran/User/Guru/Mata Pelajaran/Rombel/Siswa, assignment Guru Mapel, Jadwal Mapel mingguan, Jadwal Ujian, pencatatan absensi harian, migration, dan halaman admin mobile-first. Modul kartu pelajar, laporan ekspor, upload foto, dan absensi KBM/ujian masih menjadi iterasi berikutnya.
