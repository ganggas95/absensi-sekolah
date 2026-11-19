import React from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Trophy, UserX } from "lucide-react-native";
import TabHeader from "../components/TabHeader";
import { useAuth } from "../context/AuthContext";
import { TEACHER_STATS_KEY, useTeacherStats } from "../hooks/useTeacherStats";
import { iconColors } from "../theme/colors";

function formatDate(dateStr?: string) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function HomeScreen() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: stats, isLoading, isRefetching, error } = useTeacherStats();

  return (
    <View style={styles.container}>
      <TabHeader
        eyebrow="Selamat Datang,"
        title={user?.full_name || "Guru"}
        subtitle={formatDate(stats?.today_date)}
      />
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
        {isLoading && !stats ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Memuat data kehadiran...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Gagal memuat statistik. Tarik layar ke bawah untuk mencoba lagi.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <UserX size={18} color={iconColors.danger} />
              <Text style={styles.sectionTitle}>Siswa Sering Tidak Masuk</Text>
            </View>
            <View style={styles.cardList}>
              {stats?.top_absent_students && stats.top_absent_students.length > 0 ? (
                stats.top_absent_students.map((st) => (
                  <View key={st.student_id} style={styles.studentItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{st.full_name}</Text>
                      <Text style={styles.studentMeta}>
                        Kelas: {st.rombel_name} • NISN: {st.nisn || "-"}
                      </Text>
                    </View>
                    <View style={styles.badgeAbsent}>
                      <Text style={styles.badgeAbsentText}>
                        {st.alpa_count > 0
                          ? `${st.alpa_count}x Alpa`
                          : `${st.total_unexcused}x Absen`}
                      </Text>
                      <Text style={styles.badgeSub}>
                        {st.sakit_count} Sakit • {st.izin_count} Izin
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyListText}>
                  Belum ada catatan ketidakhadiran di kelas Anda.
                </Text>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <Trophy size={18} color="#d97706" />
              <Text style={styles.sectionTitle}>Siswa Paling Rajin</Text>
            </View>
            <View style={styles.cardList}>
              {stats?.top_diligent_students &&
              stats.top_diligent_students.length > 0 ? (
                stats.top_diligent_students.map((st, idx) => (
                  <View key={st.student_id} style={styles.studentItem}>
                    <View style={styles.rankCircle}>
                      <Text style={styles.rankNumber}>{idx + 1}</Text>
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.studentName}>{st.full_name}</Text>
                      <Text style={styles.studentMeta}>
                        Kelas: {st.rombel_name} • Hadir: {st.hadir_count}x
                      </Text>
                    </View>
                    <View style={styles.badgeDiligent}>
                      <Text style={styles.badgeDiligentText}>{st.attendance_rate}%</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyListText}>Belum ada data kehadiran siswa.</Text>
              )}
            </View>

            <View style={styles.sectionHeader}>
              <TrendingUp size={18} color={iconColors.success} />
              <Text style={[styles.sectionTitle, { flex: 1 }]}>
                Tingkat Kehadiran per Jadwal & Kelas
              </Text>
            </View>
            <View style={styles.cardList}>
              {stats?.schedule_attendance_rates &&
              stats.schedule_attendance_rates.length > 0 ? (
                stats.schedule_attendance_rates.map((sc) => {
                  const rate = sc.attendance_rate;
                  const isHigh = rate >= 80;
                  const isMid = rate >= 60 && rate < 80;
                  const color = isHigh ? "#16a34a" : isMid ? "#d97706" : "#dc2626";
                  return (
                    <View key={sc.schedule_id} style={styles.scheduleRateItem}>
                      <View style={styles.schedRateHeader}>
                        <Text style={styles.schedRateTitle} numberOfLines={1}>
                          {sc.rombel_name} - {sc.subject_name}
                        </Text>
                        <Text style={[styles.schedRatePercent, { color }]}>{rate}%</Text>
                      </View>
                      <View style={styles.rateBarBg}>
                        <View
                          style={[
                            styles.rateBarFill,
                            {
                              width: `${Math.min(rate, 100)}%`,
                              backgroundColor: isHigh
                                ? "#22c55e"
                                : isMid
                                ? "#f59e0b"
                                : "#ef4444",
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.schedRateSub}>
                        {sc.present_count} dari {sc.total_students} siswa hadir
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.emptyListText}>
                  Belum ada jadwal mengajar yang terdaftar.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { padding: 16, paddingBottom: 24 },
  loadingContainer: { paddingVertical: 60, alignItems: "center" },
  loadingText: { marginTop: 12, color: "#64748b", fontSize: 14 },
  errorBox: { backgroundColor: "#fee2e2", padding: 16, borderRadius: 10 },
  errorText: { color: "#991b1b", fontSize: 13, textAlign: "center" },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 18,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#1e293b", flexShrink: 1 },
  cardList: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  studentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  studentName: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  studentMeta: { fontSize: 12, color: "#64748b", marginTop: 2 },
  badgeAbsent: { alignItems: "flex-end" },
  badgeAbsentText: {
    backgroundColor: "#fee2e2",
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeSub: { fontSize: 10, color: "#94a3b8", marginTop: 2 },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fef3c7",
    alignItems: "center",
    justifyContent: "center",
  },
  rankNumber: { color: "#b45309", fontWeight: "bold", fontSize: 13 },
  badgeDiligent: {
    backgroundColor: "#dcfce7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeDiligentText: { color: "#15803d", fontSize: 13, fontWeight: "800" },
  emptyListText: {
    color: "#94a3b8",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 16,
  },
  scheduleRateItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  schedRateHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  schedRateTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: "#1e293b" },
  schedRatePercent: { fontSize: 14, fontWeight: "800", marginLeft: 8 },
  rateBarBg: {
    height: 6,
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  rateBarFill: { height: "100%", borderRadius: 3 },
  schedRateSub: { fontSize: 11, color: "#64748b" },
});
