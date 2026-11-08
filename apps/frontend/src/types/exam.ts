export type ExamCardPreview = {
  id: string;
  id_siswa: string;
  nisn: string | null;
  full_name: string;
  class_name: string | null;
  photo_url: string | null;
  qr_data_url: string;
  exam_name: string;
  academic_year_name: string;
};

export type ExamAttendance = {
  student_id: string;
  full_name: string;
  nisn: string | null;
  status: "HADIR" | "IZIN" | "SAKIT" | "ALPA" | null;
  recorded_at: string | null;
  already_recorded?: boolean;
};
