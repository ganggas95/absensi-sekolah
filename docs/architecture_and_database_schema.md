Architecture & Database Schema Specification

1. Feature Specifications

Student Management (Manajemen Data Siswa): CRUD operations for student profiles, NISN, parents contact, photo upload, and status.

Student ID Card Printing (Cetak Kartu Pelajar):

Single & batch card preview and export (PDF / Browser Print).

Dynamic Barcode / QR Code generation based on student UUID (`id_siswa`) for quick attendance scanning; NISN remains an optional legacy lookup value.

Standard ID card printable layout (Front & Back design).

User Management (Manajemen User): Roles (Admin, Guru).

Teacher Management (Manajemen Guru): Teacher profiles are linked one-to-one to active GURU users and can be assigned multiple subjects.

Teacher Attendance (Absensi Guru): Guru absen datang sebelum mengajar dan absen pulang setelah jam mengajar terakhir lewat aplikasi mobile, hanya pada hari guru punya jadwal KBM dan hanya dari jaringan WiFi sekolah. Admin memantau lewat halaman Absensi Guru.

Subject Management (Manajemen Mata Pelajaran): Maintain subject codes and names, then assign them to teachers.

Classroom & Cohort Management (Manajemen Rombel): Grouping students by class and entry year/academic year.

Reusable Schedule Event Module:

KBM Schedule (Jadwal KBM): Routine weekly learning schedule per subject.

Exam Schedule (Jadwal Ujian): Mid-term and Final exams schedule (UTS/UAS).

Semester Schedule (Jadwal Semester): Academic calendar events, holidays, active school days.

Entry & Exit Config (Konfigurasi Jadwal Masuk/Pulang): Configurable thresholds for check-in/check-out time and late rules.

Attendance Records (Record Absensi):

Daily Check-in / Check-out (Absensi Masuk/Pulang)

Subject Attendance (Absensi Kelas per Matpel): setiap sesi absensi KBM disimpan per jadwal dan tanggal sehingga dua guru yang mengajar rombel sama pada hari yang sama tidak berbagi data.

Exam Attendance (Absensi Ujian)

Reporting & Export (Report Absensi): Summaries with filters (Date, Class, Student, Subject) and export capabilities (PDF & Excel).

2. Monorepo Architecture Overview

+-----------------------------------------------------------------------+
|                              ROOT REPO                                |
|                                                                       |
|  +---------------------------+       +-----------------------------+  |
|  |       apps/frontend       |       |        apps/backend         |  |
|  |   (Next.js Pages Router)  |       |          (FastAPI)          |  |
|  |                           |       |                             |  |
|  | - Client Side Fetching    | <---> | - REST API                  |  |
|  | - react-to-print Cards    |       | - Card QR/PDF Generation    |  |
|  | - Mobile First UI         |       | - JWT & Role Auth           |  |
|  +---------------------------+       +--------------+--------------+  |
+-----------------------------------------------------|-----------------+
                                                      |
                                                      v
                                            +-------------------+
                                            | PostgreSQL DB     |
                                            +-------------------+


3. PostgreSQL Database ERD Schema

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('ADMIN', 'GURU')) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Academic Years (Angkatan/Tahun Ajaran)
CREATE TABLE academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year_name VARCHAR(20) NOT NULL, -- e.g. "2024/2025"
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rombel / Classrooms
CREATE TABLE rombels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL, -- e.g. "Kelas 7A"
    academic_year_id UUID REFERENCES academic_years(id) ON DELETE CASCADE,
    homeroom_teacher_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Students Table
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nisn VARCHAR(20) UNIQUE, -- Optional; students.id is the stable card QR/barcode payload
    full_name VARCHAR(100) NOT NULL,
    gender CHAR(1) CHECK (gender IN ('L', 'P')),
    rombel_id UUID REFERENCES rombels(id) ON DELETE SET NULL,
    parent_phone VARCHAR(20),
    photo_url VARCHAR(255), -- For Student ID Card photo
    qr_code_url VARCHAR(255), -- Path or string for card QR/Barcode scanning
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

Student photos are uploaded separately after the student profile is saved. The
`photo_url` column stores a protected API path; the backend validates and
re-encodes JPEG/PNG/WebP uploads and stores generated JPEG files under
`MEDIA_DIR/students`. Docker Compose persists `MEDIA_DIR` on the `student_photos`
named volume. Card previews fetch photos through the authenticated API, and PDF
generation reads the same managed files. No schema migration is required.

-- Teacher Profiles and Subject Assignment
CREATE TABLE teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nip VARCHAR(30) UNIQUE,
    phone VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE teacher_subjects (
    teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
    PRIMARY KEY (teacher_id, subject_id)
);

-- Reusable Schedule Events Base
CREATE TABLE exam_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    period_type VARCHAR(20) CHECK (period_type IN ('GANJIL', 'GENAP', 'MID_SEMESTER')) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (academic_year_id, period_type)
);

CREATE TABLE schedule_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(30) CHECK (event_type IN ('KBM', 'EXAM')) NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    exam_period_id UUID REFERENCES exam_periods(id) ON DELETE RESTRICT,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    rombel_id UUID REFERENCES rombels(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE RESTRICT,
    teacher_id UUID REFERENCES teachers(id) ON DELETE RESTRICT,
    schedule_date DATE, -- Required for EXAM; must be inside exam period range
    day_of_week INTEGER, -- Required for KBM: 0=Monday through 5=Saturday
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Entry and Exit Configuration
CREATE TABLE attendance_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_name VARCHAR(50) NOT NULL, -- e.g., "Hari Normal", "Jumat"
    check_in_start TIME NOT NULL,
    check_in_end TIME NOT NULL,
    check_out_start TIME NOT NULL,
    check_out_end TIME NOT NULL,
    late_threshold TIME NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Attendance Session (sesi absensi KBM yang dibuka guru; satu per jadwal per tanggal)
CREATE TABLE attendance_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_event_id UUID NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    opened_by UUID REFERENCES users(id) ON DELETE SET NULL,
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    closed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(schedule_event_id, session_date)
);

-- Daily Attendance (kehadiran siswa pada satu sesi jadwal KBM)
CREATE TABLE daily_attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    schedule_event_id UUID REFERENCES schedule_events(id) ON DELETE CASCADE, -- NULL hanya untuk data lama
    date DATE NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE,
    check_out_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) CHECK (status IN ('HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALPA')) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, schedule_event_id, date)
);

-- Teacher Attendance (datang / pulang guru, hanya pada hari ada jadwal KBM)
CREATE TABLE teacher_attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    check_in_time TIMESTAMP WITH TIME ZONE,
    check_out_time TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) CHECK (status IN ('HADIR', 'TERLAMBAT', 'IZIN', 'SAKIT', 'ALPA')) NOT NULL,
    check_in_ip VARCHAR(45),
    check_out_ip VARCHAR(45),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(teacher_id, date)
);

-- Event Attendance (Ujian)
CREATE TABLE event_attendances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_event_id UUID REFERENCES schedule_events(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    status VARCHAR(20) CHECK (status IN ('HADIR', 'IZIN', 'SAKIT', 'ALPA')) NOT NULL,
    notes TEXT,
    recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(schedule_event_id, student_id)
);

Exam cards use the student's stable UUID QR and are scoped to a rombel in the
selected exam period, not to an individual subject schedule. Each period belongs
to an academic year and has one type (GANJIL, GENAP, MID_SEMESTER) and a date
range. Subject schedules within that period select an exam supervisor and must
fall within the configured range. One card is valid across all subject schedules
in the period. Exam attendance is recorded once per student and schedule event;
the event's rombel determines participant eligibility. The event's teacher is
its exam supervisor and does not need an assignment to the event's subject.
Only that supervisor or an admin can view or record attendance; `recorded_by`
stores the supervisor's user account.
