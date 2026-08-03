import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1710438399422-2fca27686bcd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBnbGFzc3klMjBmbHVpZCUyMHRleHR1cmV8ZW58MHx8fHwxNzg1MzI3NzU4fDA&ixlib=rb-4.1.0&q=85";

const PERKS = [
  { icon: "flash", text: "Priority transfers — minutes, not hours" },
  { icon: "cash", text: "50% lower fees on every transfer" },
  { icon: "trending-up", text: "FX rate-lock up to 24h" },
  { icon: "trophy", text: "Higher limits ($100k/mo)" },
  { icon: "card", text: "Virtual cards + travel insurance" },
  { icon: "headset", text: "VIP 24/7 support" },
];

export default function Plus() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startCheckout = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ session_id: string; url: string }>("/stripe/subscribe-plus", { method: "POST", body: {} });
      const returnUrl = Platform.OS === "web" ? (typeof window !== "undefined" ? window.location.origin + "/plus" : "") : Linking.createURL("plus");
      if (Platform.OS === "web" && typeof window !== "undefined") {
        window.location.href = r.url; return;
      }
      const res = await WebBrowser.openAuthSessionAsync(r.url, returnUrl);
      // Poll
      for (let i = 0; i < 25; i++) {
        await new Promise((x) => setTimeout(x, 1500));
        const s = await api<any>(`/stripe/status/${r.session_id}`);
        if (s.credited) { await refresh(); setBusy(false); return; }
      }
      setErr("Payment not confirmed yet. Try refreshing.");
    } catch (e: any) { setErr(e.message || "Upgrade failed"); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} testID="back-btn" style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={type.h3}>GLOBiN Plus</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={styles.hero}>
          <Image source={HERO} style={StyleSheet.absoluteFill as any} contentFit="cover" />
          <LinearGradient colors={["rgba(10,10,10,0.3)", "rgba(2,44,34,0.9)"]} style={StyleSheet.absoluteFill as any} />
          <View style={styles.plusBadge}><Text style={styles.plusBadgeText}>PLUS</Text></View>
          <Text style={styles.heroTitle}>Save more. Send faster.</Text>
          <Text style={styles.price}><Text style={styles.priceBig}>$6.99</Text> / month</Text>
          <Text style={type.bodyMuted}>Cancel anytime · 7-day free trial</Text>
        </View>

        <Text style={styles.section}>What you get</Text>
        {PERKS.map((p) => (
          <View key={p.icon} style={styles.perk} testID={`perk-${p.icon}`}>
            <View style={styles.perkIcon}><Ionicons name={p.icon as any} size={16} color={colors.brandPrimary} /></View>
            <Text style={[type.body, { flex: 1 }]}>{p.text}</Text>
          </View>
        ))}

        {err && <Text style={{ color: colors.error, marginTop: spacing.md }}>{err}</Text>}

        {user?.premium_active ? (
          <View style={styles.activeBox} testID="plus-active">
            <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />
            <Text style={[type.body, { color: colors.brandPrimary, fontFamily: font.textBold }]}>{"You're a Plus member 🎉"}</Text>
          </View>
        ) : (
          <Pressable
            testID="plus-upgrade-btn"
            onPress={startCheckout}
            disabled={busy}
            style={[styles.cta, busy && { opacity: 0.5 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Start free trial</Text>}
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  hero: {
    overflow: "hidden", borderRadius: radius.lg,
    padding: spacing.xl, borderWidth: 1, borderColor: colors.brandSecondary,
    minHeight: 220,
  },
  plusBadge: {
    alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 4,
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
  },
  plusBadgeText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 11, letterSpacing: 1 },
  heroTitle: { fontFamily: font.display, fontSize: 30, color: colors.onSurface, marginTop: spacing.md, letterSpacing: -0.5 },
  price: { fontFamily: font.text, color: colors.onSurface, marginTop: spacing.sm, fontSize: 14 },
  priceBig: { fontFamily: font.display, fontSize: 32, letterSpacing: -0.5 },
  section: { fontFamily: font.textBold, fontSize: 16, color: colors.onSurface, marginTop: spacing.xl, marginBottom: spacing.md },
  perk: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  perkIcon: {
    width: 36, height: 36, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  activeBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandTertiary, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brandSecondary, marginTop: spacing.lg,
  },
  cta: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md,
    alignItems: "center", marginTop: spacing.lg,
  },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
});
