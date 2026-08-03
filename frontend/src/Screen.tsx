import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type, font } from "@/src/theme";

export function Screen({ title, subtitle, children }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[header.wrap, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={header.back} testID="back-btn">
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View>
          <Text style={type.h3}>{title}</Text>
          {subtitle && <Text style={type.small}>{subtitle}</Text>}
        </View>
        <View style={{ width: 40 }} />
      </View>
      {children}
    </View>
  );
}

export function ComingSoonBadge() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandSecondary, alignSelf: "flex-start" }}>
      <Ionicons name="sparkles" size={12} color={colors.brandPrimary} />
      <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 11 }}>DEMO — no real money moves</Text>
    </View>
  );
}

export const cta = StyleSheet.create({
  btn: { backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md, alignItems: "center" },
  txt: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
});

export const input = StyleSheet.create({
  field: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    fontFamily: font.text, fontSize: 15, marginBottom: spacing.sm,
  },
  label: { fontFamily: font.textMedium, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.md, marginBottom: 4 },
});

const header = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
});
