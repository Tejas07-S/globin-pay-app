import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";

const QUICK = [25, 50, 100, 250, 500];

export default function Topup() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const a = parseFloat(amount);
      if (!a || a <= 0) throw new Error("Enter a valid amount");
      const r = await api<{ session_id: string; url: string }>("/stripe/topup", { method: "POST", body: { amount_usd: a } });
      const ret = Platform.OS === "web"
        ? (typeof window !== "undefined" ? window.location.origin + "/topup" : "")
        : Linking.createURL("topup");
      if (Platform.OS === "web" && typeof window !== "undefined") { window.location.href = r.url; return; }
      const res = await WebBrowser.openAuthSessionAsync(r.url, ret);
      setMsg("Confirming payment…");
      for (let i = 0; i < 25; i++) {
        await new Promise((x) => setTimeout(x, 1500));
        const s = await api<any>(`/stripe/status/${r.session_id}`);
        if (s.credited) { await refresh(); setMsg(`✓ $${a.toFixed(2)} added to your wallet`); setBusy(false); return; }
      }
      setErr("Payment not confirmed yet.");
    } catch (e: any) { setErr(e.message || "Top-up failed"); }
    finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="back-btn"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={type.h3}>Top up wallet</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={styles.card}>
          <Text style={type.label}>Current USD balance</Text>
          <Text style={styles.big}>{formatMoney(user?.balances?.USD || 0, "USD")}</Text>
        </View>

        <Text style={styles.section}>Add funds via card</Text>
        <View style={styles.amountCard}>
          <Text style={type.label}>Amount (USD)</Text>
          <TextInput
            testID="topup-amount"
            value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
            style={styles.input}
          />
        </View>
        <View style={styles.quick}>
          {QUICK.map((q) => (
            <Pressable key={q} onPress={() => setAmount(String(q))} style={[styles.qChip, parseFloat(amount) === q && styles.qChipActive]} testID={`quick-${q}`}>
              <Text style={{ color: parseFloat(amount) === q ? colors.onBrandPrimary : colors.onSurface, fontFamily: font.textMedium }}>${q}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.info}>
          <Ionicons name="lock-closed" size={14} color={colors.brandPrimary} />
          <Text style={[type.small, { flex: 1, color: colors.onSurfaceSecondary }]}>
            Stripe test mode. Use card <Text style={{ color: colors.brandPrimary }}>4242 4242 4242 4242</Text>, any future date & CVC.
          </Text>
        </View>

        {msg && <View style={styles.okBox} testID="topup-success"><Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium }}>{msg}</Text></View>}
        {err && <Text style={{ color: colors.error, marginTop: spacing.sm }} testID="topup-error">{err}</Text>}

        <Pressable
          testID="topup-pay-btn"
          onPress={start}
          disabled={busy}
          style={[styles.cta, busy && { opacity: 0.5 }]}
        >
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Pay ${amount || "0"} with card</Text>}
        </Pressable>
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
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  big: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, marginTop: 4 },
  section: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  amountCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  input: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, padding: 0, marginTop: 4 },
  quick: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  qChip: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  qChipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  info: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brandSecondary, marginTop: spacing.md,
  },
  okBox: {
    backgroundColor: colors.brandTertiary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brandSecondary, marginTop: spacing.md,
  },
  cta: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md,
    alignItems: "center", marginTop: spacing.lg,
  },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
});
