import React, { useState } from "react";
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
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
import { api, extractApiError } from "../api/client";
import { iconColors, MIN_TOUCH } from "../theme/colors";

const MIN_LENGTH = 6;
const MAX_BYTES = 72;

function Field({
  label,
  value,
  onChangeText,
  show,
  onToggle,
  testID,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  testID: string;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          testID={testID}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          accessibilityLabel={label}
        />
        <TouchableOpacity
          style={styles.eye}
          onPress={onToggle}
          accessibilityLabel={show ? "Sembunyikan password" : "Tampilkan password"}
        >
          {show ? (
            <EyeOff size={18} color={iconColors.muted} />
          ) : (
            <Eye size={18} color={iconColors.muted} />
          )}
        </TouchableOpacity>
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export default function ChangePasswordScreen({ navigation }: any) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => api.changePassword(current, next),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      setConfirm("");
      Alert.alert("Password diubah", "Gunakan password baru saat masuk berikutnya.", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    },
    onError: (err) => setError(extractApiError(err, "Gagal mengubah password.")),
  });

  const validate = (): string => {
    if (!current) return "Password saat ini wajib diisi.";
    if (next.length < MIN_LENGTH) return `Password baru minimal ${MIN_LENGTH} karakter.`;
    if (new TextEncoder().encode(next).length > MAX_BYTES) {
      return "Password baru maksimal 72 karakter.";
    }
    if (next === current) return "Password baru harus berbeda dari password saat ini.";
    if (next !== confirm) return "Konfirmasi password tidak sama dengan password baru.";
    return "";
  };

  const submit = () => {
    const message = validate();
    setError(message);
    if (!message) mutation.mutate();
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
        <Text style={styles.title}>Ubah Password</Text>
        <Text style={styles.subtitle}>Masukkan password saat ini lalu password baru</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Field
            testID="input-current-password"
            label="Password saat ini"
            value={current}
            onChangeText={setCurrent}
            show={showCurrent}
            onToggle={() => setShowCurrent((v) => !v)}
          />
          <Field
            testID="input-new-password"
            label="Password baru"
            value={next}
            onChangeText={setNext}
            show={showNext}
            onToggle={() => setShowNext((v) => !v)}
            hint={`Minimal ${MIN_LENGTH} karakter dan berbeda dari password saat ini.`}
          />
          <Field
            testID="input-confirm-password"
            label="Konfirmasi password baru"
            value={confirm}
            onChangeText={setConfirm}
            show={showConfirm}
            onToggle={() => setShowConfirm((v) => !v)}
          />

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            testID="btn-save-password"
            style={[styles.btnSave, mutation.isPending && styles.btnDisabled]}
            disabled={mutation.isPending}
            onPress={submit}
            accessibilityLabel="Simpan password"
          >
            {mutation.isPending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnSaveText}>Simpan Password</Text>
            )}
          </TouchableOpacity>
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    backgroundColor: "#f8fafc",
  },
  input: { flex: 1, minHeight: MIN_TOUCH, paddingHorizontal: 12, fontSize: 15, color: "#0f172a" },
  eye: { width: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 11, color: "#64748b", marginTop: 4 },
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
