import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Screen, ComingSoonBadge, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

const CATS = [
  { id: "electricity", icon: "flash", label: "Electricity" },
  { id: "water",       icon: "water", label: "Water" },
  { id: "gas",         icon: "flame", label: "Gas" },
  { id: "broadband",   icon: "wifi",  label: "Broadband" },
  { id: "dth",         icon: "tv",    label: "DTH" },
  { id: "insurance",   icon: "shield-checkmark", label: "Insurance" },
];

export default function Bills() {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [cat, setCat] = useState(CATS[0].id);
  const [provider, setProvider] = useState("");
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const num = parseFloat(amount) || 0;
  const inr = user?.balances?.INR ?? 0;

  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/transfers", {
        method: "POST",
        body: {
          from_currency: "INR", to_currency: "INR", amount: num,
          recipient_name: `${provider}`, recipient_country: "India",
          note: `${cat} bill · ${account}`,
        },
      });
      setOk(true); await refresh();
    } catch (e: any) { setErr(e.message || "Failed"); }
    finally { setBusy(false); }
  };

  if (ok) {
    return (
      <Screen title="Bill Payment">
        <View style={s.success}>
          <View style={s.tick}><Ionicons name="checkmark" size={44} color={colors.brandPrimary} /></View>
          <Text style={[type.h1, { marginTop: spacing.lg }]}>Paid ✓</Text>
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: 4 }]}>{provider} · ₹{amount}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Bill Payments" subtitle="Utilities · India">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }}>
          <ComingSoonBadge />
          <Text style={input.label}>Category</Text>
          <View style={s.catGrid}>
            {CATS.map((c) => (
              <Pressable key={c.id} onPress={() => setCat(c.id)} style={[s.catTile, cat === c.id && s.catTileActive]} testID={`bill-cat-${c.id}`}>
                <Ionicons name={c.icon as any} size={20} color={cat === c.id ? colors.brandPrimary : colors.onSurface} />
                <Text style={{ color: colors.onSurface, fontFamily: font.textMedium, fontSize: 12, marginTop: 6 }}>{c.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={input.label}>Provider</Text>
          <TextInput testID="bill-provider" value={provider} onChangeText={setProvider} placeholder="e.g. BESCOM / Airtel Broadband" placeholderTextColor={colors.onSurfaceTertiary} style={input.field} />
          <Text style={input.label}>Consumer / account number</Text>
          <TextInput testID="bill-acct" value={account} onChangeText={setAccount} placeholder="Your billing account ID" placeholderTextColor={colors.onSurfaceTertiary} style={input.field} />
          <Text style={input.label}>Amount (INR)</Text>
          <TextInput testID="bill-amount" value={amount} onChangeText={setAmount} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceTertiary} style={[input.field, { fontFamily: font.display, fontSize: 22 }]} />
          <Text style={type.small}>Available: {formatMoney(inr, "INR")}</Text>
          {err && <Text style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text>}
        </ScrollView>
        <View style={[s.stickyBar, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            testID="bill-pay"
            onPress={pay}
            disabled={busy || !provider || !account || num <= 0 || num > inr}
            style={[cta.btn, (busy || !provider || !account || num <= 0 || num > inr) && { opacity: 0.4 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>Pay ₹{amount || "0"}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  catTile: { width: "31%", alignItems: "center", paddingVertical: 14, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  catTileActive: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  success: { alignItems: "center", justifyContent: "center", flex: 1, padding: spacing.xl },
  tick: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandSecondary },
});
