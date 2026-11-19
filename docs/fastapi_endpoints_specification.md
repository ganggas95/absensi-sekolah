API Endpoint Specifications (FastAPI)

All endpoints require Bearer Token Authentication unless specified.
Base URL in Monorepo Environment: http://localhost:8000/api/v1

Auth Router (/api/v1/auth)

POST /login: Authenticate user & return JWT token.

GET /me: Get current logged-in user details.

Users & Students Router (/api/v1/management)

GET /users: List users (Admin only).

POST /users: Create user (Admin only).

GET /students: List students with pagination & rombel filter.

POST /students: Add new student profile.

PUT /students/{id}: Update student details.

POST /students/{student_id}/photo: Upload or replace a JPEG, PNG, or WebP photo (admin only; maximum 5 MB).

GET /students/photos/{photo_id}: Fetch a protected student photo for authenticated card previews.

Uploaded images are decoded, checked for supported format and dimensions, stripped of metadata by JPEG re-encoding, resized to at most 1600×1600, and stored with a generated ID. The Docker backend stores files on the persistent `student_photos` volume.

GET /rombels: Get all class groups.

POST /rombels: Create class group.

GET /academic-years: List academic years (Admin only).

POST /academic-years: Create academic year (Admin only).

PUT /academic-years/{id}: Update academic year (Admin only).

DELETE /academic-years/{id}: Delete an unused academic year (Admin only).

GET /teachers: List teacher profiles (Admin only).

POST /teachers: Create a teacher profile linked to a GURU user (Admin only).

PUT /teachers/{id}: Update teacher profile (Admin only).

DELETE /teachers/{id}: Deactivate teacher profile (Admin only).

GET /teachers/{id}/subjects: List subjects assigned to a teacher (Admin only).

PUT /teachers/{id}/subjects: Replace teacher subject assignments (Admin only).

GET /subjects: List subjects (Admin only).

POST /subjects: Create a subject (Admin only).

PUT /subjects/{id}: Update a subject (Admin only).

DELETE /subjects/{id}: Deactivate a subject (Admin only).

Student ID Card Router (/api/v1/cards)

GET /cards/preview/{student_id}: Fetch data & barcode image needed for single student ID card rendering.

POST /cards/batch-print: Generate batch printable ID cards (PDF) filtered by rombel_id or list of student_ids.

GET /cards/export/{student_id}: Download a single student's two-sided CR80 PDF card.

Batch exports return two-sided CR80 PDF pages and accept exactly one filter: `{"rombel_id":"..."}` to export all active students in that class, or `{"student_ids":["..."]}` to export selected active students. A PDF is limited to 500 cards.

Exam Participant Card Router (`/api/v1/cards/exams`)

- `GET /cards/exams/preview/{exam_period_id}/{rombel_id}/{student_id}`: Preview a student for an exam period.
- `GET /cards/exams/export/{exam_period_id}/{rombel_id}/{student_id}`: Download one two-sided CR80 exam card.
- `POST /cards/exams/batch-print`: Body contains `exam_period_id`, `rombel_id`, and optional `student_ids`; without IDs, exports all active students in the rombel. Limited to 500 cards.
- Exam cards are tied to the selected exam period, not to an individual subject schedule. A card is valid across all subjects and sessions within that period. The QR contains the stable student UUID; attendance is recorded against each selected subject schedule separately.

GET /cards/qrcode/{nisn}: Generate dynamic Barcode/QR Code SVG or PNG for student NISN.

Schedules Router (/api/v1/schedules) - Reusable Module

- `GET /exam-periods?academic_year_id=...`: List configured exam periods.
- `POST /exam-periods`: Create a period with `academic_year_id`, `period_type` (`GANJIL`, `GENAP`, or `MID_SEMESTER`), `start_date`, and `end_date`.
- `PUT /exam-periods/{id}`: Update a period; date range cannot exclude scheduled exams, and year/type cannot change after schedules exist.
- `DELETE /exam-periods/{id}`: Delete a period only when no exam schedule uses it.

GET /events: Fetch schedule events filtered by event_type (KBM or EXAM), academic_year_id, rombel_id, teacher_id, or subject_id.

POST /events: Create a schedule event. KBM requires day_of_week; EXAM requires schedule_date.

For KBM, the selected teacher must teach the selected subject. For EXAM, create the exam period first, then assign each subject/rombel schedule to a period, supervisor, date, and time. The exam date must fall within the period date range. The supervisor is not required to teach the subject. Guru users see only their assigned exam sessions and only the assigned supervisor or an admin can view or record exam attendance.

PUT /events/{id}: Edit a schedule event.

DELETE /events/{id}: Delete a schedule event.

Self-service account endpoints (`/api/v1/auth`, any logged-in user):

GET /me/profile: Own account plus teacher data (`teacher_id`, `nip`, `phone`, `subjects` names). Teacher fields are empty when the account has no teacher profile. Read-only; guru cannot use the admin-only `/management/teachers`.

PATCH /me/profile: Update own `full_name` and, when a teacher profile exists, `nip` and `phone`. Omitted fields are unchanged; `nip` and `phone` can be cleared with empty strings or `null`. Username, role, active status, and subject assignments are not editable through this endpoint. Duplicate NIP returns 409.

POST /me/password: Change own password with `current_password` and `new_password` (6 to 72 characters, different from the current one). Returns 204. A wrong current password returns 400 `Password saat ini salah` and changes nothing. The password hash is never returned. Existing tokens stay valid until they expire.

Attendance Router (/api/v1/attendance)

GET /config: Get active daily attendance time configuration.

GET /daily/schedules: List today's KBM schedules in the active academic year. Guru users see only their own schedules.

POST /daily/record: Record daily attendance (supports `id_siswa` UUID QR/barcode payload and legacy NISN lookup). Requires `schedule_event_id`; the schedule must be today's active KBM schedule, belong to the current teacher when applicable, and match the student's rombel.

POST /event/record: Marking attendance for KBM or Exam sessions.

GET /daily: Get daily attendance logs.

GET /event/{schedule_event_id}: Get attendance list for a specific class/exam session.

Teacher Attendance (`/api/v1/attendance/teacher`): guru check in before entering class and check out after teaching, from the mobile app. Only days on which the guru has an active-year KBM schedule are eligible. Time always comes from the server (Asia/Makassar); the client sends no time.

GET /teacher/today: (GURU) Today's KBM schedules, first start / last end, late cut-off, current record, whether the request comes from the school network, and `can_check_in` / `can_check_out` flags with a user-facing `message`.

POST /teacher/check-in: (GURU) Requires a KBM schedule today and a request from the school network (403 otherwise). Allowed until the last class ends. Status is `HADIR` up to `TEACHER_LATE_TOLERANCE_MINUTES` (default 10) after the first class starts, else `TERLAMBAT`. Repeating returns the existing record with `already_recorded: true`.

POST /teacher/check-out: (GURU) Requires an earlier check-in and the school network. Allowed once the last class of the day has ended (422 before that). Repeating returns the existing record with `already_recorded: true`.

GET /teacher/records: (Admin only) Teacher attendance records, filterable by `start_date`, `end_date`, `teacher_id`, `status`.

School network check: the backend reads the client IP from `X-Real-IP` only when the direct peer is inside `TRUSTED_PROXY_CIDRS` (the nginx container); otherwise the peer address is used. The school network is the host server's LAN, never a container address. It comes from, in order: `SCHOOL_NETWORK_CIDRS` (comma-separated, explicit); `SCHOOL_HOST_IP` plus `SCHOOL_HOST_PREFIX` (default 24), the LAN IP of the host machine; or, when both are empty, the private IP in the request `Host` header (the address the phone used to reach the server). A hostname or public IP in `Host` yields no network and rejects everyone. Set `SCHOOL_HOST_IP` explicitly because a container cannot discover its host's LAN IP. `REQUIRE_SCHOOL_NETWORK=false` disables the check for local development and E2E only. The backend port must not be published directly in production, otherwise a client could spoof the header. On Docker Desktop (Mac/Windows) the real device address never reaches nginx, because the VM replaces the source address with its gateway IP. The mobile app therefore sends its WiFi IP in `X-Device-Ip`. The backend trusts that header only when the address it sees itself is not a public IP, so a request from the internet can never use it. A reported IP outside `SCHOOL_NETWORK_CIDRS` is still rejected. On a Linux host the real address from nginx is used directly and the header is not needed.

For exam attendance, `GET /event/{schedule_event_id}` lists active students in the scheduled rombel, including those not yet recorded. `POST /event/record` accepts `schedule_event_id`, `student_id` (student UUID from QR), optional `status` (defaults to `HADIR`), and optional `notes`. A repeated scan returns the existing record without overwriting it; students outside the exam rombel are rejected.

Reports Router (/api/v1/reports)

All report routes are Admin-only. `GET /daily`, `/class`, and `/exam` return filtered rows with total and status summaries; the corresponding `/export` routes accept `format=pdf|xlsx` (default `pdf`) and return a downloadable file. All report rows reflect recorded attendance only; students without a record are not inferred as absent.

- Daily: optional `date_from`, `date_to`, `rombel_id`, `student_id`, and attendance `status`.
- KBM/Class: optional `date_from`, `date_to`, `rombel_id`, `student_id`, `subject_id`, and `schedule_event_id`. Dates refer to the local attendance-record date in Asia/Makassar.
- Exam: optional `date_from`, `date_to`, `rombel_id`, `student_id`, `subject_id`, `schedule_event_id`, and `exam_period_id`. Dates refer to the scheduled exam date.

Start and end dates are inclusive. If both are supplied, the start date must not be after the end date.
