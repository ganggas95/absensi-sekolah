import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { CircleCheck, Link as LinkIcon, Radar, Server, Wifi, X } from "lucide-react-native";
import { useServer } from "../context/ServerContext";
import { iconColors, MIN_TOUCH } from "../theme/colors";
import { detectLocalSubnet } from "../utils/subnet";

export default function ServerSetupScreen({ navigation }: any) {
  const {
    serverUrl,
    scanProgress,
    startScan,
    stopScan,
    setServer,
  } = useServer();

  const [subnetPrefix, setSubnetPrefix] = useState("192.168.8.");
  const [port, setPort] = useState("8000");
  const [manualUrl, setManualUrl] = useState("http://192.168.8.1:8000");
  const [testingManual, setTestingManual] = useState(false);

  useEffect(() => {
    (async () => {
      const detected = await detectLocalSubnet();
      setSubnetPrefix(detected);
      setManualUrl(`http://${detected}1:8000`);
    })();
  }, []);

  const handleStartScan = async () => {
    if (!subnetPrefix.trim()) {
      Alert.alert("Perhatian", "Masukkan prefix subnet (contoh: 192.168.8.)");
      return;
    }
    const portNum = parseInt(port, 10) || 8000;
    const found = await startScan(subnetPrefix.trim(), portNum);
    if (found) {
      Alert.alert(
        "Server Terhubung!",
        `Berhasil menemukan server di:\n${found}`,
        [{ text: "Lanjutkan Login", onPress: () => navigation.replace("Login") }]
      );
    }
  };

  const handleTestManual = async () => {
    if (!manualUrl.trim()) {
      Alert.alert("Perhatian", "Masukkan URL server.");
      return;
    }
    setTestingManual(true);
    try {
      const success = await setServer(manualUrl.trim());
      if (success) {
        Alert.alert(
          "Koneksi Berhasil",
          "Berhasil terhubung ke server intranet.",
          [{ text: "Lanjutkan Login", onPress: () => navigation.replace("Login") }]
        );
      } else {
        Alert.alert(
          "Gagal Terhubung",
          "Server tidak merespons di URL tersebut. Pastikan IP, port, dan koneksi WiFi sudah benar."
        );
      }
    } finally {
      setTestingManual(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.badgeRow}>
            <Wifi size={14} color="#1e40af" />
            <Text style={styles.badge}>INTRANET CLIENT</Text>
          </View>
          <Text style={styles.title}>Koneksi Server</Text>
          <Text style={styles.subtitle}>
            Hubungkan aplikasi mobile dengan server absensi di jaringan intranet sekolah.
          </Text>
        </View>

        {serverUrl && (
          <View style={styles.connectedCard}>
            <View style={styles.iconLabelRow}>
              <CircleCheck size={16} color="#065f46" />
              <Text style={styles.connectedLabel}>Server Aktif Saat Ini:</Text>
            </View>
            <Text style={styles.connectedUrl}>{serverUrl}</Text>
            <TouchableOpacity
              style={styles.btnSecondarySmall}
              onPress={() => navigation.replace("Login")}
            >
              <Text style={styles.btnSecondaryText}>Gunakan Server Ini</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Feature 1: Auto Scan Subnet */}
        <View style={styles.card}>
          <View style={styles.iconLabelRow}>
            <Radar size={18} color={iconColors.primary} />
            <Text style={styles.cardTitle}>1. Pindai Otomatis Subnet</Text>
          </View>
          <Text style={styles.cardHelp}>
            Aplikasi akan menguji IP 1 s/d 254 pada subnet WiFi Anda untuk mencari server absensi.
          </Text>

          <View style={styles.row}>
            <View style={{ flex: 2, marginRight: 8 }}>
              <Text style={styles.inputLabel}>Subnet Prefix</Text>
              <TextInput
                style={styles.input}
                value={subnetPrefix}
                onChangeText={setSubnetPrefix}
                placeholder="192.168.8."
                keyboardType="numeric"
                editable={!scanProgress.isScanning}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>Port</Text>
              <TextInput
                style={styles.input}
                value={port}
                onChangeText={setPort}
                placeholder="8000"
                keyboardType="numeric"
                editable={!scanProgress.isScanning}
              />
            </View>
          </View>

          {scanProgress.isScanning ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressHeader}>
                <ActivityIndicator color="#2563eb" size="small" />
                <Text style={styles.progressText}>
                  Memindai {scanProgress.currentIp}:{port}...
                </Text>
                <Text style={styles.progressPercent}>{scanProgress.percentage}%</Text>
              </View>

              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${scanProgress.percentage}%` },
                  ]}
                />
              </View>

              <TouchableOpacity
                style={styles.btnCancel}
                onPress={stopScan}
              >
                <View style={styles.btnContent}>
                  <X size={16} color="#b91c1c" />
                  <Text style={styles.btnCancelText}>Hentikan Pemindaian</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={handleStartScan}
            >
              <View style={styles.btnContent}>
                <Radar size={18} color={iconColors.white} />
                <Text style={styles.btnPrimaryText}>Mulai Pindai Server</Text>
              </View>
            </TouchableOpacity>
          )}

          {scanProgress.error && !scanProgress.isScanning && (
            <Text style={styles.errorText}>{scanProgress.error}</Text>
          )}
        </View>

        {/* Feature 1 Fallback: Manual Setup */}
        <View style={styles.card}>
          <View style={styles.iconLabelRow}>
            <Server size={18} color={iconColors.primary} />
            <Text style={styles.cardTitle}>2. Atau Masukkan IP Manual</Text>
          </View>
          <Text style={styles.cardHelp}>
            Gunakan opsi ini jika router memblokir ping otomatis antar perangkat.
          </Text>

          <Text style={styles.inputLabel}>URL Server Lengkap</Text>
          <TextInput
            style={styles.input}
            value={manualUrl}
            onChangeText={setManualUrl}
            placeholder="http://192.168.8.50:8000"
            autoCapitalize="none"
            keyboardType="url"
          />

          <TouchableOpacity
            style={styles.btnSecondary}
            onPress={handleTestManual}
            disabled={testingManual}
          >
            {testingManual ? (
              <ActivityIndicator color="#1e3a8a" />
            ) : (
              <View style={styles.btnContent}>
                <LinkIcon size={16} color="#0f172a" />
                <Text style={styles.btnSecondaryText}>Tes & Simpan Koneksi</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  scroll: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 20,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "#dbeafe",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    gap: 6,
  },
  badge: {
    color: "#1e40af",
    fontSize: 12,
    fontWeight: "700",
  },
  iconLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4,
  },
  connectedCard: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  connectedLabel: {
    fontSize: 12,
    color: "#065f46",
    fontWeight: "600",
  },
  connectedUrl: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#047857",
    marginVertical: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#1e293b",
    marginBottom: 4,
  },
  cardHelp: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 14,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#334155",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  btnPrimary: {
    backgroundColor: "#2563eb",
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 6,
  },
  btnPrimaryText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 15,
  },
  btnSecondary: {
    backgroundColor: "#e2e8f0",
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  btnSecondarySmall: {
    backgroundColor: "#10b981",
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 8,
  },
  btnSecondaryText: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 14,
  },
  btnCancel: {
    backgroundColor: "#fee2e2",
    minHeight: MIN_TOUCH,
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 12,
  },
  btnCancelText: {
    color: "#b91c1c",
    fontWeight: "700",
    fontSize: 13,
  },
  progressContainer: {
    marginTop: 6,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: "#334155",
    fontWeight: "500",
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#2563eb",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#2563eb",
  },
  errorText: {
    marginTop: 10,
    color: "#dc2626",
    fontSize: 13,
    textAlign: "center",
  },
});
