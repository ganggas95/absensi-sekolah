# Analisis Implementasi Face Recognition (InsightFace)
**Repo:** `ganggas95/face-recognation-attendance-backend` (branch `main`, commit `6c28c4f "first init"`)
**Fokus:** jalur *face recognition* berbasis InsightFace — enrollment embedding & verifikasi kehadiran
**Tanggal analisis:** 21 Nov 2026

---

## 1. Ringkasan eksekutif

Backend absensi sekolah (FastAPI + PostgreSQL/pgvector) yang memakai **InsightFace 0.7.3** untuk
mengubah foto wajah menjadi **embedding 512-dimensi (ArcFace)**, menyimpannya di kolom `vector(512)`,
lalu mencocokkan wajah saat absensi dengan **cosine distance** pgvector + *threshold* + *margin*.

Yang sudah benar dan layak diapresiasi:

- Abstraksi model terpusat di satu file (`app/core/face.py`), lazy-loaded, dan seluruh parameter
  kualitas dapat dikonfigurasi via env (`INSIGHTFACE_MODEL_NAME`, `FACE_MIN_BBOX`, `FACE_MIN_DET_SCORE`, dst.).
- Prinsip **"simpan embedding saja, jangan simpan foto mentah"** benar-benar dipatuhi (PRD §7).
- Endpoint list embedding **tidak** membocorkan vektor embedding ke API (`StudentFaceRead` hanya
  `id`, `student_id`, `created_at`).
- Pencarian kandidat dibatasi per-kelas (`schedule_id → class_instance_id → enrollment`) sehingga
  ruang pencarian kecil — sesuai PRD §9.
- Idempotensi absensi per `(student_id, schedule_id, date)` ditegakkan di level DB (unique constraint)
  dan dicek di service.

Namun ada **satu bug yang merusak fungsi inti** dan beberapa isu performa/keamanan serius.
Bug tersebut bahkan baru muncul **setelah** tim mengikuti rekomendasi PRD (3–5 foto per siswa).
Ringkasnya (detail di §8):

| # | Prioritas | Temuan | Dampak |
|---|-----------|--------|--------|
| 1 | **P0** | `ORDER BY distance LIMIT 2` mengambil **baris embedding**, bukan **siswa**. Dua baris teratas hampir selalu milik siswa yang sama → margin ≈ 0 → ditolak `ambiguous match` | Verifikasi wajah asli **gagal ±96%** pada siswa dengan ≥3 embedding (dibuktikan simulasi, §8.1) |
| 2 | **P0** | `async def` memanggil inferensi ONNX sinkron (CPU-bound) langsung di event loop | Semua request lain (termasuk health check) **terblokir** saat verifikasi; target PRD <1 s tidak tercapai |
| 3 | P1 | Tidak ada index vektor (HNSW/IVFFlat) di `student_faces.embedding` | Selalu *seq scan* + hitung cosine seluruh baris |
| 4 | P1 | Quality gate PRD (pose yaw/pitch, blur, gelap) tidak diimplementasi | Embedding buruk tetap tersimpan → false reject/accept |
| 5 | P1 | `face.embedding` InsightFace disimpan **tanpa normalisasi L2** | Aman untuk cosine, tapi menutup opsi index `<#>` dan rawan jika nanti pindah ke L2 |
| 6 | P1 | Endpoint enroll/list/delete wajah hanya butuh JWT, **tanpa role check** | Role `SECURITY` / user mana pun bisa mendaftarkan & menghapus biometrik siswa |
| 7 | P2 | Tidak ada warm-up model, `root` model tidak dapat dikonfigurasi, model ±288 MB diunduh saat request pertama | Request pertama timeout / re-download tiap deploy container |
| 8 | P2 | Race condition idempotensi → `IntegrityError` → 500 generik | Retry bersamaan menghasilkan error, bukan record yang sudah ada |
| 9 | P2 | `print(images)` tersisa di route enroll; tidak ada batas ukuran/tipe file | Noise log + risiko memory (file dibaca penuh ke RAM) |
| 10 | P2 | Tidak ada liveness / anti-spoofing, tidak ada audit trail enrollment | Kehadiran bisa diakali dengan foto; biometrik anak tanpa jejak audit |

---

## 2. Peta arsitektur

```
┌───────────────────────────── FastAPI (app/main.py) ─────────────────────────────┐
│  /api/v1/students/{id}/faces/enroll   (multipart, 3–5 gambar)                    │
│  /api/v1/attendance/verify            (schedule_id + 1 gambar)                   │
│  /api/v1/gate-attendance/verify       (direction IN/OUT + 1 gambar)              │
└───────────────┬─────────────────────────────────────────────┬───────────────────┘
                │                                             │
        services/student_faces.py                    services/attendance.py
        services/gate_attendance.py  ───────────────►│
                │                                             │
                ▼                                             ▼
      app/core/face.py  ── InsightFace FaceAnalysis ──►  embedding[512] float
                │         (SCRFD det_10g → alignment   │
                │          norm_crop → ArcFace w600k_r50)│
                ▼                                             ▼
      student_faces.embedding VECTOR(512)  ◄──── pgvector cosine_distance ────┐
                                                                            │
      attendances / gate_attendances (student_id, date, time, confidence) ◄──┘
```

## 3. Implementasi InsightFace baris per baris (`app/core/face.py`)

### 3.1 Inisialisasi model (lazy, per-proses)

```python
@lru_cache(maxsize=1)
def get_face_analyzer():
    from insightface.app import FaceAnalysis
    model_name = os.getenv("INSIGHTFACE_MODEL_NAME", "buffalo_l")
    ctx_id     = int(os.getenv("INSIGHTFACE_CTX_ID", "-1"))
    det_size   = int(os.getenv("INSIGHTFACE_DET_SIZE", "640"))
    app = FaceAnalysis(name=model_name)
    app.prepare(ctx_id=ctx_id, det_size=(det_size, det_size))
    return app
```

- **`buffalo_l`** adalah *model pack* yang berisi 5 ONNX: `det_10g` (SCRFD-10G, deteksi),
  `w600k_r50` (ArcFace ResNet-50, recognition — sumber vektor 512-d), `2d106det` & `1k3d68`
  (landmark 2D/3D), `genderage`. Total unduhan pack ±288 MB, disimpan di `~/.insightface/models`.
- **`ctx_id=-1` = CPU** (default), `>=0` = GPU **hanya jika** `onnxruntime-gpu` terpasang —
  sementara `requirements.txt` hanya memuat `onnxruntime` (CPU). Jadi GPU tidak akan aktif
  kecuali image diubah.
- **`det_size=640`** → resolusi input detektor. Wajah kecil di foto jauh akan sulit terdeteksi;
  640 adalah pilihan wajar untuk foto *selfie* gerbang/kelas.
- **`lru_cache(maxsize=1)`** = model dimuat sekali per proses worker, thread-safe untuk baca
  setelah inisialisasi. Konsekuensi: beban muat model (~1–3 s CPU) jatuh ke request pertama —
  tidak ada warm-up di `create_app()`.

### 3.2 Decode gambar

```python
buffer = np.frombuffer(image_bytes, dtype=np.uint8)
img = cv2.imdecode(buffer, cv2.IMREAD_COLOR)   # → BGR
```

Efisien (tanpa file temporer) dan tepat memakai `IMREAD_COLOR` (InsightFace butuh BGR).
**Kelemahan:** `cv2.imdecode` **mengabaikan EXIF orientation**. Foto dari HP sering tersimpan
dengan flag `Orientation`, sehingga wajah bisa masuk ke model dalam keadaan miring 90°/180° →
deteksi gagal atau embedding jauh dari ideal.

### 3.3 Deteksi + gate kualitas yang ada

```python
faces = analyzer.get(img)
if len(faces) != 1:                      # wajah harus TEPAT 1
    raise AppException(422, f"exactly one face is required (detected={n})")
x1, y1, x2, y2 = face.bbox                # gate: min(w,h) >= FACE_MIN_BBOX (default 80px)
if min(w, h) < min_bbox_size: raise AppException(422, "face too small")
if face.det_score < min_det_score:        # gate: FACE_MIN_DET_SCORE (default 0.5)
    raise AppException(422, "face detection confidence too low")
```

Ini sudah memenuhi 2 dari 4 *quality gate* di PRD §6.1 (jumlah wajah, ukuran minimum) plus
ambang confidence detektor. Yang belum: **pose** dan **blur/pencahayaan** — padahal
`buffalo_l` sudah menyertakan model 3D landmark, sehingga `face.pose` (pitch, yaw, roll) tersedia
gratis tanpa model tambahan.

### 3.4 Ekstraksi & validasi embedding

```python
embedding = face.embedding                     # np.ndarray (512,)
arr = np.asarray(embedding, dtype=np.float32).reshape(-1)
if arr.size != 512: raise AppException(500, "invalid embedding size")
return arr.astype(float).tolist()
```

Temuan penting hasil verifikasi kode sumber InsightFace 0.7.3
(`model_zoo/arcface_onnx.py`, `app/face_analysis.py`):

- `ArcFaceONNX.get()` menetapkan `face.embedding = self.get_feat(aimg).flatten()` — yaitu
  **output mentah** jaringan (norm L2 ≈ 10–30), **bukan** vektor unit.
- `face.normed_embedding` di 0.7.3 adalah **property** (`Face` subclass `dict`) yang baru
  dinormalisasi saat diakses. Repo memakai `face.embedding` → **vektor tidak ternormalisasi
  yang tersimpan di DB**.
- Untuk `cosine_distance` pgvector (`<=>`) ini **tetap benar** karena cosine invarian skala
  (dibuktikan: `cos(3v, w) == cos(v, w)`). Jadi bukan bug fungsional — tapi kehilangan peluang:
  vektor unit memungkinkan index `<#>` (*negative inner product*) yang lebih cepat, hemat, dan
  membuat skor konsisten antar model.
- `Face` adalah subclass `dict` dengan `__getattr__` mengembalikan `None`, sehingga pola
  `getattr(face, "bbox", None)` di repo aman (tidak pernah `AttributeError`).

### 3.5 Penanganan error

`AppException` (dataclass dengan `status_code/message/meta`) dipetakan oleh
`app/core/exception_handlers.py` ke JSON `{status,message,meta}`. Handler `Exception` generik
mengembalikan `"internal server error"` tanpa membocorkan detail — sesuai PRD Phase 3
("tidak membocorkan informasi sensitif"). Catatan: `app.prepare()` berada **di luar** blok `try`
yang membungkus import, sehingga kegagalan GPU/ORT naik sebagai error 500 generik tanpa
pesan diagnostik apa pun (sulit di-debug di produksi).

---

## 4. Jalur enrollment (`app/services/student_faces.py`)

```python
for filename, image_bytes in images:
    try:
        embedding = extract_single_face_embedding(image_bytes)
        face = StudentFace(student_id=student_id, embedding=embedding)
        face_repo.add(face); face_repo.db.flush()
        stored_count += 1
        results.append(StudentFaceEnrollResult(filename=..., stored=True, face_id=face.id))
    except AppException as exc:
        results.append(StudentFaceEnrollResult(filename=..., stored=False, error=exc.message))
if stored_count == 0:
    raise AppException(422, "no valid face images", meta={"results": ...})
face_repo.db.commit()
```

Desain yang bagus:

- **Partial success**: 3 foto valid + 2 foto gagal → tetap 201 dengan `stored_count` dan status
  per-file. Ini persis format respons yang diminta PRD §6.3.
- Hanya embedding yang disimpan; tidak ada gambar mentah yang dipersist.
- Commit tunggal di akhir → atomik untuk batch.

Kekurangan:

- `except AppException` saja: error ONNX/OpenCV/numpy di tengah batch membuat **seluruh request
  500**, bukan status per-file. Sebaiknya juga menangkap `Exception` umum per gambar.
- Tidak ada **deduplikasi**: mengunggah foto yang sama 5× menyimpan 5 embedding identik —
  memperbesar peluang bug §8.1 dan memperlambat pencarian.
- Tidak ada kolom audit (`enrolled_by`, `source`) pada `student_faces`.
- Batas jumlah/ukuran file tidak divalidasi (`await image.read()` membaca seluruh file ke RAM).

`app/api/v1/routes/students.py:111` juga masih menyisakan `print(images)`.

---

## 5. Jalur verifikasi absensi kelas (`app/services/attendance.py:137`)

```
1. schedule = schedule_repo.get(schedule_id)                        → 404 jika tidak ada
2. jika ATTENDANCE_ENFORCE_SCHEDULE=1 → cek hari & jam (termasuk jadwal lewat tengah malam)
3. student_ids = enrollment_repo.list_student_ids_by_class_instance(...)
4. query_embedding = extract_single_face_embedding(image)
5. matches = face_repo.best_matches_for_students(query_embedding, student_ids, limit=2)
6. best_similarity  = 1 - distance[0]
   second_similarity = 1 - distance[1]
7. tolak jika best_similarity < FACE_MATCH_THRESHOLD (0.4)   → "below threshold"
8. tolak jika best - second < FACE_MATCH_MARGIN  (0.05)      → "ambiguous match"
9. jika sudah ada attendance (student, schedule, date) → kembalikan record lama (idempotent)
10. insert Attendance(status="PRESENT", confidence=best_similarity)
```

Semantik skor benar: pgvector `<=>` = 1 − cosine similarity, dan service mengubahnya kembali
jadi similarity untuk disimpan sebagai `confidence`. Threshold 0.4 konsisten dengan rentang
PRD (0.35–0.45), meski untuk `w600k_r50` nilai 0.4 tergolong **longgar** (pasangan *impostor*
bisa mencapai 0.4) — 0.5–0.6 lebih aman bila tidak ada margin.

`_ensure_within_schedule_window` juga menangani **jadwal lintas hari** (`end_time <= start_time`)
dan konvensi `day_of_week` 0=Minggu yang konsisten dengan `dashboard.py` dan label hari di
`routes/class_subject_schedules.py`. Tidak ada bug hari di sini.

## 6. Jalur verifikasi gerbang (`app/services/gate_attendance.py:41`)

Sama seperti di atas, dengan perbedaan:

- Kandidat = seluruh siswa ter-enroll di **tahun ajaran aktif** (atau semua siswa bila tidak ada
  tahun aktif) → ruang pencarian lebih besar daripada per-kelas.
- Setelah match, `GateAttendance(direction IN|OUT)` + **sinkronisasi** ke `student_attendance`
  via `upsert_from_gate`, dengan status `TELAT` bila jam masuk > `gate_in_time` (dari
  `school_settings`).
- `recorded_by_user_id` dicatat → endpoint ini punya jejak auditori, tidak seperti data biometrik.
- `gate_out_time` diambil untuk default setting tapi tidak dipakai untuk penilaian keterlambatan
  (wajar), namun tidak ada validasi jam pulang.

---

## 7. Skema data & pgvector

`app/models/student_faces.py`:

```python
embedding: Mapped[list[float]] = mapped_column(Vector(512), nullable=False)
```

`alembic/versions/0001_init_schema.py`:

```python
op.execute("CREATE EXTENSION IF NOT EXISTS vector")
...
sa.Column("embedding", Vector(512), nullable=False)
op.create_index("ix_student_faces_student_id", "student_faces", ["student_id"])
```

- Dimensi 512 dikunci di skema **dan** divalidasi di `face.py` → konsisten; model lain dengan
  dimensi berbeda akan ditolak dengan pesan jelas (bukan korupsi data).
- **Tidak ada index vektor.** Untuk 300 siswa × 3–5 embedding (±1.500 baris) ini masih cepat,
  tetapi PRD Phase 3 secara eksplisit meminta optimasi index. `ix_student_faces_student_id`
  hanya membantu filter kandidat, bukan jarak.
- Model ORM tidak menyertakan `ondelete="CASCADE"` yang ada di migrasi → *schema drift* bila
  `alembic revision --autogenerate` dijalankan.
- Tidak ada constraint "maksimum N embedding per siswa", tidak ada kolom `model_name`/`dim`
  → tidak ada jejak model mana yang menghasilkan vektor (penting saat re-enrollment massal).

---

## 8. Temuan detail + perbaikan

### 8.1 P0 — *Margin* dihitung antar-baris, bukan antar-siswa (bug inti)

**Kode (`app/repositories/student_faces.py:31`):**

```python
stmt = (
    select(StudentFace.student_id, distance)
    .where(StudentFace.student_id.in_(student_ids))
    .order_by(distance.asc())
    .limit(limit)          # limit = 2
)
```

Query ini mengurutkan **baris embedding**. Karena satu siswa menyimpan 3–5 embedding
(rekomendasi PRD §6.1!), dua baris teratas sangat sering milik **siswa yang sama**. Akibatnya di
service:

```python
best_similarity   = 1 - matches[0][1]      # embedding #1 siswa X
second_similarity = 1 - matches[1][1]      # embedding #2 siswa X ← orang yang sama!
if best_similarity - second_similarity < 0.05:   # ≈0 → selalu benar
    return {"matched": False, "reason": "ambiguous match"}
```

**Bukti (simulasi 512-d, intra-identitas cosine ≈0.65, 20 siswa, siswa target punya 5 embedding,
threshold 0.4 / margin 0.05, 500 percobaan):**

| Strategi | Diterima | Ditolak "ambiguous match" |
|---|---|---|
| A. apa adanya (`ORDER BY distance LIMIT 2` atas baris) | 16/500 | **480/500 (96%)** |
| B. agregasi per siswa (`MIN(distance) GROUP BY student_id`) | 496/500 | 0 |

"Top-2 baris milik siswa yang sama" terjadi pada **500/500** percobaan — jadi bug ini bukan
kasus tepi: **begitu seorang siswa punya ≥3 foto terdaftar, wajahnya sendiri hampir selalu
ditolak**, dan absensi tidak tercatat. Yang masih berfungsi hanya siswa dengan **tepat 1**
embedding (0/1 baris pesaing → margin lolos).

**Perbaikan** — agregasi per siswa sebelum ranking:

```python
def best_matches_for_students(self, *, embedding, student_ids, limit: int = 2):
    if not student_ids:
        return []
    distance = StudentFace.embedding.cosine_distance(embedding)
    per_student = (
        select(
            StudentFace.student_id.label("student_id"),
            func.min(distance).label("distance"),
        )
        .where(StudentFace.student_id.in_(student_ids))
        .group_by(StudentFace.student_id)
        .subquery()
    )
    stmt = (
        select(per_student.c.student_id, per_student.c.distance)
        .order_by(per_student.c.distance.asc())
        .limit(limit)
    )
    return [(row[0], float(row[1])) for row in self.db.execute(stmt).all()]
```

Alternatif idiomatik pgvector: `SELECT DISTINCT ON (student_id) ... ORDER BY student_id, distance`
lalu ranking di query luar. Keduanya menghilangkan duplikasi siswa; catatan: agregasi `MIN`
tidak bisa memanfaatkan index HNSW secara langsung (baru relevan setelah index ditambahkan,
dan pada 1.500 baris pun tetap cepat).

**Wajib disertai regression test:** daftarkan 3 embedding untuk 1 siswa + 1 embedding siswa lain,
lalu pastikan verifikasi siswa tersebut `matched: True` — tes ini tidak ada saat ini (lihat §9).

### 8.2 P0 — Inferensi sinkron di dalam `async def`

```python
@router.post("/verify", response_model=ApiResponse)
async def verify(...):
    ...
    result = verify_attendance_by_face(..., image_bytes=await image.read())
```

`analyzer.get(img)` + ONNX Runtime berjalan **di event loop**. Uvicorn dengan 1 worker akan
memblokir seluruh request lain selama inferensi (ratusan ms hingga detik). Target PRD "<1 detik
end-to-end" dan "<0.3 s matching per kelas" tidak mungkin konsisten tercapai, dan health check
bisa timeout.

**Perbaikan** (paling sederhana): jadikan route **sinkron** — FastAPI otomatis menjalankannya
di threadpool:

```python
@router.post("/verify", response_model=ApiResponse)
def verify(
    schedule_id: uuid.UUID = Form(...),
    image: UploadFile = File(...),
    ...
):
    ...
    result = verify_attendance_by_face(..., image_bytes=image.file.read())
```

(Alternatif: tetap `async def` + `await run_in_threadpool(...)`.) Jangan lupa membatasi
`onnxruntime` intra-op thread (`OMP_NUM_THREADS`, `sess_options.intra_op_num_threads`) agar
tidak terjadi *oversubscription* saat banyak request paralel.

### 8.3 P1 — Tidak ada index vektor

```python
# alembic/versions/0007_face_embedding_index.py
def upgrade() -> None:
    op.execute(
        "CREATE INDEX ix_student_faces_embedding_hnsw "
        "ON student_faces USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )
```

Catatan: HNSW baru efisien untuk query *top-k per baris*; dengan strategi `MIN per siswa`
(§8.1) PostgreSQL tetap harus memindai kandidat kelas — pada skala 50 siswa/kelas ini tetap
< 10 ms. Index berguna saat verifikasi gerbang (§6) yang memindai seluruh sekolah.

### 8.4 P1 — Quality gate pose & blur belum ada

`buffalo_l` sudah memuat `1k3d68` → `face.pose` = `[pitch, yaw, roll]` dalam derajat. Tambahkan
di `face.py` setelah pengecekan `det_score`:

```python
max_yaw   = float(os.getenv("FACE_MAX_YAW", "30"))
max_pitch = float(os.getenv("FACE_MAX_PITCH", "25"))

pose = getattr(face, "pose", None)          # None bila model 3D tidak terpasang
if pose is not None:
    pitch, yaw, _roll = (float(v) for v in pose)
    if abs(yaw) > max_yaw or abs(pitch) > max_pitch:
        raise AppException(422, "face pose too extreme",
                           meta={"yaw": yaw, "pitch": pitch})

crop = img[int(y1):int(y2), int(x1):int(x2)]
gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
variance = float(cv2.Laplacian(gray, cv2.CV_64F).var())
if variance < float(os.getenv("FACE_MIN_SHARPNESS", "60")):
    raise AppException(422, "image too blurry", meta={"sharpness": variance})
```

Ini menutup PRD §6.1 dan menaikkan kualitas embedding yang tersimpan (sumber utama false reject
pada sistem absensi).

### 8.5 P1 — Normalisasi embedding sebelum disimpan

```python
arr = np.asarray(embedding, dtype=np.float32).reshape(-1)
norm = float(np.linalg.norm(arr))
if norm > 0:
    arr = arr / norm          # vektor unit → konsisten dengan Face.normed_embedding
```

Efek: skor similarity stabil, bisa migrasi ke index *inner product* (`vector_ip_ops`, `<#>`) yang
lebih cepat/murah, dan tidak bergantung pada apakah model mengembalikan vektor ternormalisasi
(berbeda antar versi InsightFace — pada versi master terbaru `embedding` mentah, `normed_embedding`
property).

**Migrasi data lama** (sekali, setelah normalisasi baru aktif):

```sql
UPDATE student_faces
SET embedding = embedding / NULLIF(sqrt(vector_norm(embedding)), 0);
```

### 8.6 P1 — Otorisasi endpoint biometrik

`app/api/v1/router.py` hanya memasang `Depends(get_current_user)` untuk seluruh router `students`,
sehingga **semua role** (termasuk `SECURITY`) bisa `POST .../faces/enroll`, `GET .../faces`, dan
`DELETE .../faces/{face_id}`. PRD §6.1 menyebut aktor Admin (dan Teacher sesuai kebutuhan),
sedangkan perbandingan: `gate-attendance` list = ADMIN, verify = ADMIN/SECURITY, `users` = ADMIN.

Minimal:

```python
@router.post("/{student_id}/faces/enroll", ...)
def enroll_faces(..., _: User = Depends(require_roles("ADMIN", "TEACHER"))): ...
```

Plus batas upload: `MAX_UPLOAD_MB` per file, `MAX_FILES` (3–5), validasi `content_type` di
`image/jpeg|png|webp`, dan tolak file > beberapa MB sebelum `await image.read()`.

### 8.7 P2 — Operasional model

- **Warm-up**: panggil `get_face_analyzer()` di startup event agar request pertama tidak menanggung
  inisialisasi ORT (dan agar container gagal cepat bila model korup).
- **Lokasi model**: `FaceAnalysis(name=..., root=...)` belum diekspos; di container `~/.insightface`
  bersifat *ephemeral* → 288 MB diunduh ulang setiap deploy. Tambahkan
  `INSIGHTFACE_ROOT=/models` dan mount volume.
- **Install**: `insightface==0.7.3` di-build dari source (Cython; butuh `build-essential` + `cython`),
  dan menarik `albumentations`, `scikit-image`, `scikit-learn`, `matplotlib`, `onnx` — image
  membengkak dan build sering gagal di base image minimal. Pertimbangkan base image dengan
  toolchain, atau pin ke wheel/commit yang sudah ter-build.
- **GPU**: bila target server ber-GPU, ganti `onnxruntime` → `onnxruntime-gpu` dan set
  `INSIGHTFACE_CTX_ID=0`; saat ini `ctx_id>=0` akan error karena provider CUDA tidak ada.

### 8.8 P2 — Race condition idempotensi

Cek `existing` (§5 langkah 9) lalu `insert` bukan operasi atomik. Dua request bersamaan untuk
siswa+jadwal+tanggal yang sama → yang kedua menabrak `uq_attendance_per_day` → `IntegrityError`
→ handler generik → **500**. Perbaikan:

```python
from sqlalchemy.exc import IntegrityError
try:
    attendance_repo.add(attendance)
    attendance_repo.db.commit()
except IntegrityError:
    attendance_repo.db.rollback()
    existing = attendance_repo.get_by_student_schedule_date(...)
    return {"matched": True, "reason": "already recorded", ...}
```

Hal yang sama berlaku untuk `gate_attendances` (`uq_gate_attendance_student_date_direction`).

### 8.9 P2 — Anti-spoofing & privasi

- Tidak ada **liveness detection**: foto siswa di layar HP akan lolos. Untuk absensi gerbang
  (uang/hadir fisik) ini celah nyata; InsightFace versi baru menyediakan addon `liveness`,
  atau gunakan model anti-spoof terpisah.
- Embedding adalah **data biometrik** (data pribadi spesifik, UU PDP 27/2022) milik **anak**:
  belum ada mekanisme consent, enkripsi at-rest untuk kolom embedding, retensi, maupun audit log
  siapa yang mendaftarkan/menghapus. Minimal tambahkan tabel audit + kebijakan retensi saat siswa lulus.
- `/attendance/verify` hanya membatasi TEACHER ke jadwalnya sendiri; role lain (mis. SECURITY)
  bisa memverifikasi jadwal kelas mana pun — perlu keputusan produk.

---

## 9. Cakupan pengujian

`tests/test_face_flow.py`, `tests/test_attendance_verify.py` mem-*monkeypatch*
`extract_single_face_embedding` → tes cepat dan deterministik (bagus), tetapi berimplikasi:

- **Tidak ada satu pun tes yang menjalankan InsightFace sungguhan** (deteksi, kualitas, dimensi
  embedding) — regresi seperti perubahan atribut `embedding`/`normed_embedding` antar versi
  tidak akan tertangkap.
- **Tidak ada tes dengan >1 embedding per siswa** → bug §8.1 lolos sepenuhnya.
- Tidak ada tes untuk jalur `below threshold`, `ambiguous match`, `no enrolled faces`,
  `student not found`, maupun race idempotensi.
- `count_for_student()` di repository tidak dipakai di mana pun (dead code) — kandidat lokasi
  untuk endpoint ringkasan enrollment.

Rekomendasi tes minimum: (a) fixture gambar sintetis/aset kecil untuk `face.py` (skip bila
`insightface` tidak terpasang), (b) matriks keputusan threshold/margin dengan 2–3 embedding per
siswa, (c) tes integrasi pgvector dengan DB nyata (cosine order benar).

---

## 10. Konfigurasi yang tersedia (env)

| Variabel | Default | Lokasi | Catatan |
|---|---|---|---|
| `INSIGHTFACE_MODEL_NAME` | `buffalo_l` | `core/face.py:18` | `buffalo_s`/`antelopev2` juga 512-d |
| `INSIGHTFACE_CTX_ID` | `-1` | `core/face.py:19` | `-1` CPU; GPU butuh `onnxruntime-gpu` |
| `INSIGHTFACE_DET_SIZE` | `640` | `core/face.py:20` | turunkan (320) untuk kecepatan, naikkan untuk wajah kecil |
| `FACE_MIN_BBOX` | `80` | `core/face.py:63` | piksel minimum sisi bbox |
| `FACE_MIN_DET_SCORE` | `0.5` | `core/face.py:65` | ambang confidence detektor |
| `FACE_MATCH_THRESHOLD` | `0.4` | `attendance.py:204`, `gate_attendance.py:114` | similarity minimum (0.5–0.6 lebih aman) |
| `FACE_MATCH_MARGIN` | `0.05` | idem | **efektif tidak berfungsi** karena §8.1 |
| `ATTENDANCE_TZ` | `Asia/Jakarta` | `attendance.py:21` | zona waktu window jadwal |
| `ATTENDANCE_ENFORCE_SCHEDULE` | `0` | `attendance.py:156` | default **tidak** menegakkan jadwal |
| `ATTENDANCE_EARLY_MINUTES` / `_LATE_MINUTES` | `0` / `0` | `attendance.py:58` | toleransi window |

Catatan: `FACE_MATCH_THRESHOLD`/`MARGIN` dibaca dengan `os.getenv` saat request (bukan lewat
`core/config.py`), sehingga tidak ada satu sumber kebenaran konfigurasi — pertimbangkan
memindahkannya ke `Settings` agar tervalidasi & terdokumentasi.

---

## 11. Urutan perbaikan yang disarankan

1. **Perbaiki §8.1** (`MIN(distance) GROUP BY student_id`) + tes regresi multi-embedding.
   Tanpa ini, fitur inti praktis tidak berfungsi setelah enrollment sesuai PRD.
2. **§8.2** route sinkron / threadpool + batas thread ORT → target latensi PRD tercapai.
3. **§8.4 + §8.5** quality gate (pose, blur) + normalisasi embedding → kualitas match naik.
4. **§8.6** role check + validasi upload → keamanan biometrik & anti-DoS.
5. **§8.7 + §8.3** warm-up, volume model, index HNSW → kesiapan produksi & skala gerbang.
6. **§8.8 + §8.9** idempotensi atomik, audit, liveness → hardening.

---

## 12. Verdict

Fondasi teknisnya **rapi dan sesuai PRD**: pemisahan layer (routes → services → repositories),
embedding-only storage, filter kandidat per kelas, threshold + margin, idempotensi per hari, dan
error handling terpusat. InsightFace digunakan tepat pada level `FaceAnalysis` (bukan sekadar
`det_model`), sehingga alignment `norm_crop` + ArcFace 512-d dimanfaatkan penuh.

Masalahnya bukan pada pemilihan model, tetapi pada **logika matching di atas vektor** —
`LIMIT 2` atas baris embedding membuat *margin* antar-kandidat menjadi *margin* antar-foto orang
yang sama. Itu bug satu baris query yang berdampak besar (96% false-reject), dan sekaligus
contoh mengapa tes dengan >1 embedding per siswa wajib ada. Setelah §8.1 dan §8.2 diperbaiki,
sisa pekerjaan bersifat *hardening* (quality gate, role, index, liveness), bukan perombakan.
