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
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronRight, Contact, KeyRound, LogOut, Pencil, Phone, UserRound } from "lucide-react-native";
import TabHeader from "../components/TabHeader";
import { useAuth } from "../context/AuthContext";
import { api, extractApiError } from "../api/client";
import { iconColors, MIN_TOUCH } from "../theme/colors";
import { MyProfile } from "../types";

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowValue}>{value || "-"}</Text>
      </View>
    </View>
  );
}

export default function ProfileScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { data, isLoading, isRefetching, refetch, error } = useQuery<MyProfile>({
    queryKey: ["my-profile"],
    queryFn: () => api.getMyProfile(),
  });

  const confirmLogout = () =>
    Alert.alert("Keluar dari akun?", "Anda perlu masuk lagi untuk memakai aplikasi.", [
      { text: "Batal", style: "cancel" },
      { text: "Keluar", style: "destructive", onPress: () => logout() },
    ]);

  const name = data?.full_name || user?.full_name || "Guru";
  const initial = name.trim().charAt(0).toUpperCase() || "G";

  return (
    <View style={styles.container}>
      <TabHeader title="Profil" subtitle="Data akun dan profil guru" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.username}>@{data?.username || user?.username}</Text>
        </View>

        {isLoading && !data ? (
          <ActivityIndicator style={{ marginVertical: 24 }} color="#2563eb" />
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              {extractApiError(error, "Gagal memuat profil. Tarik layar ke bawah untuk mencoba lagi.")}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Akun</Text>
            <View style={styles.card}>
              <Row icon={<UserRound size={18} color={iconColors.primaryDark} />} label="Nama lengkap" value={data?.full_name} />
              <Row icon={<UserRound size={18} color={iconColors.primaryDark} />} label="Username" value={data?.username} />
            </View>

            <Text style={styles.sectionTitle}>Profil Guru</Text>
            <View style={styles.card}>
              <Row icon={<Contact size={18} color={iconColors.primaryDark} />} label="NIP" value={data?.nip} />
              <Row icon={<Phone size={18} color={iconColors.primaryDark} />} label="No. telepon" value={data?.phone} />
              <Row
                icon={<BookOpen size={18} color={iconColors.primaryDark} />}
                label="Mata pelajaran"
                value={data?.subjects?.length ? data.subjects.join(", ") : null}
              />
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Pengaturan</Text>
        <View style={styles.card}>
          <TouchableOpacity
            testID="btn-change-password"
            style={styles.actionRow}
            onPress={() => navigation.navigate("ChangePassword")}
            accessibilityLabel="Ubah password"
          >
            <KeyRound size={18} color={iconColors.primaryDark} />
            <Text style={styles.actionText}>Ubah password</Text>
            <ChevronRight size={18} color={iconColors.slate} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="btn-edit-profile"
            style={styles.actionRow}
            onPress={() => navigation.navigate("EditProfile")}
            accessibilityLabel="Ubah profil guru"
          >
            <Pencil size={18} color={iconColors.primaryDark} />
            <Text style={styles.actionText}>Ubah profil guru</Text>
            <ChevronRight size={18} color={iconColors.slate} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          testID="btn-logout"
          style={styles.btnLogout}
          onPress={confirmLogout}
          accessibilityLabel="Keluar"
        >
          <LogOut size={18} color="#dc2626" />
          <Text style={styles.btnLogoutText}>Keluar</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { padding: 16, paddingBottom: 24 },
  identity: { alignItems: "center", paddingVertical: 8 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 30, fontWeight: "bold", color: "#1e3a8a" },
  name: { fontSize: 18, fontWeight: "bold", color: "#0f172a", marginTop: 10, textAlign: "center" },
  username: { fontSize: 13, color: "#64748b", marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", color: "#475569", marginTop: 18, marginBottom: 8 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowIcon: { width: 28, alignItems: "center" },
  rowLabel: { fontSize: 11, color: "#64748b" },
  rowValue: { fontSize: 14, fontWeight: "600", color: "#0f172a", marginTop: 1 },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: MIN_TOUCH,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  actionText: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0f172a" },
  errorBox: { backgroundColor: "#fee2e2", padding: 14, borderRadius: 10, marginTop: 16 },
  errorText: { color: "#991b1b", fontSize: 13, textAlign: "center" },
  btnLogout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: MIN_TOUCH,
    marginTop: 24,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  btnLogoutText: { color: "#dc2626", fontWeight: "bold", fontSize: 15 },
});
