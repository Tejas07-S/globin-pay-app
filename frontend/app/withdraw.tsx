/**
 * Withdraw wallet balance to a verified payment method (cash-out).
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

type PM = { id: string; nickname?: string; bank_name?: string; display: string; currency: string; verified: boolean; is_default: boolean; flag: string; method_type: string };

export default function Withdraw() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { user, refresh } = useAuth();
  const [methods, setMethods] = useState<PM[]>([]);
  const [pickId, setPickId] = useState<string | undefined>(id);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api<{ methods: PM[] }>("/payment-methods").then((d) => {
      const verified = d.methods.filter((m) => m.verified);
      setMethods(verified);
      if (!pickId && verified.length > 0) {
        setPickId(verified.find((m) => m.is_default)?.id || verified[0].id);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const picked = methods.find((m) => m.id === pickId);
  const balance = picked ? (user?.balances?.[picked.currency] || 0) : 0;

  const submit = async () => {
    if (!picked) { setErr("Choose a payment method"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setErr("Enter a valid amount"); return; }
    if (amt > balance) { setErr(`Only ${balance.toFixed(2)} ${picked.currency} available`); return; }
    setBusy(true); setErr("");
    try {
      await api("/withdrawals", {
        method: "POST",
        body: { payment_method_id: picked.id, amount: amt, currency: picked.currency },
      });
      await refresh();
      Alert.alert(
        "🚀 Withdrawal sent!",
        `${amt.toFixed(2)} ${picked.currency} is on its way to ${picked.nickname || picked.bank_name}. It'll settle within 2 hours.`,
      );
      router.replace("/(tabs)/wallet");
    } catch (e: any) { setErr(e.message || "Withdrawal failed"); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Withdraw funds" subtitle="Cash out to your bank">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {methods.length === 0 && (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>🏦</Text>
            <Text style={[type.h3, { marginTop: spacing.sm }]}>No verified methods yet</Text>
            <Text style={[type.bodyMuted, { textAlign: "center", marginTop: 4 }]}>
              Link and verify at least one payment method to cash out.
            </Text>
            <Pressable testID="wd-add-first" onPress={() => router.push("/payment-methods/add")} style={[cta.btn, { marginTop: spacing.lg, alignSelf: "stretch" }]}>
              <Text style={cta.txt}>+ Add Payment Method</Text>
            </Pressable>
          </View>
        )}

        {methods.length > 0 && (
          <>
            <Text style={input.label}>Send to</Text>
            {methods.map((m) => (
              <Pressable
                key={m.id}
                testID={`wd-pick-${m.id}`}
                onPress={() => setPickId(m.id)}
                style={[s.pmRow, pickId === m.id && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
              >
                <View style={s.badge}><Text style={{ fontSize: 22 }}>{m.method_type === "upi" ? "📱" : "🏦"}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontFamily: font.textBold }]}>{m.nickname || m.bank_name}</Text>
                  <Text style={type.small}>{m.flag} · {m.display} · {m.currency}</Text>
                </View>
                {pickId === m.id && <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />}
              </Pressable>
            ))}

            <View style={s.balCard}>
              <Text style={type.small}>Wallet balance</Text>
              <Text style={[type.h1, { fontSize: 30 }]}>
                {picked?.currency} {balance.toFixed(2)}
              </Text>
            </View>

            <Text style={[input.label, { marginTop: spacing.lg }]}>Amount to withdraw</Text>
            <TextInput
              testID="wd-amount"
              value={amount} onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={[input.field, { fontFamily: font.display, fontSize: 22 }]}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              {[25, 50, 100].map((pct) => (
                <Pressable
                  key={pct}
                  testID={`wd-pct-${pct}`}
                  onPress={() => setAmount((balance * pct / 100).toFixed(2))}
                  style={s.pctChip}
                >
                  <Text style={s.pctTxt}>{pct}%</Text>
                </Pressable>
              ))}
              <Pressable
                testID="wd-max"
                onPress={() => setAmount(balance.toFixed(2))}
                style={[s.pctChip, { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}
              >
                <Text style={[s.pctTxt, { color: colors.onBrandPrimary }]}>MAX</Text>
              </Pressable>
            </View>

            {err && <Text style={{ color: colors.error, marginTop: spacing.md }} testID="wd-err">{err}</Text>}

            <Pressable
              testID="wd-submit"
              onPress={submit}
              disabled={busy}
              style={[cta.btn, { marginTop: spacing.xl, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>Withdraw {amount || "0.00"} {picked?.currency}</Text>}
            </Pressable>

            <Text style={[type.small, { textAlign: "center", marginTop: spacing.md }]}>
              Free withdrawals · Usually arrives within 2 hours
            </Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  empty: { alignItems: "center", padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  pmRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  badge: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  balCard: { marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  pctChip: { borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  pctTxt: { color: colors.onSurface, fontFamily: font.textMedium, fontSize: 12 },
});
