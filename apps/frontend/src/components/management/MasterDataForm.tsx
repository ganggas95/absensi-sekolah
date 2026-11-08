import type {FormEvent} from "react";
import {Save, X} from "lucide-react";
import ModalDialog from "../ModalDialog";
import StudentPhotoPicker from "../StudentPhotoPicker";
import type {AcademicYear, Rombel, Subject, User} from "../../types";

export type MasterDataResource = "academic-years" | "users" | "teachers" | "subjects" | "rombels" | "students";
export type MasterDataRow = {id: string; [key: string]: any};
export type MasterDataOptions = {
    years?: AcademicYear[];
    users?: User[];
    subjects?: Subject[];
    rombels?: Rombel[];
};

type Props = {
    resource: MasterDataResource;
    title: string;
    open: boolean;
    editing: MasterDataRow | null;
    form: Record<string, any>;
    photoFile: File | null;
    options: MasterDataOptions;
    saving: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent) => void;
    onChange: (key: string, value: any) => void;
    onPhotoChange: (file: File | null) => void;
};

export default function MasterDataForm({
    resource, title, open, editing, form, photoFile, options, saving, onClose, onSubmit, onChange, onPhotoChange
}: Props) {
    const value = (key: string) => String(form[key] ?? "");
    return <ModalDialog open={open} title={`${editing ? "Edit" : "Tambah"} ${title}`} onClose={onClose}>
        <form className="flex flex-col gap-y-2" onSubmit={onSubmit}>
            {resource === "academic-years" && <>
                <input autoFocus placeholder="Contoh: 2025/2026" value={value("year_name")}
                       onChange={(event) => onChange("year_name", event.target.value)} required/>
                <label className="check-label">
                    <input type="checkbox" checked={Boolean(form.is_active)}
                           onChange={(event) => onChange("is_active", event.target.checked)}/> Tahun aktif
                </label>
            </>}
            {resource === "users" && <>
                <input autoFocus placeholder="Username" value={value("username")}
                       onChange={(event) => onChange("username", event.target.value)} required/>
                <input placeholder="Nama lengkap" value={value("full_name")}
                       onChange={(event) => onChange("full_name", event.target.value)} required/>
                <input type="password" placeholder={editing ? "Password baru (opsional)" : "Password"}
                       value={value("password")} onChange={(event) => onChange("password", event.target.value)}
                       required={!editing} minLength={6}/>
                <select value={value("role") || "GURU"} onChange={(event) => onChange("role", event.target.value)}>
                    <option value="GURU">Guru</option><option value="ADMIN">Admin</option>
                </select>
            </>}
            {resource === "teachers" && <>
                <select autoFocus value={value("user_id")} onChange={(event) => onChange("user_id", event.target.value)} required>
                    <option value="">Pilih akun Guru</option>
                    {options.users?.filter((user) => user.role === "GURU" && user.is_active).map((user) =>
                        <option key={user.id} value={user.id}>{user.full_name} ({user.username})</option>)}
                </select>
                <input placeholder="NIP (opsional)" value={value("nip")}
                       onChange={(event) => onChange("nip", event.target.value)}/>
                <input placeholder="Nomor telepon" value={value("phone")}
                       onChange={(event) => onChange("phone", event.target.value)}/>
                <select multiple className="multi-select"
                        value={Array.isArray(form.subject_ids) ? form.subject_ids : []}
                        onChange={(event) => onChange("subject_ids", Array.from(event.target.selectedOptions).map((option) => option.value))}>
                    <option disabled value="">Pilih Mata Pelajaran</option>
                    {options.subjects?.map((subject) =>
                        <option key={subject.id} value={subject.id}>{subject.code} — {subject.name}</option>)}
                </select>
            </>}
            {resource === "subjects" && <>
                <input autoFocus placeholder="Kode, contoh: MTK" value={value("code")}
                       onChange={(event) => onChange("code", event.target.value)} required/>
                <input placeholder="Nama Mata Pelajaran" value={value("name")}
                       onChange={(event) => onChange("name", event.target.value)} required/>
            </>}
            {resource === "rombels" && <>
                <input autoFocus placeholder="Nama rombel" value={value("name")}
                       onChange={(event) => onChange("name", event.target.value)} required/>
                <select value={value("academic_year_id")}
                        onChange={(event) => onChange("academic_year_id", event.target.value)}>
                    <option value="">Pilih Tahun Ajaran</option>
                    {options.years?.map((year) => <option key={year.id} value={year.id}>{year.year_name}</option>)}
                </select>
                <select value={value("homeroom_teacher_id")}
                        onChange={(event) => onChange("homeroom_teacher_id", event.target.value)}>
                    <option value="">Pilih Wali Kelas</option>
                    {options.users?.filter((user) => user.role === "GURU" && user.is_active).map((user) =>
                        <option key={user.id} value={user.id}>{user.full_name}</option>)}
                </select>
            </>}
            {resource === "students" && <>
                <StudentPhotoPicker photoUrl={form.photo_url} file={photoFile}
                    alt={`Pratinjau foto ${value("full_name") || "siswa"}`}
                    fallback={<span className="student-photo-upload-placeholder">Belum ada foto</span>}
                    onFileChange={onPhotoChange}/>
                <input autoFocus placeholder="NISN (opsional)" value={value("nisn")}
                       onChange={(event) => onChange("nisn", event.target.value)}/>
                <input placeholder="Nama lengkap" value={value("full_name")}
                       onChange={(event) => onChange("full_name", event.target.value)} required/>
                <select value={value("gender")} onChange={(event) => onChange("gender", event.target.value)}>
                    <option value="">Jenis Kelamin</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
                </select>
                <select value={value("rombel_id")} onChange={(event) => onChange("rombel_id", event.target.value)}>
                    <option value="">Pilih Rombel</option>
                    {options.rombels?.map((rombel) => <option key={rombel.id} value={rombel.id}>{rombel.name}</option>)}
                </select>
                <input placeholder="Telepon orang tua" value={value("parent_phone")}
                       onChange={(event) => onChange("parent_phone", event.target.value)}/>
            </>}
            <div className="modal-actions flex flex-wrap items-center justify-end !gap-2">
                <button className="button-with-icon min-h-11" type="button" onClick={onClose}>
                    <X size={16} aria-hidden="true"/>Batal
                </button>
                <button className="button-with-icon min-h-11" disabled={saving}>
                    <Save size={16} aria-hidden="true"/>{saving ? "Menyimpan..." : "Simpan"}
                </button>
            </div>
        </form>
    </ModalDialog>;
}
