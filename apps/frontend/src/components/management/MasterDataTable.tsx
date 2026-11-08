import {Ban, Pencil} from "lucide-react";
import StudentPhoto from "../StudentPhoto";
import type {AcademicYear} from "../../types";
import type {MasterDataResource, MasterDataRow} from "./MasterDataForm";

type Props = {
    resource: MasterDataResource;
    rows: MasterDataRow[];
    years?: AcademicYear[];
    onEdit: (row: MasterDataRow) => void;
    onRemove: (id: string) => void;
};

export default function MasterDataTable({resource, rows, years, onEdit, onRemove}: Props) {
    return <div className="recent-table overflow-x-auto">
        <table>
            <thead><tr>{resource === "academic-years" ? <>
                <th>Tahun</th><th>Status</th>
            </> : resource === "users" ? <>
                <th>Username</th><th>Nama</th><th>Role</th>
            </> : resource === "teachers" ? <>
                <th>Nama</th><th>NIP</th><th>Mapel</th>
            </> : resource === "subjects" ? <>
                <th>Kode</th><th>Mata Pelajaran</th>
            </> : resource === "rombels" ? <>
                <th>Nama</th><th>Tahun Ajaran</th>
            </> : <>
                <th>Foto</th><th>NISN</th><th>Nama</th><th>Gender</th>
            </>}<th>Aksi</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id}>
                {resource === "academic-years" ? <>
                    <td data-label="Tahun">{row.year_name}</td><td data-label="Status">{row.is_active ? "Aktif" : "Tidak aktif"}</td>
                </> : resource === "users" ? <>
                    <td data-label="Username">{row.username}</td><td data-label="Nama">{row.full_name}</td><td data-label="Role">{row.role}</td>
                </> : resource === "teachers" ? <>
                    <td data-label="Nama">{row.full_name}</td><td data-label="NIP">{row.nip || "-"}</td>
                    <td data-label="Mapel">{row.subject_ids?.length || 0} mapel</td>
                </> : resource === "subjects" ? <>
                    <td data-label="Kode">{row.code}</td><td data-label="Mata Pelajaran">{row.name}</td>
                </> : resource === "rombels" ? <>
                    <td data-label="Nama">{row.name}</td>
                    <td data-label="Tahun Ajaran">{years?.find((year) => year.id === row.academic_year_id)?.year_name || "-"}</td>
                </> : <>
                    <td data-label="Foto"><StudentPhoto photoUrl={row.photo_url} className="student-table-photo"
                        alt={`Foto ${row.full_name}`}
                        fallback={<span className="student-table-photo-placeholder">{row.full_name?.[0]?.toUpperCase() || "?"}</span>}/></td>
                    <td data-label="NISN">{row.nisn || "-"}</td><td data-label="Nama">{row.full_name}</td>
                    <td data-label="Gender">{row.gender || "-"}</td>
                </>}
                <td className="action-cell">
                    <button className="button-with-icon" onClick={() => onEdit(row)}><Pencil size={14} aria-hidden="true"/>Edit</button>
                    {resource !== "academic-years" &&
                        <button className="button-with-icon" onClick={() => onRemove(row.id)}><Ban size={14} aria-hidden="true"/>Nonaktifkan</button>}
                </td>
            </tr>)}</tbody>
        </table>
    </div>;
}
