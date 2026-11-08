import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Save, SlidersHorizontal, Trash2, X } from "lucide-react";
import AdminLayout from "./AdminLayout";
import ModalDialog from "./ModalDialog";
import { api } from "../services/api";
import type { AcademicYear, ExamPeriod, Rombel, ScheduleEvent, Subject, Teacher } from "../types";

type ScheduleFilters = { academic_year_id: string; rombel_id: string; day_of_week: string };
type PaginatedScheduleEvents = { items: ScheduleEvent[]; total: number; page: number; limit: number };
const emptyScheduleFilters: ScheduleFilters = { academic_year_id: "", rombel_id: "", day_of_week: "" };

const periodLabels: Record<ExamPeriod["period_type"], string> = {
  GANJIL: "Semester Ganjil",
  GENAP: "Semester Genap",
  MID_SEMESTER: "Mid Semester",
};

export default function SchedulePage({ eventType }: { eventType: "KBM" | "EXAM" }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedRombelIds, setSelectedRombelIds] = useState<string[]>([]);
  const [filters, setFilters] = useState(emptyScheduleFilters);
  const [draftFilters, setDraftFilters] = useState(emptyScheduleFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const years = useQuery<AcademicYear[]>({
    queryKey: ["academic-years"],
    queryFn: async () => (await api.get("/management/academic-years")).data,
  });
  const rombels = useQuery<Rombel[]>({
    queryKey: ["rombels"],
    queryFn: async () => (await api.get("/management/rombels")).data,
  });
  const teachers = useQuery<Teacher[]>({
    queryKey: ["teachers"],
    queryFn: async () => (await api.get("/management/teachers")).data,
  });
  const subjects = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: async () => (await api.get("/management/subjects")).data,
  });
  const periods = useQuery<ExamPeriod[]>({
    queryKey: ["exam-periods"],
    queryFn: async () => (await api.get("/schedules/exam-periods")).data,
    enabled: eventType === "EXAM",
  });
  const events = useQuery<PaginatedScheduleEvents>({
    queryKey: ["schedule-events", eventType, currentPage, pageSize, filters],
    queryFn: async () => (await api.get("/schedules/events", {
      params: {
        event_type: eventType,
        page: currentPage,
        limit: pageSize,
        academic_year_id: filters.academic_year_id || undefined,
        rombel_id: filters.rombel_id || undefined,
        day_of_week: filters.day_of_week === "" ? undefined : Number(filters.day_of_week),
      },
    })).data,
  });
  const save = useMutation({
    mutationFn: async (payload: Record<string, string | number | string[]>) => (
      editing
        ? api.put(`/schedules/events/${editing.id}`, payload)
        : api.post("/schedules/events", { ...payload, event_type: eventType })
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedule-events", eventType] });
      setEditing(null);
      setForm({});
      setSelectedRombelIds([]);
      setModalOpen(false);
      setCurrentPage(1);
      setMessage("Jadwal berhasil disimpan.");
    },
    onError: (error: any) => setMessage(error?.response?.data?.detail || "Operasi gagal."),
  });

  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const openCreate = () => {
    setEditing(null);
    setForm({});
    setSelectedRombelIds([]);
    setMessage("");
    setModalOpen(true);
  };
  const close = () => {
    if (!save.isPending) {
      setEditing(null);
      setForm({});
      setSelectedRombelIds([]);
      setModalOpen(false);
    }
  };
  const edit = (event: ScheduleEvent) => {
    setEditing(event);
    setSelectedRombelIds(event.rombel_ids?.length ? event.rombel_ids : [event.rombel_id]);
    setForm({
      title: event.title,
      description: event.description || "",
      academic_year_id: event.academic_year_id,
      rombel_id: event.rombel_id,
      subject_id: event.subject_id,
      teacher_id: event.teacher_id,
      start_time: event.start_time,
      end_time: event.end_time,
      exam_period_id: event.exam_period_id || "",
      day_of_week: event.day_of_week === undefined ? "" : String(event.day_of_week),
      schedule_date: event.schedule_date || "",
    });
    setMessage("");
    setModalOpen(true);
  };
  const remove = async (id: string) => {
    if (!window.confirm("Hapus jadwal ini?")) return;
    try {
      await api.delete(`/schedules/events/${id}`);
      await queryClient.invalidateQueries({ queryKey: ["schedule-events", eventType] });
      setMessage("Jadwal berhasil dihapus.");
    } catch (error: any) {
      setMessage(error?.response?.data?.detail || "Operasi gagal.");
    }
  };
  const selectedPeriod = periods.data?.find((period) => period.id === form.exam_period_id);
  const availablePeriods = periods.data?.filter((period) => period.academic_year_id === form.academic_year_id) || [];
  const subjectTeachers = teachers.data?.filter((teacher) =>
    teacher.is_active && teacher.subject_ids.includes(form.subject_id)
  ) || [];
  useEffect(() => {
    if (eventType === "KBM" && modalOpen && form.subject_id && !form.teacher_id && subjectTeachers.length) {
      set("teacher_id", subjectTeachers[0].id);
    }
  }, [eventType, form.subject_id, form.teacher_id, modalOpen, subjectTeachers]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const rombelIds = eventType === "KBM" ? selectedRombelIds : [form.rombel_id];
    if (!rombelIds.length || !rombelIds[0]) {
      setMessage("Pilih minimal satu rombel.");
      return;
    }
    const subjectName = subjects.data?.find((subject) => subject.id === form.subject_id)?.name || "";
    const period = periods.data?.find((item) => item.id === form.exam_period_id);
    const title = eventType === "EXAM"
      ? `${period ? periodLabels[period.period_type] : "Ujian"} - ${subjectName}`
      : form.title;
    const payload: Record<string, string | number | string[]> = {
      title,
      description: form.description || "",
      academic_year_id: form.academic_year_id,
      rombel_id: rombelIds[0],
      rombel_ids: rombelIds,
      subject_id: form.subject_id,
      teacher_id: form.teacher_id,
      start_time: form.start_time,
      end_time: form.end_time,
    };
    if (eventType === "KBM") {
      payload.day_of_week = Number(form.day_of_week);
    } else {
      payload.exam_period_id = form.exam_period_id;
      payload.schedule_date = form.schedule_date;
    }
    save.mutate(payload);
  };
  const name = (id: string, rows: { id: string; name?: string; full_name?: string }[], field: "name" | "full_name") =>
    rows.find((row) => row.id === id)?.[field] || "-";
  const title = eventType === "KBM" ? "Jadwal Mapel" : "Jadwal Ujian";
  const weekdays = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const visibleEvents = events.data?.items || [];
  const pageCount = Math.max(1, Math.ceil((events.data?.total || 0) / pageSize));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  useEffect(() => {
    if (events.data && currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, events.data, pageCount]);
  const periodLabel = (id?: string | null) => {
    const period = periods.data?.find((item) => item.id === id);
    const year = years.data?.find((item) => item.id === period?.academic_year_id);
    return period ? `${periodLabels[period.period_type]} ${year?.year_name || ""}` : "-";
  };
  const rombelLabel = (item: ScheduleEvent) => (item.rombel_ids || [item.rombel_id])
    .map((id) => name(id, rombels.data || [], "name"))
    .join(", ");

  return (
    <AdminLayout
      adminOnly
      title={title}
      description={eventType === "KBM"
        ? "Atur jadwal pelajaran mingguan per rombel."
        : "Atur jadwal mapel dan guru pengawas dalam rentang periode ujian."}
    >
      <div className="resource-page grid gap-4">
        <section className="panel resource-list overflow-hidden rounded-2xl">
          <div className="panel-heading flex items-center justify-between gap-3">
            <div><p className="eyebrow">DAFTAR JADWAL</p><h3>{title}</h3></div>
            <div className="toolbar flex items-center gap-2">
              <span className="record-count">{events.data?.total || 0} jadwal</span>
              <button
                className="button-with-icon min-h-11"
                type="button"
                aria-label={`Filter ${title}`}
                onClick={() => {
                  setDraftFilters(filters);
                  setFilterModalOpen(true);
                }}
              >
                <SlidersHorizontal size={16} aria-hidden="true" />Filter
              </button>
              <button className="button-with-icon" type="button" onClick={openCreate}>
                <Plus size={16} aria-hidden="true" />Tambah jadwal
              </button>
            </div>
          </div>
          {message && <p className={message.includes("gagal") || message.includes("bertabrakan") ? "error" : "success"}>{message}</p>}
          {activeFilterCount > 0 && <p className="muted">Filter aktif · {activeFilterCount} kriteria</p>}
          <div className="recent-table overflow-x-auto">
            <table>
              <thead>
                <tr>
                  {eventType === "EXAM" && <th>Periode Ujian</th>}
                  <th>{eventType === "EXAM" ? "Mata Pelajaran" : "Judul"}</th>
                  <th>Rombel</th><th>{eventType === "EXAM" ? "Guru Pengawas" : "Guru"}</th><th>Waktu</th><th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleEvents.map((item) => (
                  <tr key={item.id}>
                    {eventType === "EXAM" && <td data-label="Periode Ujian">{periodLabel(item.exam_period_id)}</td>}
                    <td data-label={eventType === "EXAM" ? "Mata Pelajaran" : "Judul"}>
                      {eventType === "EXAM" ? name(item.subject_id, subjects.data || [], "name") : item.title}
                    </td>
                    <td data-label="Rombel">{rombelLabel(item)}</td>
                    <td data-label={eventType === "EXAM" ? "Guru Pengawas" : "Guru"}>{name(item.teacher_id, teachers.data || [], "full_name")}</td>
                    <td data-label="Waktu">
                      {eventType === "KBM" ? weekdays[item.day_of_week || 0] : item.schedule_date}<br />
                      {item.start_time}–{item.end_time}
                    </td>
                    <td className="action-cell">
                      <button className="button-with-icon" type="button" onClick={() => edit(item)}>
                        <Pencil size={14} aria-hidden="true" />Edit
                      </button>
                      <button className="button-with-icon" type="button" onClick={() => remove(item.id)}>
                        <Trash2 size={14} aria-hidden="true" />Hapus
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!visibleEvents.length && <div className="empty-state">
              <strong>{activeFilterCount ? "Tidak ada jadwal sesuai filter" : "Belum ada jadwal"}</strong>
              <span>{activeFilterCount ? "Ubah atau reset filter untuk melihat jadwal lainnya." : "Tambahkan jadwal dengan tombol di atas."}</span>
            </div>}
          </div>
          {(events.data?.total || 0) > 0 && (
            <div className="management-pagination">
              <label>
                <span>Baris per halaman</span>
                <select
                  aria-label="Baris per halaman"
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setCurrentPage(1);
                  }}
                >
                  {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <div className="management-pagination-controls">
                <button
                  type="button"
                  className="button-with-icon min-h-11"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((page) => page - 1)}
                >Sebelumnya</button>
                <span aria-live="polite">Halaman {currentPage} dari {pageCount}</span>
                <button
                  type="button"
                  className="button-with-icon min-h-11"
                  disabled={currentPage >= pageCount}
                  onClick={() => setCurrentPage((page) => page + 1)}
                >Berikutnya</button>
              </div>
            </div>
          )}
        </section>
      </div>

      <ModalDialog open={filterModalOpen} title={`Filter ${title}`} onClose={() => setFilterModalOpen(false)}>
        <form
          className="resource-form-grid grid grid-cols-1 gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters(draftFilters);
            setCurrentPage(1);
            setFilterModalOpen(false);
          }}
        >
          <label>
            <span>Tahun ajaran</span>
            <select
              aria-label="Tahun ajaran"
              className="min-h-11"
              value={draftFilters.academic_year_id}
              onChange={(event) => setDraftFilters({
                ...draftFilters,
                academic_year_id: event.target.value,
                rombel_id: "",
              })}
            >
              <option value="">Semua tahun ajaran</option>
              {years.data?.map((year) => <option key={year.id} value={year.id}>{year.year_name}</option>)}
            </select>
          </label>
          <label>
            <span>Rombel</span>
            <select
              aria-label="Rombel"
              className="min-h-11"
              value={draftFilters.rombel_id}
              onChange={(event) => setDraftFilters({ ...draftFilters, rombel_id: event.target.value })}
            >
              <option value="">Semua rombel</option>
              {rombels.data
                ?.filter((rombel) => !draftFilters.academic_year_id || rombel.academic_year_id === draftFilters.academic_year_id)
                .map((rombel) => <option key={rombel.id} value={rombel.id}>{rombel.name}</option>)}
            </select>
          </label>
          <label>
            <span>Hari</span>
            <select
              aria-label="Hari"
              className="min-h-11"
              value={draftFilters.day_of_week}
              onChange={(event) => setDraftFilters({ ...draftFilters, day_of_week: event.target.value })}
            >
              <option value="">Semua hari</option>
              {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          </label>
          <div className="modal-actions">
            <button
              className="button-with-icon min-h-11"
              type="button"
              onClick={() => {
                setDraftFilters(emptyScheduleFilters);
                setFilters(emptyScheduleFilters);
                setCurrentPage(1);
                setFilterModalOpen(false);
              }}
            >Reset</button>
            <button className="button-with-icon min-h-11" type="submit">Terapkan filter</button>
          </div>
        </form>
      </ModalDialog>

      <ModalDialog open={modalOpen} title={`${editing ? "Edit" : "Tambah"} ${title}`} onClose={close}>
        <form className="resource-form-grid grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={submit}>
          {eventType === "KBM" && (
            <input autoFocus placeholder="Judul jadwal" value={form.title || ""} onChange={(e) => set("title", e.target.value)} required />
          )}
          <select
            value={form.academic_year_id || ""}
            onChange={(e) => {
              set("academic_year_id", e.target.value);
              if (eventType === "EXAM") set("exam_period_id", "");
              else setSelectedRombelIds([]);
            }}
            required
          >
            <option value="">Pilih Tahun Ajaran</option>
            {years.data?.map((year) => <option key={year.id} value={year.id}>{year.year_name}</option>)}
          </select>
          {eventType === "EXAM" && (
            <select value={form.exam_period_id || ""} onChange={(e) => set("exam_period_id", e.target.value)} required>
              <option value="">Pilih Periode Ujian</option>
              {availablePeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {periodLabels[period.period_type]} ({period.start_date} – {period.end_date})
                </option>
              ))}
            </select>
          )}
          {eventType === "KBM" ? (
            <fieldset className="grid gap-2 md:col-span-2">
              <legend>Rombel (pilih satu atau lebih)</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {rombels.data?.filter((rombel) => rombel.academic_year_id === form.academic_year_id)
                  .map((rombel) => (
                    <label className="flex min-h-11 items-center gap-2" key={rombel.id}>
                      <input
                        type="checkbox"
                        checked={selectedRombelIds.includes(rombel.id)}
                        onChange={(event) => {
                          const nextIds = event.target.checked
                            ? [...selectedRombelIds, rombel.id]
                            : selectedRombelIds.filter((id) => id !== rombel.id);
                          setSelectedRombelIds(nextIds);
                        }}
                      />
                      <span>{rombel.name}</span>
                    </label>
                  ))}
              </div>
              {!selectedRombelIds.length && <p className="error" role="alert">Pilih minimal satu rombel.</p>}
            </fieldset>
          ) : (
            <select value={form.rombel_id || ""} onChange={(e) => set("rombel_id", e.target.value)} required>
              <option value="">Pilih Rombel</option>
              {rombels.data?.filter((rombel) => rombel.academic_year_id === form.academic_year_id)
                .map((rombel) => <option key={rombel.id} value={rombel.id}>{rombel.name}</option>)}
            </select>
          )}
          <select
            value={form.subject_id || ""}
            onChange={(e) => {
              const subjectId = e.target.value;
              set("subject_id", subjectId);
              if (eventType === "KBM") {
                const matchingTeachers = teachers.data?.filter((teacher) =>
                  teacher.is_active && teacher.subject_ids.includes(subjectId)
                ) || [];
                set("teacher_id", matchingTeachers[0]?.id || "");
              }
            }}
            required
          >
            <option value="">Pilih Mata Pelajaran</option>
            {subjects.data?.filter((subject) => subject.is_active)
              .map((subject) => <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>)}
          </select>
          <select value={form.teacher_id || ""} onChange={(e) => set("teacher_id", e.target.value)} required>
            <option value="">
              {eventType === "EXAM" ? "Pilih Guru Pengawas" : subjectTeachers.length ? "Pilih Guru Mapel" : "Belum ada Guru Mapel"}
            </option>
            {(eventType === "EXAM" ? teachers.data?.filter((teacher) => teacher.is_active) || [] : subjectTeachers)
              .map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>)}
          </select>
          {eventType === "KBM" ? (
            <select value={form.day_of_week || ""} onChange={(e) => set("day_of_week", e.target.value)} required>
              <option value="">Pilih Hari</option>
              {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
            </select>
          ) : (
            <input
              type="date"
              value={form.schedule_date || ""}
              min={selectedPeriod?.start_date}
              max={selectedPeriod?.end_date}
              onChange={(e) => set("schedule_date", e.target.value)}
              required
            />
          )}
          <div className="two-columns">
            <input type="time" value={form.start_time || ""} onChange={(e) => set("start_time", e.target.value)} required />
            <input type="time" value={form.end_time || ""} onChange={(e) => set("end_time", e.target.value)} required />
          </div>
          {eventType === "KBM" && (
            <textarea placeholder="Deskripsi (opsional)" value={form.description || ""} onChange={(e) => set("description", e.target.value)} />
          )}
          <div className="modal-actions">
            <button className="button-with-icon" type="button" onClick={close}><X size={16} aria-hidden="true" />Batal</button>
            <button className="button-with-icon" disabled={save.isPending}>
              <Save size={16} aria-hidden="true" />{save.isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </ModalDialog>
    </AdminLayout>
  );
}
