import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import {
  Camera,
  CircleCheck,
  CircleX,
  Clock,
  Flashlight,
  FlashlightOff,
  ListChecks,
  Search,
  ShieldAlert,
  Stethoscope,
  TriangleAlert,
  UserCheck,
  FileText,
  X,
} from "lucide-react-native";
import { api } from "../api/client";
import { iconColors, MIN_TOUCH } from "../theme/colors";
import { AttendanceStatus, DailyAttendance, Student } from "../types";

export default function AttendanceSessionScreen({ route, navigation }: any) {
  const { scheduleId, scheduleTitle, rombelName } = route.params || {};

  const [permission, requestPermission] = useCameraPermissions();
  const [activeTab, setActiveTab] = useState<"camera" | "list">("camera");
  const [torch, setTorch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [students, setStudents] = useState<Student[]>([]);
  const [attendances, setAttendances] = useState<Record<string, AttendanceStatus>>({});
  const [loading, setLoading] = useState(true);

  // Scanner state
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanBanner, setScanBanner] = useState<{
    message: string;
    type: "success" | "warning" | "error";
  } | null>(null);

  // Manual status modal
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  const lastScannedTimeRef = useRef<number>(0);

  // Load students for this schedule session
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // 1. Get daily schedules to find the schedule's rombel_id
        const schedules = await api.getDailySchedules();
        const sched = schedules.find((s) => s.id === scheduleId);
        if (sched) {
          const studentList = await api.getStudentsByRombel(sched.rombel_id);
          setStudents(studentList);
        }

        // 2. Load already recorded attendances today
        const logs = await api.getDailyAttendanceLogs();
        const map: Record<string, AttendanceStatus> = {};
        logs.forEach((log) => {
          map[log.student_id] = log.status;
        });
        setAttendances(map);
      } catch (err) {
        console.warn("Failed to load session data:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [scheduleId]);

  // Handle QR code scanning
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    const now = Date.now();
    // 1.5 seconds debounce
    if (now - lastScannedTimeRef.current < 1500 || isProcessing) {
      return;
    }

    lastScannedTimeRef.current = now;
    setIsProcessing(true);

    try {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          data.trim()
        );

      const payload = isUuid
        ? { schedule_event_id: scheduleId, id_siswa: data.trim(), check_in: true }
        : { schedule_event_id: scheduleId, nisn: data.trim(), check_in: true };

      const result: DailyAttendance = await api.recordAttendance(payload);

      // Trigger Haptic feedback
      if (result.already_recorded) {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning
        );
        setScanBanner({
          message: `${result.student_name || "Siswa"} sudah tercatat hadir sebelumnya.`,
          type: "warning",
        });
      } else {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
        const statusLabel =
          result.status === "TERLAMBAT" ? "TERLAMBAT" : "HADIR";
        setScanBanner({
          message: `${result.student_name || "Siswa"} - ${statusLabel}`,
          type: result.status === "TERLAMBAT" ? "warning" : "success",
        });
      }

      // Update local attendance state
      setAttendances((prev) => ({
        ...prev,
        [result.student_id]: result.status,
      }));
    } catch (err: any) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const detail =
        err?.response?.data?.detail || "Gagal mencatat absensi siswa.";
      setScanBanner({
        message: detail,
        type: "error",
      });
    } finally {
      // Clear banner after 3 seconds
      setTimeout(() => {
        setScanBanner(null);
        setIsProcessing(false);
      }, 1500);
    }
  };

  // Manual status change for students without card
  const handleUpdateStatus = async (
    student: Student,
    status: AttendanceStatus
  ) => {
    try {
      await api.recordAttendance({
        schedule_event_id: scheduleId,
        id_siswa: student.id,
        status: status,
        check_in: status === "HADIR" || status === "TERLAMBAT",
      });

      setAttendances((prev) => ({
        ...prev,
        [student.id]: status,
      }));
      setSelectedStudent(null);
    } catch (err: any) {
      Alert.alert(
        "Gagal",
        err?.response?.data?.detail || "Gagal mengubah status absensi."
      );
    }
  };

  // Counters
  const totalStudents = students.length;
  const hadirCount = Object.values(attendances).filter(
    (s) => s === "HADIR"
  ).length;
  const terlambatCount = Object.values(attendances).filter(
    (s) => s === "TERLAMBAT"
  ).length;
  const absenCount = Object.values(attendances).filter((s) =>
    ["IZIN", "SAKIT", "ALPA"].includes(s)
  ).length;
  const belumHadirCount = Math.max(
    0,
    totalStudents - (hadirCount + terlambatCount + absenCount)
  );

  const filteredStudents = students.filter((s) =>
    s.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      {/* Session Top Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerBadge}>SESI ABSENSI AKTIF</Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {scheduleTitle || "Absensi KBM"}
          </Text>
          <Text style={styles.headerSub}>Rombel: {rombelName || "-"}</Text>
        </View>

        <TouchableOpacity
          style={styles.btnClose}
          onPress={() => {
            Alert.alert(
              "Tutup Sesi Absensi?",
              "Hasil absensi telah tersimpan di server.",
              [
                { text: "Batal", style: "cancel" },
                {
                  text: "Selesai",
                  style: "destructive",
                  onPress: () => navigation.goBack(),
                },
              ]
            );
          }}
        >
          <X size={16} color={iconColors.white} />
          <Text style={styles.btnCloseText}>Selesai</Text>
        </TouchableOpacity>
      </View>

      {/* Live summary counters */}
      <View style={styles.summaryBar}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryNum}>{totalStudents}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: "#16a34a" }]}>
            {hadirCount}
          </Text>
          <Text style={styles.summaryLabel}>Hadir</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: "#ea580c" }]}>
            {terlambatCount}
          </Text>
          <Text style={styles.summaryLabel}>Terlambat</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: "#8b5cf6" }]}>
            {absenCount}
          </Text>
          <Text style={styles.summaryLabel}>Izin/S/A</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryNum, { color: "#dc2626" }]}>
            {belumHadirCount}
          </Text>
          <Text style={styles.summaryLabel}>Belum</Text>
        </View>
      </View>

      {/* Mode Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "camera" && styles.tabBtnActive]}
          onPress={() => setActiveTab("camera")}
        >
          <Camera
            size={16}
            color={activeTab === "camera" ? iconColors.white : iconColors.slate}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === "camera" && styles.tabTextActive,
            ]}
          >
            Scanner QR
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === "list" && styles.tabBtnActive]}
          onPress={() => setActiveTab("list")}
        >
          <ListChecks
            size={16}
            color={activeTab === "list" ? iconColors.white : iconColors.slate}
          />
          <Text
            style={[styles.tabText, activeTab === "list" && styles.tabTextActive]}
          >
            Daftar Siswa ({students.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === "camera" ? (
        <View style={styles.cameraContainer}>
          {!permission?.granted ? (
            <View style={styles.permissionBox}>
              <Camera size={40} color={iconColors.slate} style={{ marginBottom: 12 }} />
              <Text style={styles.permissionTitle}>Izin Kamera Diperlukan</Text>
              <Text style={styles.permissionText}>
                Aplikasi memerlukan akses kamera untuk memindai QR code kartu
                pelajar siswa.
              </Text>
              <TouchableOpacity
                style={styles.btnPermission}
                onPress={requestPermission}
              >
                <Text style={styles.btnPermissionText}>Berikan Izin Kamera</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.cameraWrapper}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                enableTorch={torch}
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"],
                }}
                onBarcodeScanned={
                  isProcessing ? undefined : handleBarcodeScanned
                }
              />

              {/* Viewfinder Overlay */}
              <View style={styles.overlay}>
                <View style={styles.targetFrame}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
                <Text style={styles.targetHint}>
                  Arahkan kamera ke QR Code Kartu Pelajar Siswa
                </Text>

                {/* Torch toggle */}
                <TouchableOpacity
                  style={styles.btnTorch}
                  onPress={() => setTorch(!torch)}
                >
                  {torch ? (
                    <Flashlight size={18} color="#fde047" />
                  ) : (
                    <FlashlightOff size={18} color={iconColors.white} />
                  )}
                  <Text style={styles.btnTorchText}>
                    {torch ? "Lampu Nyala" : "Nyalakan Lampu"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Real-time Scan Result Banner */}
              {scanBanner && (
                <View
                  style={[
                    styles.banner,
                    scanBanner.type === "success" && styles.bannerSuccess,
                    scanBanner.type === "warning" && styles.bannerWarning,
                    scanBanner.type === "error" && styles.bannerError,
                  ]}
                >
                  {scanBanner.type === "success" && (
                    <CircleCheck size={22} color={iconColors.white} />
                  )}
                  {scanBanner.type === "warning" && (
                    <TriangleAlert size={22} color={iconColors.white} />
                  )}
                  {scanBanner.type === "error" && (
                    <CircleX size={22} color={iconColors.white} />
                  )}
                  <Text style={styles.bannerText}>{scanBanner.message}</Text>
                </View>
              )}
            </View>
          )}
        </View>
      ) : (
        /* Manual List Mode */
        <View style={styles.listContainer}>
          <View style={styles.searchRow}>
            <Search size={18} color={iconColors.slate} />
            <TextInput
              style={styles.searchField}
              placeholder="Cari nama siswa..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <FlatList
            data={filteredStudents}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item }) => {
              const status = attendances[item.id];
              return (
                <TouchableOpacity
                  style={styles.studentRow}
                  onPress={() => setSelectedStudent(item)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.studentRowName}>{item.full_name}</Text>
                    <Text style={styles.studentRowNisn}>
                      NISN: {item.nisn || "-"}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.statusTag,
                      status === "HADIR" && styles.tagHadir,
                      status === "TERLAMBAT" && styles.tagTerlambat,
                      status === "IZIN" && styles.tagIzin,
                      status === "SAKIT" && styles.tagSakit,
                      status === "ALPA" && styles.tagAlpa,
                      !status && styles.tagBelum,
                    ]}
                  >
                    <Text style={styles.statusTagText}>
                      {status || "BELUM"}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      )}

      {/* Manual Status Selection Modal */}
      <Modal
        visible={Boolean(selectedStudent)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedStudent(null)}
      >
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Ubah Status Kehadiran</Text>
            <Text style={styles.modalSubtitle}>
              {selectedStudent?.full_name}
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#16a34a" }]}
                onPress={() =>
                  selectedStudent && handleUpdateStatus(selectedStudent, "HADIR")
                }
              >
                <UserCheck size={16} color={iconColors.white} />
                <Text style={styles.modalBtnText}>Hadir</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#ea580c" }]}
                onPress={() =>
                  selectedStudent &&
                  handleUpdateStatus(selectedStudent, "TERLAMBAT")
                }
              >
                <Clock size={16} color={iconColors.white} />
                <Text style={styles.modalBtnText}>Terlambat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#0284c7" }]}
                onPress={() =>
                  selectedStudent && handleUpdateStatus(selectedStudent, "IZIN")
                }
              >
                <FileText size={16} color={iconColors.white} />
                <Text style={styles.modalBtnText}>Izin</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#ca8a04" }]}
                onPress={() =>
                  selectedStudent && handleUpdateStatus(selectedStudent, "SAKIT")
                }
              >
                <Stethoscope size={16} color={iconColors.white} />
                <Text style={styles.modalBtnText}>Sakit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: "#dc2626" }]}
                onPress={() =>
                  selectedStudent && handleUpdateStatus(selectedStudent, "ALPA")
                }
              >
                <ShieldAlert size={16} color={iconColors.white} />
                <Text style={styles.modalBtnText}>Alpa</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.modalBtnCancel}
              onPress={() => setSelectedStudent(null)}
            >
              <Text style={styles.modalBtnCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#1e293b",
    paddingTop: 50,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  headerBadge: {
    color: "#38bdf8",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 2,
  },
  headerSub: {
    color: "#94a3b8",
    fontSize: 12,
  },
  btnClose: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: MIN_TOUCH,
    backgroundColor: "#ef4444",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  btnCloseText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 13,
  },
  summaryBar: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
  },
  summaryNum: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#f8fafc",
  },
  summaryLabel: {
    fontSize: 10,
    color: "#94a3b8",
    marginTop: 1,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#334155",
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    minHeight: MIN_TOUCH,
    paddingVertical: 12,
  },
  tabBtnActive: {
    backgroundColor: "#2563eb",
  },
  tabText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },
  tabTextActive: {
    color: "#ffffff",
    fontWeight: "bold",
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000000",
  },
  cameraWrapper: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  targetFrame: {
    width: 250,
    height: 250,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#38bdf8",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  targetHint: {
    color: "#ffffff",
    fontSize: 13,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 24,
    textAlign: "center",
  },
  btnTorch: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: MIN_TOUCH,
    marginTop: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
  },
  btnTorchText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  banner: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  bannerSuccess: {
    backgroundColor: "#16a34a",
  },
  bannerWarning: {
    backgroundColor: "#d97706",
  },
  bannerError: {
    backgroundColor: "#dc2626",
  },
  bannerText: {
    flexShrink: 1,
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
  },
  permissionBox: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 30,
  },
  permissionTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  permissionText: {
    color: "#94a3b8",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  btnPermission: {
    backgroundColor: "#2563eb",
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnPermissionText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 15,
  },
  listContainer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    padding: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 14,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 12,
  },
  searchField: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
  },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    minHeight: MIN_TOUCH,
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  studentRowName: {
    fontSize: 15,
    fontWeight: "bold",
    color: "#1e293b",
  },
  studentRowNisn: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  statusTag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  tagHadir: {
    backgroundColor: "#dcfce7",
  },
  tagTerlambat: {
    backgroundColor: "#ffedd5",
  },
  tagIzin: {
    backgroundColor: "#e0f2fe",
  },
  tagSakit: {
    backgroundColor: "#fef9c3",
  },
  tagAlpa: {
    backgroundColor: "#fee2e2",
  },
  tagBelum: {
    backgroundColor: "#f1f5f9",
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#1e293b",
  },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#0f172a",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
    marginBottom: 16,
  },
  modalButtons: {
    gap: 8,
  },
  modalBtn: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    minHeight: MIN_TOUCH,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalBtnText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 14,
  },
  modalBtnCancel: {
    marginTop: 12,
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingVertical: 12,
    alignItems: "center",
  },
  modalBtnCancelText: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },
});
