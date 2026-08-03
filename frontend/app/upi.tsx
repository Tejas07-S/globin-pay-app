import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Screen, ComingSoonBadge, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

const QUICK = ["100", "500", "1000", "2500", "5000"];

export default function UPI() {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [vpa, setVpa] = useState("");
  const [amount, setAmount] = useState("500");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const num = parseFloat(amount) || 0;
  const inr = user?.balances?.INR ?? 0;
  const validVpa = /^[a-z0-9._-]+@[a-z]+$/i.test(vpa.trim());

  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api("/transfers", {
        method: "POST",
        body: {
          from_currency: "INR", to_currency: "INR", amount: num,
          recipient_name: vpa.trim(), recipient_country: "India",
          note: note || `UPI ${vpa}`,
        },
      });
      setOk(r); await refresh();
    } catch (e: any) { setErr(e.message || "Payment failed"); }
    finally { setBusy(false); }
  };

  if (ok) {
    return (
      <Screen title="UPI Payment" subtitle="Instant · IMPS/UPI">
        <View style={styles.successWrap}>
          <View style={styles.tick}><Ionicons name="checkmark" size={44} color={colors.brandPrimary} /></View>
          <Text style={[type.h1, { marginTop: spacing.lg }]}>{formatMoney(ok.amount, "INR")} sent</Text>
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: 4 }]}>to {vpa}</Text>
          <Text style={[type.small, { marginTop: spacing.sm }]}>Txn ID: {ok.id.slice(0, 8).toUpperCase()}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="UPI Payment" subtitle="Instant · IMPS/UPI">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }}>
          <ComingSoonBadge />
          <Text style={input.label}>UPI ID (VPA)</Text>
          <TextInput testID="upi-vpa" value={vpa} onChangeText={setVpa} placeholder="name@bank" placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" style={input.field} />

          <Text style={input.label}>Amount (INR)</Text>
          <View style={styles.amountRow}>
            <Text style={styles.rupee}>₹</Text>
            <TextInput testID="upi-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.amountInput} />
          </View>
          <Text style={type.small}>Available: {formatMoney(inr, "INR")}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginTop: spacing.md }}>
            {QUICK.map((q) => (
              <Pressable key={q} onPress={() => setAmount(q)} style={[styles.chip, amount === q && styles.chipActive]} testID={`upi-q-${q}`}>
                <Text style={{ color: amount === q ? colors.onBrandPrimary : colors.onSurface, fontFamily: font.textMedium }}>₹{q}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={input.label}>Note (optional)</Text>
          <TextInput testID="upi-note" value={note} onChangeText={setNote} placeholder="For rent, dinner…" placeholderTextColor={colors.onSurfaceTertiary} style={input.field} />

          {err && <Text style={{ color: colors.error, marginTop: spacing.sm }} testID="upi-err">{err}</Text>}
        </ScrollView>
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            testID="upi-pay-btn"
            onPress={pay}
            disabled={busy || !validVpa || num <= 0 || num > inr}
            style={[cta.btn, (busy || !validVpa || num <= 0 || num > inr) && { opacity: 0.4 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>Pay ₹{amount}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  rupee: { fontFamily: font.display, fontSize: 32, color: colors.onSurfaceSecondary },
  amountInput: { flex: 1, fontFamily: font.display, fontSize: 32, color: colors.onSurface, paddingVertical: 12 },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  successWrap: { alignItems: "center", justifyContent: "center", flex: 1, padding: spacing.xl },
  tick: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandSecondary },
});
