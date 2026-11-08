import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "./AdminLayout";
import ModalDialog from "./ModalDialog";
import { api } from "../services/api";
import type { AcademicYear, Rombel, ScheduleEvent, Subject, Teacher } from "../types";

type ScheduleBreak = {
  id: string;
  day_of_weeks: number[];
  start_time: string;
  end_time: string;
};

type PaginatedEvents = {
  items: ScheduleEvent[];
  total: number;
  page: number;
  limit: number;
};

const weekdays = [
  { index: 0, name: "Senin" },
  { index: 1, name: "Selasa" },
  { index: 2, name: "Rabu" },
  { index: 3, name: "Kamis" },
  { index: 4, name: "Jumat" },
  { index: 5, name: "Sabtu" },
];

export default function WeeklyScheduleGrid() {
  const [academicYearId, setAcademicYearId] = useState("");
  const [rombelId, setRombelId] = useState("");
  const [draftAcademicYearId, setDraftAcademicYearId] = useState("");
  const [draftRombelId, setDraftRombelId] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);

  const years = useQuery<AcademicYear[]>({
    queryKey: ["academic-years"],
    queryFn: async () => (await api.get("/management/academic-years")).data,
  });
  const rombels = useQuery<Rombel[]>({
    queryKey: ["rombels"],
    queryFn: async () => (await api.get("/management/rombels")).data,
  });
  const subjects = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get("/management/subjects")).data,
  });
  const teachers = useQuery<Teacher[]>({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/management/teachers")).data,
  });
  const breaks = useQuery<ScheduleBreak[]>({
    queryKey: ["schedule-breaks"],
    queryFn: async () => (await api.get("/schedules/breaks")).data,
  });
  const events = useQuery<ScheduleEvent[]>({
    queryKey: ["weekly-schedule-events", academicYearId, rombelId],
    enabled: Boolean(academicYearId),
    queryFn: async () => {
      const params = {
        event_type: "KBM",
        academic_year_id: academicYearId,
        rombel_id: rombelId || undefined,
        page: 1,
        limit: 100,
      };
      const firstPage = await api.get<PaginatedEvents>("/schedules/events", { params });
      const pages = await Promise.all(
        Array.from(
          { length: Math.ceil(firstPage.data.total / firstPage.data.limit) - 1 },
          (_, index) => api.get<PaginatedEvents>("/schedules/events", {
            params: { ...params, page: index + 2 },
          }),
        ),
      );
      return [
        ...firstPage.data.items,
        ...pages.flatMap((page) => page.data.items),
      ];
    },
  });

  useEffect(() => {
    if (!academicYearId && years.data?.length) {
      const activeYear = years.data.find((year) => year.is_active) || years.data[0];
      setAcademicYearId(activeYear.id);
      setDraftAcademicYearId(activeYear.id);
    }
  }, [academicYearId, years.data]);

  const selectedRombels = rombels.data?.filter((rombel) => rombel.academic_year_id === academicYearId) || [];
  const getNames = (event: ScheduleEvent) => ({
    subject: subjects.data?.find((subject) => subject.id === event.subject_id)?.name || event.title,
    teacher: teachers.data?.find((teacher) => teacher.id === event.teacher_id)?.full_name || "",
    rombels: (event.rombel_ids || [event.rombel_id])
      .map((id) => rombels.data?.find((rombel) => rombel.id === id)?.name)
      .filter(Boolean)
      .join(", "),
  });

  return (
    <AdminLayout
      adminOnly
      title="Grid Jadwal"
      description="Jadwal mapel dan istirahat mingguan dalam satu tampilan."
    >
      <div className="weekly-schedule-page">
        <div className="weekly-schedule-tools">
          <span>
            {years.data?.find((year) => year.id === academicYearId)?.year_name || "Pilih tahun ajaran"}
            {rombelId && ` · ${selectedRombels.find((rombel) => rombel.id === rombelId)?.name || ""}`}
          </span>
          <button
            type="button"
            className="button-with-icon min-h-11"
            aria-label="Filter jadwal mingguan"
            onClick={() => {
              setDraftAcademicYearId(academicYearId);
              setDraftRombelId(rombelId);
              setFilterOpen(true);
            }}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />Filter
          </button>
        </div>

        {(events.isError || breaks.isError || years.isError || rombels.isError || subjects.isError || teachers.isError)
          && <p className="error" role="alert">Jadwal gagal dimuat. Silakan coba lagi.</p>}

        {years.isPending || breaks.isPending || rombels.isPending
          || subjects.isPending || teachers.isPending || (Boolean(academicYearId) && events.isPending)
          ? <div className="empty-state"><strong>Memuat jadwal...</strong></div>
          : !academicYearId
            ? <div className="empty-state"><strong>Belum ada tahun ajaran</strong></div>
            : <div className="weekly-schedule-grid">
            {weekdays.map((day) => {
              const rows = [
                ...(events.data || [])
                  .filter((event) => event.day_of_week === day.index)
                  .map((event) => ({ kind: "lesson" as const, id: event.id, start: event.start_time, end: event.end_time, event })),
                ...(breaks.data || [])
                  .filter((item) => item.day_of_weeks.includes(day.index))
                  .map((item) => ({ kind: "break" as const, id: item.id, start: item.start_time, end: item.end_time })),
              ].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

              return (
                <section className="weekly-day-card" key={day.index} aria-label={`Jadwal ${day.name}`}>
                  <h2>{day.name}</h2>
                  {rows.length ? rows.map((row) => {
                    if (row.kind === "break") {
                      return (
                        <div className="weekly-break-row" key={`break-${row.id}`}>
                          <time>{row.start.slice(0, 5)}–{row.end.slice(0, 5)}</time>
                          <strong>Istirahat</strong>
                        </div>
                      );
                    }
                    const names = getNames(row.event);
                    return (
                      <article className="weekly-lesson-row" key={row.id}>
                        <time>{row.start.slice(0, 5)}–{row.end.slice(0, 5)}</time>
                        <strong>{names.subject}</strong>
                        <span>{names.rombels || "Semua rombel"}</span>
                        {names.teacher && <small>{names.teacher}</small>}
                      </article>
                    );
                  }) : <p className="weekly-day-empty">Tidak ada jadwal</p>}
                </section>
              );
            })}
          </div>}
      </div>

      <ModalDialog open={filterOpen} title="Filter jadwal mingguan" onClose={() => setFilterOpen(false)}>
        <form
          className="resource-form-grid grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setAcademicYearId(draftAcademicYearId);
            setRombelId(draftRombelId);
            setFilterOpen(false);
          }}
        >
          <label>
            <span>Tahun ajaran</span>
            <select
              aria-label="Tahun ajaran"
              className="min-h-11"
              value={draftAcademicYearId}
              onChange={(event) => {
                setDraftAcademicYearId(event.target.value);
                setDraftRombelId("");
              }}
              required
            >
              {years.data?.map((year) => <option key={year.id} value={year.id}>{year.year_name}</option>)}
            </select>
          </label>
          <label>
            <span>Rombel</span>
            <select
              aria-label="Rombel"
              className="min-h-11"
              value={draftRombelId}
              onChange={(event) => setDraftRombelId(event.target.value)}
            >
              <option value="">Semua rombel</option>
              {rombels.data
                ?.filter((rombel) => rombel.academic_year_id === draftAcademicYearId)
                .map((rombel) => <option key={rombel.id} value={rombel.id}>{rombel.name}</option>)}
            </select>
          </label>
          <div className="modal-actions">
            <button
              type="button"
              className="button-with-icon min-h-11"
              onClick={() => {
                setDraftRombelId("");
                setRombelId("");
                setFilterOpen(false);
              }}
            >Reset rombel</button>
            <button className="button-with-icon min-h-11" type="submit">Terapkan</button>
          </div>
        </form>
      </ModalDialog>
    </AdminLayout>
  );
}
