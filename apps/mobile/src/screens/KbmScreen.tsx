import React from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CalendarDays, ChevronRight, Clock, ScanLine, Users } from "lucide-react-native";
import TabHeader from "../components/TabHeader";
import { useTeacherToday } from "../components/TeacherAttendanceCard";
import { TEACHER_STATS_KEY, useTeacherStats } from "../hooks/useTeacherStats";
import { iconColors, MIN_TOUCH } from "../theme/colors";

export default function KbmScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const { data: stats, isLoading, isRefetching, error } = useTeacherStats();
  const { data: teacherToday } = useTeacherToday();
  const activeSched = stats?.active_schedule;

  const openStudentSession = () => {
    if (!activeSched) return;
    const go = () =>
      navigation.navigate("AttendanceSession", {
        scheduleId: activeSched.schedule_id,
        scheduleTitle: activeSched.title,
        rombelName: activeSched.rombel_name,
      });
    // Guru harus absen datang sebelum masuk kelas; ingatkan, jangan blokir.
    if (teacherToday?.has_schedule && !teacherToday.attendance?.check_in_time) {
      Alert.alert(
        "Anda belum absen datang",
        "Lakukan absen datang guru di tab Absensi sebelum masuk kelas.",
        [
          { text: "Ke Tab Absensi", onPress: () => navigation.navigate("Absensi") },
          { text: "Lanjut Tetap Buka", onPress: go },
          { text: "Kembali", style: "cancel" },
        ]
      );
      return;
    }
    go();
  };

  return (
    <View style={styles.container}>
      <TabHeader title="KBM" subtitle="Jadwal mengajar dan sesi absensi siswa" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() =>
              queryClient.invalidateQueries({ queryKey: TEACHER_STATS_KEY })
            }
          />
        }
      >
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <CalendarClock size={18} color={iconColors.primaryDark} />
            <Text style={styles.sectionTitle}>Jadwal Mengajar Saat Ini</Text>
          </View>
          <TouchableOpacity
            style={styles.sectionLinkBtn}
            onPress={() => navigation.navigate("ScheduleList")}
          >
            <Text style={styles.sectionLink}>Semua Jadwal</Text>
            <ChevronRight size={16} color={iconColors.primary} />
          </TouchableOpacity>
        </View>

        {isLoading && !stats ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Gagal memuat jadwal. Tarik layar ke bawah untuk mencoba lagi.
            </Text>
          </View>
        ) : activeSched ? (
          <View
            style={[styles.activeCard, activeSched.is_currently_active && styles.activeCardHighlight]}
          >
            <View style={styles.activeCardTop}>
              <View
                style={[
                  styles.statusPill,
                  activeSched.is_currently_active ? styles.pillLive : styles.pillUpcoming,
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    activeSched.is_currently_active ? styles.pillLiveText : styles.pillUpcomingText,
                  ]}
                >
                  {activeSched.is_currently_active ? "• SEDANG BERLANGSUNG" : "JADWAL HARI INI"}
                </Text>
              </View>
              <View style={styles.timeInline}>
                <Clock size={14} color="#475569" />
                <Text style={styles.schedTime}>
                  {activeSched.start_time.slice(0, 5)} - {activeSched.end_time.slice(0, 5)}
                </Text>
              </View>
            </View>

            <Text style={styles.schedTitle}>{activeSched.title}</Text>
            <Text style={styles.schedMeta}>
              {activeSched.rombel_name} • {activeSched.subject_name}
            </Text>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Users size={16} color="#475569" style={{ marginBottom: 2 }} />
                <Text style={styles.statValue}>{activeSched.total_students}</Text>
                <Text style={styles.statLabel}>Total Siswa</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: "#16a34a" }]}>{activeSched.hadir_count}</Text>
                <Text style={styles.statLabel}>Hadir</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: "#ea580c" }]}>{activeSched.terlambat_count}</Text>
                <Text style={styles.statLabel}>Terlambat</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: "#dc2626" }]}>{activeSched.unrecorded_count}</Text>
                <Text style={styles.statLabel}>Belum Absen</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.btnOpenSession} onPress={openStudentSession}>
              <View style={styles.btnContent}>
                <ScanLine size={20} color={iconColors.white} />
                <Text style={styles.btnOpenSessionText}>Buka Sesi Absensi Siswa</Text>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <CalendarDays size={36} color={iconColors.slate} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyCardText}>
              Tidak ada jadwal mengajar aktif pada hari ini.
            </Text>
            <TouchableOpacity
              style={styles.btnSmall}
              onPress={() => navigation.navigate("ScheduleList")}
            >
              <Text style={styles.btnSmallText}>Lihat Jadwal Guru</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { padding: 16, paddingBottom: 24 },
  loadingContainer: { paddingVertical: 60, alignItems: "center" },
  errorBox: { backgroundColor: "#fee2e2", padding: 16, borderRadius: 10 },
  errorText: { color: "#991b1b", fontSize: 13, textAlign: "center" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1e293b" },
  sectionLinkBtn: { flexDirection: "row", alignItems: "center", minHeight: MIN_TOUCH },
  sectionLink: { fontSize: 13, color: "#2563eb", fontWeight: "600" },
  activeCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 18,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  activeCardHighlight: { borderColor: "#3b82f6", borderWidth: 1.5 },
  activeCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillLive: { backgroundColor: "#dcfce7" },
  pillUpcoming: { backgroundColor: "#e0f2fe" },
  statusPillText: { fontSize: 11, fontWeight: "800" },
  pillLiveText: { color: "#15803d" },
  pillUpcomingText: { color: "#0369a1" },
  timeInline: { flexDirection: "row", alignItems: "center", gap: 5 },
  schedTime: { fontSize: 13, fontWeight: "bold", color: "#475569" },
  schedTitle: { fontSize: 18, fontWeight: "bold", color: "#0f172a" },
  schedMeta: { fontSize: 13, color: "#64748b", marginTop: 2, marginBottom: 14 },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  statBox: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 18, fontWeight: "bold", color: "#1e293b" },
  statLabel: { fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: "500" },
  btnOpenSession: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingVertical: 13,
    alignItems: "center",
  },
  btnContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnOpenSessionText: { color: "#ffffff", fontWeight: "bold", fontSize: 15 },
  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  emptyCardText: { color: "#64748b", fontSize: 14, textAlign: "center", marginBottom: 12 },
  btnSmall: {
    backgroundColor: "#eff6ff",
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  btnSmallText: { color: "#2563eb", fontWeight: "700", fontSize: 13 },
});
