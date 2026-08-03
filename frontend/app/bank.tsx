import { useState } from "react";
import { View, Text, TextInput, ScrollView, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Screen, ComingSoonBadge, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

export default function BankTransfer() {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [acct, setAcct] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const num = parseFloat(amount) || 0;
  const inr = user?.balances?.INR ?? 0;

  const pay = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api("/transfers", {
        method: "POST",
        body: {
          from_currency: "INR", to_currency: "INR", amount: num,
          recipient_name: name.trim(), recipient_country: "India",
          note: `Bank ${acct.slice(-4)} · ${ifsc}`,
        },
      });
      setOk(r); await refresh();
    } catch (e: any) { setErr(e.message || "Failed"); }
    finally { setBusy(false); }
  };

  if (ok) {
    return (
      <Screen title="Bank Transfer" subtitle="NEFT/IMPS · India">
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
          <View style={styles.tick}><Ionicons name="checkmark" size={44} color={colors.brandPrimary} /></View>
          <Text style={[type.h1, { marginTop: spacing.lg }]}>{formatMoney(ok.amount, "INR")} sent</Text>
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: 4 }]}>to {name} · a/c ****{acct.slice(-4)}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Bank Transfer" subtitle="NEFT / IMPS · India">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + 100 }}>
          <ComingSoonBadge />
          <Text style={input.label}>Beneficiary name</Text>
          <TextInput testID="bank-name" value={name} onChangeText={setName} placeholder="As on bank record" placeholderTextColor={colors.onSurfaceTertiary} style={input.field} />
          <Text style={input.label}>Account number</Text>
          <TextInput testID="bank-acct" value={acct} onChangeText={setAcct} placeholder="123456789012" keyboardType="number-pad" placeholderTextColor={colors.onSurfaceTertiary} style={input.field} />
          <Text style={input.label}>IFSC code</Text>
          <TextInput testID="bank-ifsc" value={ifsc} onChangeText={(t) => setIfsc(t.toUpperCase())} placeholder="HDFC0001234" autoCapitalize="characters" placeholderTextColor={colors.onSurfaceTertiary} style={input.field} />
          <Text style={input.label}>Amount (INR)</Text>
          <TextInput testID="bank-amount" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={colors.onSurfaceTertiary} style={[input.field, { fontFamily: font.display, fontSize: 22 }]} />
          <Text style={type.small}>Available: {formatMoney(inr, "INR")}</Text>
          {err && <Text style={{ color: colors.error, marginTop: spacing.sm }} testID="bank-err">{err}</Text>}
        </ScrollView>
        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 14 }]}>
          <Pressable
            testID="bank-pay-btn"
            onPress={pay}
            disabled={busy || !name || acct.length < 6 || ifsc.length < 6 || num <= 0 || num > inr}
            style={[cta.btn, (busy || !name || acct.length < 6 || ifsc.length < 6 || num <= 0 || num > inr) && { opacity: 0.4 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>Send ₹{amount || "0"}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
const styles = StyleSheet.create({
  tick: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandSecondary },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
});
