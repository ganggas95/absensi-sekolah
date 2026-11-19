import React from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarX, Clock, ScanLine } from "lucide-react-native";
import { api } from "../api/client";
import { iconColors, MIN_TOUCH } from "../theme/colors";
import { ScheduleEvent } from "../types";

export default function ScheduleListScreen({ navigation }: any) {
  const {
    data: schedules,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<ScheduleEvent[]>({
    queryKey: ["daily-schedules"],
    queryFn: () => api.getDailySchedules(),
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.btnBack}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={18} color={iconColors.onDarkMuted} />
          <Text style={styles.btnBackText}>Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Jadwal Mengajar Hari Ini</Text>
        <Text style={styles.subtitle}>
          Pilih salah satu jadwal untuk memulai sesi presensi
        </Text>
      </View>

      {isLoading && !schedules ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Memuat jadwal...</Text>
        </View>
      ) : (
        <FlatList
          data={schedules || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <CalendarX size={40} color={iconColors.slate} style={{ marginBottom: 10 }} />
              <Text style={styles.emptyText}>
                Tidak ada jadwal KBM yang terdaftar untuk hari ini.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.timeRow}>
                  <Clock size={13} color="#0369a1" />
                  <Text style={styles.timeBadgeText}>
                    {item.start_time.slice(0, 5)} - {item.end_time.slice(0, 5)}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDesc}>
                {item.description || "Jadwal Pembelajaran Reguler"}
              </Text>

              <TouchableOpacity
                style={styles.btnStart}
                onPress={() =>
                  navigation.navigate("AttendanceSession", {
                    scheduleId: item.id,
                    scheduleTitle: item.title,
                    rombelName: item.title,
                  })
                }
              >
                <View style={styles.btnContent}>
                  <ScanLine size={18} color={iconColors.white} />
                  <Text style={styles.btnStartText}>Buka Sesi Absensi</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    backgroundColor: "#1e3a8a",
    paddingTop: 54,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  btnBack: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    minHeight: MIN_TOUCH,
    marginBottom: 4,
  },
  btnBackText: {
    color: "#93c5fd",
    fontSize: 14,
    fontWeight: "600",
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#ffffff",
  },
  subtitle: {
    fontSize: 13,
    color: "#bfdbfe",
    marginTop: 4,
  },
  list: {
    padding: 16,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    color: "#64748b",
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  timeBadgeText: {
    color: "#0369a1",
    fontSize: 12,
    fontWeight: "700",
  },
  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#0f172a",
  },
  cardDesc: {
    fontSize: 13,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 14,
  },
  btnStart: {
    backgroundColor: "#2563eb",
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  btnStartText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 14,
  },
  empty: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
  },
});
