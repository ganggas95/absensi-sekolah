import React from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, UserCheck, WifiOff } from "lucide-react-native";
import { api, extractApiError } from "../api/client";
import { iconColors, MIN_TOUCH } from "../theme/colors";
import { TeacherToday } from "../types";

export const TEACHER_TODAY_KEY = ["teacher-attendance-today"];

function formatClock(iso?: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Makassar",
  });
}

export function useTeacherToday() {
  return useQuery<TeacherToday>({
    queryKey: TEACHER_TODAY_KEY,
    queryFn: () => api.getTeacherToday(),
    refetchInterval: 30000,
  });
}

export default function TeacherAttendanceCard() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useTeacherToday();

  const onSuccess = () =>
    queryClient.invalidateQueries({ queryKey: TEACHER_TODAY_KEY });
  const onError = (err: unknown) =>
    Alert.alert("Absensi gagal", extractApiError(err, "Terjadi kesalahan."));

  const checkIn = useMutation({
    mutationFn: () => api.teacherCheckIn(),
    onSuccess,
    onError,
  });
  const checkOut = useMutation({
    mutationFn: () => api.teacherCheckOut(),
    onSuccess,
    onError,
  });
  const busy = checkIn.isPending || checkOut.isPending;

  if (isLoading && !data) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#2563eb" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={[styles.card, styles.cardWarn]}>
        <Text style={styles.warnText}>
          {extractApiError(
            error,
            "Gagal memuat status absensi guru. Tarik layar ke bawah untuk mencoba lagi."
          )}
        </Text>
      </View>
    );
  }

  if (!data.has_schedule) {
    return (
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <UserCheck size={18} color={iconColors.muted} />
          <Text style={styles.title}>Absensi Guru</Text>
        </View>
        <Text style={styles.muted}>
          {data.message || "Tidak ada jadwal mengajar hari ini."}
        </Text>
      </View>
    );
  }

  const att = data.attendance;
  const late = att?.status === "TERLAMBAT";

  return (
    <View style={styles.card} testID="teacher-attendance-card">
      <View style={styles.titleRow}>
        <UserCheck size={18} color={iconColors.primaryDark} />
        <Text style={styles.title}>Absensi Guru</Text>
        {att?.check_in_time ? (
          <View style={[styles.pill, late ? styles.pillLate : styles.pillOk]}>
            <Text style={[styles.pillText, late ? styles.pillLateText : styles.pillOkText]}>
              {late ? "TERLAMBAT" : "HADIR"}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.muted}>
        Jam mengajar {data.first_start?.slice(0, 5)} - {data.last_end?.slice(0, 5)}
        {data.late_after ? `  •  Batas tepat waktu ${data.late_after.slice(0, 5)}` : ""}
      </Text>

      <View style={styles.timesRow}>
        <View style={styles.timeBox}>
          <Text style={styles.timeLabel}>Datang</Text>
          <Text style={styles.timeValue}>{formatClock(att?.check_in_time)}</Text>
        </View>
        <View style={styles.timeBox}>
          <Text style={styles.timeLabel}>Pulang</Text>
          <Text style={styles.timeValue}>{formatClock(att?.check_out_time)}</Text>
        </View>
      </View>

      {!data.on_school_network ? (
        <View style={styles.networkWarn}>
          <WifiOff size={16} color="#b45309" />
          <Text style={styles.networkWarnText}>
            Hubungkan perangkat ke WiFi sekolah untuk melakukan absensi.
            {data.client_ip ? `\nIP terdeteksi server: ${data.client_ip}` : ""}
          </Text>
        </View>
      ) : data.message ? (
        <Text style={styles.info}>{data.message}</Text>
      ) : null}

      <View style={styles.btnRow}>
        <TouchableOpacity
          testID="btn-teacher-check-in"
          style={[styles.btn, styles.btnIn, (!data.can_check_in || busy) && styles.btnDisabled]}
          disabled={!data.can_check_in || busy}
          onPress={() => checkIn.mutate()}
          accessibilityLabel="Absen datang"
        >
          {checkIn.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.btnContent}>
              <LogIn size={18} color="#fff" />
              <Text style={styles.btnText}>Absen Datang</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          testID="btn-teacher-check-out"
          style={[styles.btn, styles.btnOut, (!data.can_check_out || busy) && styles.btnDisabled]}
          disabled={!data.can_check_out || busy}
          onPress={() => checkOut.mutate()}
          accessibilityLabel="Absen pulang"
        >
          {checkOut.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.btnContent}>
              <LogOut size={18} color="#fff" />
              <Text style={styles.btnText}>Absen Pulang</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginTop: 16,
  },
  cardWarn: { backgroundColor: "#fef3c7", borderColor: "#fcd34d" },
  warnText: { color: "#92400e", fontSize: 13 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  title: { fontSize: 16, fontWeight: "bold", color: "#1e293b", flex: 1 },
  muted: { fontSize: 12, color: "#64748b" },
  info: { fontSize: 12, color: "#0369a1", marginTop: 8 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillOk: { backgroundColor: "#dcfce7" },
  pillLate: { backgroundColor: "#ffedd5" },
  pillText: { fontSize: 11, fontWeight: "800" },
  pillOkText: { color: "#15803d" },
  pillLateText: { color: "#c2410c" },
  timesRow: {
    flexDirection: "row",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
  },
  timeBox: { flex: 1, alignItems: "center" },
  timeLabel: { fontSize: 11, color: "#64748b", fontWeight: "500" },
  timeValue: { fontSize: 20, fontWeight: "bold", color: "#0f172a", marginTop: 2 },
  networkWarn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#fef3c7",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  networkWarnText: { flex: 1, color: "#92400e", fontSize: 12, fontWeight: "600" },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  btnIn: { backgroundColor: "#16a34a" },
  btnOut: { backgroundColor: "#ea580c" },
  btnDisabled: { opacity: 0.4 },
  btnContent: { flexDirection: "row", alignItems: "center", gap: 6 },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
});
