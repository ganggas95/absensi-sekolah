export type AttendanceStatus = "HADIR" | "TERLAMBAT" | "IZIN" | "SAKIT" | "ALPA";

export type DailyAttendance = {
  id: string;
  student_id: string;
  student_name?: string;
  date: string;
  check_in_time?: string;
  check_out_time?: string;
  status: AttendanceStatus;
  notes?: string;
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
