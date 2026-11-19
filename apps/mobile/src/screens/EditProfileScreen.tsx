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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react-native";
import { api, extractApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { iconColors, MIN_TOUCH } from "../theme/colors";
import { MyProfile } from "../types";

function Field({
  label,
  testID,
  value,
  onChangeText,
  maxLength,
  keyboardType,
}: {
  label: string;
  testID: string;
  value: string;
  onChangeText: (value: string) => void;
  maxLength: number;
  keyboardType?: "default" | "phone-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoCapitalize="words"
        autoCorrect={false}
        accessibilityLabel={label}
      />
    </View>
  );
}

export default function EditProfileScreen({ navigation }: any) {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();
  const { data: profile, isLoading, error: loadError } = useQuery<MyProfile>({
    queryKey: ["my-profile"],
    queryFn: () => api.getMyProfile(),
  });
  const [fullName, setFullName] = useState("");
  const [nip, setNip] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name);
      setNip(profile.nip || "");
      setPhone(profile.phone || "");
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: () =>
      api.updateMyProfile({
        full_name: fullName.trim(),
        ...(profile?.teacher_id
          ? { nip: nip.trim() || null, phone: phone.trim() || null }
          : {}),
      }),
    onSuccess: async (updatedProfile) => {
      queryClient.setQueryData(["my-profile"], updatedProfile);
      try {
        await updateUser(updatedProfile);
        Alert.alert("Profil diperbarui", "Data profil berhasil disimpan.", [
          { text: "OK", onPress: () => navigation.goBack() },
        ]);
      } catch {
        setError("Profil tersimpan, tetapi gagal memperbarui data akun di perangkat.");
      }
    },
    onError: (err) => setError(extractApiError(err, "Gagal mengubah profil.")),
  });

  const submit = () => {
    const name = fullName.trim();
    if (name.length < 2) {
      setError("Nama lengkap minimal 2 karakter.");
      return;
    }
    if (nip.trim().length > 30) {
      setError("NIP maksimal 30 karakter.");
      return;
    }
    if (phone.trim().length > 20) {
      setError("Nomor telepon maksimal 20 karakter.");
      return;
    }
    setError("");
    mutation.mutate();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.btnBack}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Kembali"
        >
          <ArrowLeft size={18} color={iconColors.onDarkMuted} />
          <Text style={styles.btnBackText}>Kembali</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Ubah Profil Guru</Text>
        <Text style={styles.subtitle}>Perbarui nama dan informasi kontak Anda</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          {isLoading && !profile ? (
            <ActivityIndicator style={styles.loading} color={iconColors.primary} />
          ) : loadError && !profile ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>
                {extractApiError(loadError, "Gagal memuat profil.")}
              </Text>
            </View>
          ) : profile ? (
            <>
              <Field
                testID="input-profile-full-name"
                label="Nama lengkap"
                value={fullName}
                onChangeText={setFullName}
                maxLength={100}
              />
              {profile.teacher_id ? (
                <>
                  <Field
                    testID="input-profile-nip"
                    label="NIP"
                    value={nip}
                    onChangeText={setNip}
                    maxLength={30}
                  />
                  <Field
                    testID="input-profile-phone"
                    label="No. telepon"
                    value={phone}
                    onChangeText={setPhone}
                    maxLength={20}
                    keyboardType="phone-pad"
                  />
                </>
              ) : (
                <Text style={styles.note}>
                  Profil guru belum terdaftar. Hubungi administrator untuk melengkapi data guru.
                </Text>
              )}
              {error ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              <TouchableOpacity
                testID="btn-save-profile"
                style={[styles.btnSave, mutation.isPending && styles.btnDisabled]}
                disabled={mutation.isPending}
                onPress={submit}
                accessibilityLabel="Simpan profil"
              >
                {mutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnSaveText}>Simpan Profil</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
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
  btnBackText: { color: "#93c5fd", fontSize: 14, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "bold", color: "#ffffff" },
  subtitle: { fontSize: 13, color: "#bfdbfe", marginTop: 4 },
  scroll: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 6 },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    fontSize: 15,
    color: "#0f172a",
  },
  note: { color: "#64748b", fontSize: 13, lineHeight: 19, marginBottom: 16 },
  loading: { marginVertical: 24 },
  errorBox: { backgroundColor: "#fee2e2", padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { color: "#991b1b", fontSize: 13 },
  btnSave: {
    backgroundColor: "#2563eb",
    minHeight: MIN_TOUCH,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  btnDisabled: { opacity: 0.6 },
  btnSaveText: { color: "#ffffff", fontWeight: "bold", fontSize: 15 },
});
