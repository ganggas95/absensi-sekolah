import {FormEvent, useDeferredValue, useEffect, useState} from "react";
import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Plus, Search, SlidersHorizontal} from "lucide-react";
import AdminLayout from "../AdminLayout";
import {api} from "../../services/api";
import type {AcademicYear, Rombel, Subject, User} from "../../types";
import MasterDataFilters, {emptyFilters, type MasterFilters} from "./MasterDataFilters";
import MasterDataForm, {type MasterDataOptions, type MasterDataResource, type MasterDataRow} from "./MasterDataForm";
import MasterDataTable from "./MasterDataTable";

type PaginatedRows = { items: MasterDataRow[]; total: number; page: number; limit: number };
const resources: Record<MasterDataResource, { title: string; description: string; endpoint: string }> = {
    "academic-years": {
        title: "Tahun Ajaran",
        description: "Atur periode tahun ajaran dan status aktifnya.",
        endpoint: "/management/academic-years"
    },
    users: {title: "User", description: "Kelola akun administrator dan guru.", endpoint: "/management/users"},
    teachers: {
        title: "Guru",
        description: "Kelola profil Guru dan Mata Pelajaran yang diampu.",
        endpoint: "/management/teachers"
    },
    subjects: {
        title: "Mata Pelajaran",
        description: "Kelola daftar Mata Pelajaran sekolah.",
        endpoint: "/management/subjects"
    },
    rombels: {title: "Rombel", description: "Kelola kelompok belajar dan wali kelas.", endpoint: "/management/rombels"},
    students: {title: "Siswa", description: "Kelola profil siswa dan penempatannya.", endpoint: "/management/students"}
};

export default function MasterDataPage({resource}: { resource: MasterDataResource }) {
    const queryClient = useQueryClient();
    const current = resources[resource];
    const [editing, setEditing] = useState<MasterDataRow | null>(null);
    const [form, setForm] = useState<Record<string, any>>({});
    const [modalOpen, setModalOpen] = useState(false);
    const [message, setMessage] = useState("");
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [search, setSearch] = useState("");
    const deferredSearch = useDeferredValue(search);
    const [searchQuery, setSearchQuery] = useState("");
    const [filters, setFilters] = useState(emptyFilters);
    const [draftFilters, setDraftFilters] = useState(emptyFilters);
    const [filterOpen, setFilterOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        const timeout = window.setTimeout(() => setSearchQuery(deferredSearch), 300);
        return () => window.clearTimeout(timeout);
    }, [deferredSearch]);

    const rows = useQuery<PaginatedRows>({
        queryKey: [resource, currentPage, pageSize, searchQuery, filters],
        queryFn: async () => (await api.get<PaginatedRows>(current.endpoint, {
            params: {
                page: currentPage,
                limit: pageSize,
                q: searchQuery.trim() || undefined,
                is_active: filters.is_active || undefined,
                role: filters.role || undefined,
                gender: filters.gender || undefined,
                academic_year_id: filters.academic_year_id && filters.academic_year_id !== "none" ? filters.academic_year_id : undefined,
                without_academic_year: filters.academic_year_id === "none" || undefined,
                homeroom_teacher_id: filters.homeroom_teacher_id && filters.homeroom_teacher_id !== "none" ? filters.homeroom_teacher_id : undefined,
                without_homeroom_teacher: filters.homeroom_teacher_id === "none" || undefined,
                rombel_id: filters.rombel_id && filters.rombel_id !== "none" ? filters.rombel_id : undefined,
                without_rombel: filters.rombel_id === "none" || undefined
            }
        })).data
    });
    const years = useQuery<AcademicYear[]>({
        queryKey: ["academic-years"],
        queryFn: async () => (await api.get("/management/academic-years")).data,
        enabled: resource === "rombels"
    });
    const users = useQuery<User[]>({
        queryKey: ["users"],
        queryFn: async () => (await api.get("/management/users")).data,
        enabled: resource === "teachers" || resource === "rombels"
    });
    const subjects = useQuery<Subject[]>({
        queryKey: ["subjects"],
        queryFn: async () => (await api.get("/management/subjects")).data,
        enabled: resource === "teachers"
    });
    const rombels = useQuery<Rombel[]>({
        queryKey: ["rombels"],
        queryFn: async () => (await api.get("/management/rombels")).data,
        enabled: resource === "students"
    });
    const options: MasterDataOptions = {
        years: years.data, users: users.data, subjects: subjects.data, rombels: rombels.data
    };
    const save = useMutation({
        mutationFn: async (payload: Record<string, any>) => {
            const response = editing
                ? await api.put(`${current.endpoint}/${editing.id}`, payload)
                : await api.post(current.endpoint, payload);
            if (resource === "teachers" && Array.isArray(payload.subject_ids)) {
                await api.put(`/management/teachers/${response.data.id}/subjects`, {subject_ids: payload.subject_ids});
            }
            if (resource === "students" && photoFile) {
                const photoPayload = new FormData();
                photoPayload.append("photo", photoFile);
                try {
                    const photo = await api.post(`/management/students/${response.data.id}/photo`, photoPayload, {
                        headers: {"Content-Type": "multipart/form-data"}
                    });
                    response.data.photo_url = photo.data.photo_url;
                } catch (error: any) {
                    return {
                        data: response.data,
                        photoUploadError: error?.response?.data?.detail || "Gagal mengunggah foto."
                    };
                }
            }
            return {data: response.data};
        },
        onSuccess: async (result) => {
            await queryClient.invalidateQueries({queryKey: [resource]});
            if (result.photoUploadError) {
                setEditing(result.data);
                setForm({...result.data});
                setMessage(`Data siswa tersimpan, tetapi upload foto gagal: ${result.photoUploadError}`);
                return;
            }
            setEditing(null);
            setForm({});
            setPhotoFile(null);
            setModalOpen(false);
            setMessage("Data berhasil disimpan.");
        },
        onError: (error: any) => setMessage(error?.response?.data?.detail || "Operasi gagal.")
    });

    const onFormChange = (key: string, value: any) => setForm((old) => ({...old, [key]: value}));
    const openCreate = () => {
        setEditing(null);
        setForm(resource === "users" ? {role: "GURU"} : {});
        setPhotoFile(null);
        setMessage("");
        setModalOpen(true);
    };
    const edit = (row: MasterDataRow) => {
        setEditing(row);
        setForm({...row, password: ""});
        setPhotoFile(null);
        setMessage("");
        setModalOpen(true);
    };
    const closeForm = () => {
        if (!save.isPending) {
            setEditing(null);
            setForm({});
            setPhotoFile(null);
            setModalOpen(false);
        }
    };
    const submit = (event: FormEvent) => {
        event.preventDefault();
        const payload = {...form};
        Object.keys(payload).forEach((key) => {
            if (payload[key] === "") delete payload[key];
        });
        if (resource === "students" && Object.prototype.hasOwnProperty.call(form, "nisn")) {
            payload.nisn = String(form.nisn ?? "").trim() || null;
        }
        save.mutate(payload);
    };
    const pageCount = Math.max(1, Math.ceil((rows.data?.total || 0) / pageSize));
    useEffect(() => {
        if (rows.data && currentPage > pageCount) setCurrentPage(pageCount);
    }, [currentPage, pageCount, rows.data]);
    const applyFilters = (event: FormEvent) => {
        event.preventDefault();
        setFilters(draftFilters);
        setCurrentPage(1);
        setFilterOpen(false);
    };
    const remove = async (id: string) => {
        if (!window.confirm("Nonaktifkan atau hapus data ini?")) return;
        try {
            await api.delete(`${current.endpoint}/${id}`);
            await queryClient.invalidateQueries({queryKey: [resource]});
            setMessage("Data berhasil diproses.");
        } catch (error: any) {
            setMessage(error?.response?.data?.detail || "Operasi gagal.");
        }
    };
    return <AdminLayout adminOnly title={current.title} description={current.description}>
        <div className="resource-page grid !gap-[18px]">
            <section className="panel resource-list overflow-hidden rounded-2xl bg-white">
                <div className="panel-heading flex items-center justify-between !gap-3">
                    <div><p className="eyebrow">DAFTAR DATA</p><h3>{current.title}</h3></div>
                    <div className="toolbar management-toolbar flex items-center !gap-2">
                        <label className="management-search">
                            <Search size={16} aria-hidden="true"/>
                            <input type="search" aria-label={`Cari ${current.title}`}
                                   placeholder={`Cari ${current.title}...`}
                                   value={search} onChange={(event) => {
                                setSearch(event.target.value);
                                setCurrentPage(1);
                            }}/>
                        </label>
                        <button className="button-with-icon min-h-11" type="button" onClick={() => {
                            setDraftFilters(filters);
                            setFilterOpen(true);
                        }}><SlidersHorizontal size={16} aria-hidden="true"/>Filter
                        </button>
                        <button className="button-with-icon min-h-11" onClick={openCreate}>
                            <Plus size={16} aria-hidden="true"/>Tambah {current.title}
                        </button>
                    </div>
                </div>
                {message && <p className={message.includes("gagal") ? "error" : "success"}>{message}</p>}
                <MasterDataTable resource={resource} rows={rows.data?.items || []} years={years.data} onEdit={edit}
                                 onRemove={remove}/>
                {rows.isError && <div className="error" role="alert">Data gagal dimuat. Silakan coba lagi.</div>}
                {rows.isPending && <div className="empty-state"><strong>Memuat data...</strong></div>}
                {!rows.isPending && !rows.isError && !rows.data?.items.length &&
                    <div className="empty-state">
                        <strong>{search || Object.values(filters).some(Boolean) ? "Tidak ada data yang sesuai" : "Belum ada data"}</strong>
                        <span>{search || Object.values(filters).some(Boolean)
                            ? "Ubah pencarian atau filter untuk melihat data lainnya."
                            : "Tambahkan data dengan tombol di atas."}</span>
                    </div>}
                {(rows.data?.total || 0) > 0 && <div className="management-pagination">
                    <label>
                        <span>Baris per halaman</span>
                        <select aria-label="Baris per halaman"
                                value={pageSize}
                                onChange={(event) => {
                                    setPageSize(Number(event.target.value));
                                    setCurrentPage(1);
                                }}>{
                            [10, 25, 50, 100].map((size) =>
                                <option
                                    key={size}
                                    value={size}>
                                    {size}
                                </option>)
                        }</select></label>
                    <div className="management-pagination-controls">
                        <button type="button"
                                className="button-with-icon min-h-11"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage((page) => page - 1)}>Sebelumnya
                        </button>
                        <span aria-live="polite">Halaman {currentPage} dari {pageCount}</span>
                        <button type="button"
                                className="button-with-icon min-h-11"
                                disabled={currentPage >= pageCount}
                                onClick={() => setCurrentPage((page) => page + 1)}
                        >Berikutnya
                        </button>
                    </div>
                </div>}
            </section>
        </div>
        <MasterDataFilters
            resource={resource}
            title={current.title}
            open={filterOpen}
            filters={draftFilters}
            options={options}
            onClose={() => setFilterOpen(false)}
            onChange={setDraftFilters} onSubmit={applyFilters}
            onReset={() => {
                setDraftFilters(emptyFilters);
                setFilters(emptyFilters);
                setCurrentPage(1);
                setFilterOpen(false);
            }}/>
        <MasterDataForm
            resource={resource}
            title={current.title}
            open={modalOpen}
            editing={editing}
            form={form}
            photoFile={photoFile}
            options={options}
            saving={save.isPending}
            onClose={closeForm}
            onSubmit={submit}
            onChange={onFormChange}
            onPhotoChange={setPhotoFile}/>
    </AdminLayout>;
}
