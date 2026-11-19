import React, { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import TabHeader from "../components/TabHeader";
import TeacherAttendanceCard, { TEACHER_TODAY_KEY } from "../components/TeacherAttendanceCard";

export default function AttendanceTabScreen() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: TEACHER_TODAY_KEY });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={styles.container}>
      <TabHeader
        title="Absensi"
        subtitle="Absen datang sebelum masuk kelas dan absen pulang setelah mengajar"
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <TeacherAttendanceCard />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  scroll: { padding: 16, paddingTop: 0, paddingBottom: 24 },
});
