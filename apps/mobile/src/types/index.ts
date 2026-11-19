export type Role = "ADMIN" | "GURU";

export type AttendanceStatus = "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "ALPA";

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  description?: string | null;
  event_type: "KBM" | "EXAM";
  academic_year_id: string;
  rombel_id: string;
  rombel_ids: string[];
  subject_id: string;
  teacher_id: string;
  day_of_week?: number | null;
  start_time: string;
  end_time: string;
}

export interface Rombel {
  id: string;
  name: string;
}

export interface Student {
  id: string;
  nisn?: string | null;
  full_name: string;
  gender?: string | null;
  rombel_id?: string | null;
  is_active: boolean;
}

export interface DailyAttendance {
  id: string;
  student_id: string;
  student_name?: string | null;
  date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status: AttendanceStatus;
  notes?: string | null;
  already_recorded?: boolean;
}

export interface ActiveScheduleSummary {
  schedule_id: string;
  title: string;
  rombel_name: string;
  subject_name: string;
  start_time: string;
  end_time: string;
  is_currently_active: boolean;
  total_students: number;
  recorded_count: number;
  hadir_count: number;
  terlambat_count: number;
  unrecorded_count: number;
}

export interface StudentAttendanceStat {
  student_id: string;
  full_name: string;
  nisn?: string | null;
  rombel_name: string;
  hadir_count: number;
  terlambat_count: number;
  izin_count: number;
  sakit_count: number;
  alpa_count: number;
  total_unexcused: number;
  total_recorded: number;
  attendance_rate: number;
}

export interface ScheduleAttendanceStat {
  schedule_id: string;
  title: string;
  rombel_name: string;
  subject_name: string;
  day_of_week?: number | null;
  start_time: string;
  end_time: string;
  total_students: number;
  present_count: number;
  attendance_rate: number;
}

export interface TeacherDashboardStats {
  teacher_name: string;
  today_date: string;
  active_schedule?: ActiveScheduleSummary | null;
  today_schedules_count: number;
  top_absent_students: StudentAttendanceStat[];
  top_diligent_students: StudentAttendanceStat[];
  schedule_attendance_rates: ScheduleAttendanceStat[];
}

export interface ScanProgress {
  currentIp: string;
  scannedCount: number;
  totalCount: number;
  percentage: number;
  foundServer: string | null;
  isScanning: boolean;
  error?: string | null;
}

export interface TeacherScheduleBrief {
  schedule_id: string;
  title: string;
  rombel_name: string;
  subject_name: string;
  start_time: string;
  end_time: string;
}

export interface TeacherAttendance {
  id: string;
  teacher_id: string;
  teacher_name?: string | null;
  nip?: string | null;
  date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status: AttendanceStatus;
  notes?: string | null;
  already_recorded?: boolean;
}

export interface TeacherToday {
  date: string;
  server_time: string;
  has_schedule: boolean;
  schedules: TeacherScheduleBrief[];
  first_start?: string | null;
  last_end?: string | null;
  late_after?: string | null;
  attendance?: TeacherAttendance | null;
  on_school_network: boolean;
  client_ip?: string | null;
  can_check_in: boolean;
  can_check_out: boolean;
  message?: string | null;
}

export interface MyProfile {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  teacher_id?: string | null;
  nip?: string | null;
  phone?: string | null;
  subjects: string[];
}

export interface MyProfileUpdate {
  full_name: string;
  nip?: string | null;
  phone?: string | null;
}
