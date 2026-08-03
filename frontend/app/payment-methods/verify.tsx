/**
 * Verify a manually-added payment method by entering the two micro-deposit amounts.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { api } from "@/src/api";

export default function VerifyMethod() {
  const router = useRouter();
  const { id, display } = useLocalSearchParams<{ id: string; display: string }>();
  const [phase, setPhase] = useState<"init" | "enter">("init");
  const [msg, setMsg] = useState("");
  const [hint, setHint] = useState("");
  const [a1, setA1] = useState("");
  const [a2, setA2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<any>(`/payment-methods/${id}/verify-init`, { method: "POST" })
      .then((r) => {
        if (r.already_verified) { setMsg("This payment method is already verified."); }
        else { setMsg(r.message); setHint(r.demo_hint || ""); setPhase("enter"); }
      })
      .catch((e) => setErr(e.message || "Could not start verification"));
  }, [id]);

  const submit = async () => {
    setErr(""); setBusy(true);
    try {
      const amounts = [parseFloat(a1), parseFloat(a2)];
      if (amounts.some(isNaN)) { setErr("Enter both amounts"); setBusy(false); return; }
      await api(`/payment-methods/${id}/verify`, { method: "POST", body: { amounts } });
      Alert.alert("✅ Verified!", "This payment method is now ready to send and receive money.");
      router.replace("/payment-methods");
    } catch (e: any) { setErr(e.message || "Verification failed."); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Verify payment method" subtitle={display || undefined}>
      <View style={{ padding: spacing.lg }}>
        <View style={s.hero}>
          <View style={s.badge}><Ionicons name="shield-checkmark" size={22} color={colors.brandPrimary} /></View>
          <Text style={type.h3}>2 tiny deposits</Text>
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: 6 }]}>{msg}</Text>
          {!!hint && (
            <View style={s.hint}>
              <Ionicons name="sparkles" size={14} color={colors.warning} />
              <Text style={{ color: colors.warning, fontFamily: font.textMedium, fontSize: 12, flex: 1 }}>{hint}</Text>
            </View>
          )}
        </View>

        {phase === "enter" && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={input.label}>First deposit amount</Text>
            <TextInput
              testID="amt-1"
              value={a1} onChangeText={setA1}
              keyboardType="decimal-pad"
              placeholder="e.g. 0.24" placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />
            <Text style={[input.label, { marginTop: spacing.md }]}>Second deposit amount</Text>
            <TextInput
              testID="amt-2"
              value={a2} onChangeText={setA2}
              keyboardType="decimal-pad"
              placeholder="e.g. 0.71" placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />

            {err && <Text style={{ color: colors.error, marginTop: spacing.md }} testID="verify-err">{err}</Text>}

            <Pressable
              testID="verify-submit"
              onPress={submit}
              disabled={busy}
              style={[cta.btn, { marginTop: spacing.xl, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>Verify</Text>}
            </Pressable>

            <Pressable
              testID="verify-later"
              onPress={() => router.replace("/payment-methods")}
              style={{ marginTop: spacing.md, paddingVertical: 10 }}
            >
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: font.textMedium, textAlign: "center" }}>
                Do this later
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  badge: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: `${colors.warning}22`, borderRadius: radius.md, padding: 10, marginTop: spacing.md },
});
