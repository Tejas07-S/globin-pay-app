import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Screen, ComingSoonBadge, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

const OPERATORS = [
  { id: "airtel", name: "Airtel", logo: "📡" },
  { id: "jio",    name: "Jio",    logo: "🔴" },
  { id: "vi",     name: "Vi",     logo: "🟠" },
  { id: "bsnl",   name: "BSNL",   logo: "🟡" },
];

const PLANS = [
  { id: "p1", price: 149,  data: "1 GB/day", days: 20, calls: "Unlimited" },
  { id: "p2", price: 239,  data: "1.5 GB/day", days: 28, calls: "Unlimited" },
  { id: "p3", price: 399,  data: "2.5 GB/day", days: 56, calls: "Unlimited" },
  { id: "p4", price: 719,  data: "2 GB/day", days: 84, calls: "Unlimited" },
  { id: "p5", price: 3599, data: "2.5 GB/day", days: 365, calls: "Unlimited + Netflix" },
];

export default function Recharge() {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [phone, setPhone] = useState("");
  const [op, setOp] = useState(OPERATORS[0].id);
  const [plan, setPlan] = useState<typeof PLANS[number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const inr = user?.balances?.INR ?? 0;

  const pay = async () => {
    if (!plan) return;
    setBusy(true); setErr(null);
    try {
      await api("/transfers", {
        method: "POST",
        body: {
          from_currency: "INR", to_currency: "INR", amount: plan.price,
          recipient_name: `${OPERATORS.find(o => o.id === op)?.name} · ${phone}`,
          recipient_country: "India",
          note: `Mobile recharge ${plan.days} days`,
        },
      });
      setOk(true); await refresh();
    } catch (e: any) { setErr(e.message || "Failed"); }
    finally { setBusy(false); }
  };

  if (ok && plan) {
    return (
      <Screen title="Mobile Recharge">
        <View style={s.success}>
          <View style={s.tick}><Ionicons name="checkmark" size={44} color={colors.brandPrimary} /></View>
          <Text style={[type.h1, { marginTop: spacing.lg }]}>Recharged ✓</Text>
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: 4 }]}>{phone} · ₹{plan.price} · {plan.days} days</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Mobile Recharge" subtitle="Prepaid · India">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }}>
          <ComingSoonBadge />
          <Text style={input.label}>Mobile number</Text>
          <TextInput testID="rec-phone" value={phone} onChangeText={setPhone} placeholder="10-digit number" keyboardType="phone-pad" placeholderTextColor={colors.onSurfaceTertiary} style={input.field} />

          <Text style={input.label}>Operator</Text>
          <View style={s.opRow}>
            {OPERATORS.map((o) => (
              <Pressable key={o.id} onPress={() => setOp(o.id)} style={[s.op, op === o.id && s.opActive]} testID={`rec-op-${o.id}`}>
                <Text style={{ fontSize: 22 }}>{o.logo}</Text>
                <Text style={{ color: op === o.id ? colors.brandPrimary : colors.onSurface, fontFamily: font.textMedium, fontSize: 12, marginTop: 4 }}>{o.name}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={input.label}>Popular plans</Text>
          {PLANS.map((p) => (
            <Pressable key={p.id} onPress={() => setPlan(p)} style={[s.plan, plan?.id === p.id && s.planActive]} testID={`rec-plan-${p.id}`}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontFamily: font.textBold }]}>₹{p.price} · {p.days} days</Text>
                <Text style={type.small}>{p.data} · {p.calls}</Text>
              </View>
              {plan?.id === p.id && <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />}
            </Pressable>
          ))}
          <Text style={type.small}>Available: {formatMoney(inr, "INR")}</Text>
          {err && <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text>}
        </ScrollView>
        <View style={[s.stickyBar, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            testID="rec-pay"
            onPress={pay}
            disabled={busy || phone.length < 10 || !plan || (plan?.price || 0) > inr}
            style={[cta.btn, (busy || phone.length < 10 || !plan || (plan?.price || 0) > inr) && { opacity: 0.4 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>{plan ? `Pay ₹${plan.price}` : "Select a plan"}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  opRow: { flexDirection: "row", gap: spacing.sm },
  op: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  opActive: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
  plan: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  planActive: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  success: { alignItems: "center", justifyContent: "center", flex: 1, padding: spacing.xl },
  tick: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandSecondary },
});
