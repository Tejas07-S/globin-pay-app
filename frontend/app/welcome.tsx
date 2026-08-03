/**
 * Shown exactly once, right after onboarding completes (navigated to
 * explicitly from onboarding.tsx — never part of the auth/onboarding
 * redirect gate, so it won't reappear on subsequent logins).
 */
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, font } from "@/src/theme";
import { useAuth } from "@/src/auth";

const CHECKS = [
  "Country configured",
  "Wallet created",
  "Payment preferences saved",
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.xl }}>
        <Text style={{ fontSize: 56 }}>🎉</Text>
        <Text style={styles.title}>Welcome to GLOBiN Pay</Text>
        <Text style={styles.subtitle}>
          {user?.full_name ? `${user.full_name.split(" ")[0]}, your` : "Your"} account is ready.
        </Text>

        <View style={styles.checklist}>
          {CHECKS.map((c) => (
            <View key={c} style={styles.checkRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} />
              <Text style={styles.checkTxt}>{c}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
        <Text style={styles.nextLabel}>Next steps</Text>
        <Pressable
          testID="welcome-screen-link-pm"
          onPress={() => router.replace("/payment-methods/add")}
          style={styles.primaryBtn}
        >
          <Ionicons name="business-outline" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.primaryTxt}>Link Payment Method</Text>
        </Pressable>
        <Pressable
          testID="welcome-screen-explore"
          onPress={() => router.replace("/(tabs)/wallet")}
          style={styles.secondaryBtn}
        >
          <Text style={styles.secondaryTxt}>Explore Dashboard</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  title: { fontFamily: font.display, fontSize: 26, color: colors.onSurface, marginTop: spacing.lg, textAlign: "center" },
  subtitle: { fontFamily: font.text, fontSize: 15, color: colors.onSurfaceSecondary, marginTop: spacing.xs, textAlign: "center" },
  checklist: { marginTop: spacing.xl, gap: spacing.sm, alignSelf: "stretch" },
  checkRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  checkTxt: { color: colors.onSurface, fontFamily: font.textMedium, fontSize: 14 },
  nextLabel: { color: colors.onSurfaceTertiary, fontSize: 12, fontFamily: font.textMedium, textTransform: "uppercase", letterSpacing: 0.5 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.brandPrimary, borderRadius: radius.md, paddingVertical: 15,
  },
  primaryTxt: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
  secondaryBtn: {
    alignItems: "center", justifyContent: "center", paddingVertical: 15,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  secondaryTxt: { color: colors.onSurface, fontFamily: font.textMedium, fontSize: 15 },
});
