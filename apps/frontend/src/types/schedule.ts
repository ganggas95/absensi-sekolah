export type ScheduleEvent = {
  id: string;
  event_type: "KBM" | "EXAM";
  title: string;
  description?: string;
  academic_year_id: string;
  exam_period_id?: string | null;
  rombel_id: string;
  rombel_ids?: string[];
  subject_id: string;
  teacher_id: string;
  schedule_date?: string;
  day_of_week?: number;
  start_time: string;
  end_time: string;
};

export type ExamPeriod = {
  id: string;
  academic_year_id: string;
  period_type: "GANJIL" | "GENAP" | "MID_SEMESTER";
  start_date: string;
  end_date: string;
};
