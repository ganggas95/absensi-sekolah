import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface Props {
  title: string;
  subtitle?: string;
  eyebrow?: string;
}

export default function TabHeader({ title, subtitle, eyebrow }: Props) {
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: "#1e3a8a",
    paddingTop: 54,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  eyebrow: { color: "#93c5fd", fontSize: 12, fontWeight: "600" },
  title: { color: "#ffffff", fontSize: 20, fontWeight: "bold", marginTop: 2 },
  subtitle: { color: "#bfdbfe", fontSize: 12, marginTop: 4 },
});
