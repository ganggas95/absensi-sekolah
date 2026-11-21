export type AttendanceStatus = "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "ALPA";

export type DailyAttendance = {
  id: string;
  student_id: string;
  student_name?: string;
  schedule_event_id?: string | null;
  date: string;
  check_in_time?: string;
  check_out_time?: string;
  status: AttendanceStatus;
  notes?: string;
};

export type AttendanceSession = {
  id: string;
  schedule_event_id: string;
  session_date: string;
  opened_by?: string | null;
  opened_by_name?: string | null;
  opened_at: string;
  closed_by?: string | null;
  closed_at?: string | null;
  is_open: boolean;
};

export type AttendanceConfig = {
  id: string;
  config_name: string;
  check_in_start: string;
  check_in_end: string;
  check_out_start: string;
  check_out_end: string;
  late_threshold: string;
  is_active: boolean;
};

export type TeacherAttendance = {
  id: string;
  teacher_id: string;
  teacher_name?: string | null;
  nip?: string | null;
  date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status: AttendanceStatus;
  notes?: string | null;
};
