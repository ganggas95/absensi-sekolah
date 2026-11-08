export type AcademicYear = {
  id: string;
  year_name: string;
  is_active: boolean;
};

export type Rombel = {
  id: string;
  name: string;
  academic_year_id?: string;
  homeroom_teacher_id?: string;
};

export type StudentCardPreview = {
  id: string;
  id_siswa: string;
  nisn: string | null;
  full_name: string;
  gender: string | null;
  class_name: string | null;
  photo_url: string | null;
  qr_data_url: string;
};

export type Teacher = {
  id: string;
  user_id: string;
  nip?: string;
  phone?: string;
  full_name?: string;
  username?: string;
  is_active: boolean;
  subject_ids: string[];
};

export type Subject = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

export type Student = {
  id: string;
  id_siswa: string;
  nisn: string | null;
  full_name: string;
  gender?: "L" | "P";
  rombel_id?: string;
  parent_phone?: string;
  is_active: boolean;
};
