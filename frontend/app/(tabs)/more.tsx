import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, type, font } from "@/src/theme";

export default function More() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout, refresh } = useAuth();

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh])
  );

  const items = [
    { icon: "wallet-outline", label: "Payment Methods", desc: "Link bank · UPI · card · Withdraw", route: "/payment-methods", tid: "more-payment-methods" },
    { icon: "arrow-down-circle-outline", label: "Withdraw funds", desc: "Cash out to your bank", route: "/withdraw", tid: "more-withdraw" },
    { icon: "people-outline", label: "Recipients", desc: "Favorites · Recent · Save without sending", route: "/recipients", tid: "more-recipients" },
    { icon: "briefcase-outline", label: "Business Hub", desc: "Dashboard · Clients · Bulk pay · Tax", route: "/business", tid: "more-business" },
    { icon: "pulse-outline", label: "Financial Health", desc: "Score · Trends · Finn's advice", route: "/health", tid: "more-health" },
    { icon: "card-outline", label: "Cards", desc: "Virtual cards · Freeze · Reveal", route: "/cards", tid: "more-cards" },
    { icon: "storefront-outline", label: "Cashback marketplace", desc: "10+ brands · Plus doubles rewards", route: "/marketplace", tid: "more-market" },
    { icon: "sparkles-outline", label: "GLOBiN Plus", desc: user?.premium_active ? "Active — thanks!" : "Priority transfers, 50% lower fees", route: "/plus", tid: "more-plus" },
    { icon: "add-circle-outline", label: "Top up wallet", desc: "Add funds via card (Stripe test mode)", route: "/topup", tid: "more-topup" },
    { icon: "stats-chart-outline", label: "Analytics", desc: "Net worth, spending, income", route: "/analytics", tid: "more-analytics" },
    { icon: "document-text-outline", label: "Freelancer Hub", desc: "Invoices & payment links", route: "/invoices", tid: "more-invoices" },
    { icon: "people-outline", label: "Family wallet", desc: "Shared balance & allowances", route: "/family", tid: "more-family" },
    { icon: "receipt-outline", label: "Split bills", desc: "Group payments made easy", route: "/splits", tid: "more-splits" },
    { icon: "gift-outline", label: "Refer & earn", desc: "$5 per friend + 0.5% cashback", route: "/referral", tid: "more-refer" },
    { icon: "finger-print-outline", label: "Biometric PIN", desc: "Face/Touch ID app lock", route: "/pin-setup", tid: "more-pin" },
    { icon: "shield-checkmark-outline", label: "KYC & Identity", desc: user?.kyc_status === "verified" ? "Verified" : "Pending — verify now", route: "/kyc", tid: "more-kyc" },
    ...(user?.is_admin ? [{ icon: "briefcase-outline", label: "Founder / Admin", desc: "Overview · Users · API keys · Notify", route: "/admin", tid: "more-admin" }] : []),
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={type.h2}>More</Text>
        <Text style={type.bodyMuted}>Tools & settings</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={styles.profile} testID="profile-card">
          <View style={styles.avatar}>
            <Text style={{ color: colors.onSurface, fontFamily: font.textBold, fontSize: 18 }}>
              {(user?.full_name || "U").slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontFamily: font.textBold }]}>{user?.full_name}</Text>
            <Text style={type.small}>{user?.email}</Text>
          </View>
          <View style={[styles.statusPill, user?.kyc_status === "verified" ? styles.verified : styles.pending]}>
            <Text style={{ color: user?.kyc_status === "verified" ? colors.brandPrimary : colors.warning, fontFamily: font.textMedium, fontSize: 11 }}>
              {user?.kyc_status?.toUpperCase()}
            </Text>
          </View>
        </View>

        {items.map((it) => (
          <Pressable key={it.tid} testID={it.tid} onPress={() => router.push(it.route as any)} style={styles.row}>
            <View style={styles.rowIcon}><Ionicons name={it.icon as any} size={20} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>{it.label}</Text>
              <Text style={type.small}>{it.desc}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
          </Pressable>
        ))}

        <Pressable testID="logout-btn" onPress={logout} style={[styles.row, { marginTop: spacing.lg, borderColor: colors.borderStrong }]}>
          <View style={[styles.rowIcon, { backgroundColor: "rgba(239,68,68,0.12)" }]}>
            <Ionicons name="log-out-outline" size={20} color={colors.error} />
          </View>
          <Text style={[type.body, { fontFamily: font.textMedium, color: colors.error, flex: 1 }]}>Sign out</Text>
        </Pressable>

        <Text style={[type.small, { textAlign: "center", marginTop: spacing.xl }]}>
          GLOBiN pay · v1.0 · Made with care
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  profile: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandSecondary,
    alignItems: "center", justifyContent: "center",
  },
  statusPill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1 },
  verified: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  pending: { backgroundColor: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.4)" },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  rowIcon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
});
