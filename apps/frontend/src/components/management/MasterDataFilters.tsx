import type {FormEvent} from "react";
import ModalDialog from "../ModalDialog";
import type {MasterDataOptions, MasterDataResource} from "./MasterDataForm";

export type MasterFilters = {
    is_active: string;
    role: string;
    gender: string;
    academic_year_id: string;
    rombel_id: string;
    homeroom_teacher_id: string;
};

export const emptyFilters: MasterFilters = {
    is_active: "", role: "", gender: "", academic_year_id: "", rombel_id: "", homeroom_teacher_id: ""
};

type Props = {
    resource: MasterDataResource;
    title: string;
    open: boolean;
    filters: MasterFilters;
    options: MasterDataOptions;
    onClose: () => void;
    onChange: (filters: MasterFilters) => void;
    onSubmit: (event: FormEvent) => void;
    onReset: () => void;
};

export default function MasterDataFilters({
    resource, title, open, filters, options, onClose, onChange, onSubmit, onReset
}: Props) {
    return <ModalDialog open={open} title={`Filter ${title}`} onClose={onClose}>
        <form className="management-filter-grid" onSubmit={onSubmit}>
            {(resource === "academic-years" || resource === "teachers" || resource === "subjects") &&
                <label><span>Status</span><select aria-label="Status" value={filters.is_active}
                    onChange={(event) => onChange({...filters, is_active: event.target.value})}>
                    <option value="">Semua status</option><option value="true">Aktif</option><option value="false">Tidak aktif</option>
                </select></label>}
            {resource === "users" && <>
                <label><span>Role</span><select aria-label="Role" value={filters.role}
                    onChange={(event) => onChange({...filters, role: event.target.value})}>
                    <option value="">Semua role</option><option value="ADMIN">Admin</option><option value="GURU">Guru</option>
                </select></label>
                <label><span>Status</span><select aria-label="Status" value={filters.is_active}
                    onChange={(event) => onChange({...filters, is_active: event.target.value})}>
                    <option value="">Semua status</option><option value="true">Aktif</option><option value="false">Tidak aktif</option>
                </select></label>
            </>}
            {resource === "rombels" && <>
                <label><span>Tahun ajaran</span><select aria-label="Tahun ajaran" value={filters.academic_year_id}
                    onChange={(event) => onChange({...filters, academic_year_id: event.target.value})}>
                    <option value="">Semua tahun ajaran</option><option value="none">Tanpa tahun ajaran</option>
                    {options.years?.map((year) => <option key={year.id} value={year.id}>{year.year_name}</option>)}
                </select></label>
                <label><span>Wali kelas</span><select aria-label="Wali kelas" value={filters.homeroom_teacher_id}
                    onChange={(event) => onChange({...filters, homeroom_teacher_id: event.target.value})}>
                    <option value="">Semua wali kelas</option><option value="none">Belum ditentukan</option>
                    {options.users?.filter((user) => user.role === "GURU").map((user) =>
                        <option key={user.id} value={user.id}>{user.full_name}</option>)}
                </select></label>
            </>}
            {resource === "students" && <>
                <label><span>Jenis kelamin</span><select aria-label="Jenis kelamin" value={filters.gender}
                    onChange={(event) => onChange({...filters, gender: event.target.value})}>
                    <option value="">Semua jenis kelamin</option><option value="L">Laki-laki</option><option value="P">Perempuan</option>
                </select></label>
                <label><span>Rombel</span><select aria-label="Rombel" value={filters.rombel_id}
                    onChange={(event) => onChange({...filters, rombel_id: event.target.value})}>
                    <option value="">Semua rombel</option><option value="none">Tanpa rombel</option>
                    {options.rombels?.map((rombel) => <option key={rombel.id} value={rombel.id}>{rombel.name}</option>)}
                </select></label>
            </>}
            <div className="modal-actions">
                <button className="button-with-icon min-h-11" type="button" onClick={onReset}>Reset</button>
                <button className="button-with-icon min-h-11" type="submit">Terapkan filter</button>
            </div>
        </form>
    </ModalDialog>;
}
