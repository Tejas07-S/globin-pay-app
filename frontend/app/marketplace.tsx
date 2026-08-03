import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta } from "@/src/Screen";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

export default function Marketplace() {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [offers, setOffers] = useState<any[]>([]);
  const [isPlus, setIsPlus] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const r = await api<{ is_plus: boolean; offers: any[] }>("/marketplace/offers");
    setIsPlus(r.is_plus); setOffers(r.offers);
  };
  useEffect(() => { load(); }, []);

  const redeem = async () => {
    if (!selected) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api<any>("/marketplace/redeem", { method: "POST", body: { offer_id: selected.id, amount_usd: parseFloat(amount) || 0 } });
      setMsg(`✓ Redeemed $${r.reward_usd} — code ${r.code}`);
      await refresh(); await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Cashback Marketplace" subtitle="Spend your cashback with your favourite brands">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={s.balance}>
          <Text style={type.label}>Cashback balance</Text>
          <Text style={s.big}>{formatMoney(user?.cashback_usd || 0, "USD")}</Text>
          {!isPlus && (
            <View style={s.plusHint}>
              <Ionicons name="sparkles" size={12} color={colors.brandPrimary} />
              <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 12 }}>Plus doubles every offer — try free</Text>
            </View>
          )}
        </View>

        {offers.map((o) => (
          <Pressable key={o.id} onPress={() => setSelected(o)} style={s.offer} testID={`offer-${o.id}`}>
            <View style={s.logo}><Text style={{ fontSize: 26 }}>{o.logo}</Text></View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[type.body, { fontFamily: font.textBold }]}>{o.merchant}</Text>
                {o.plus_only_extra && (
                  <View style={s.plusBadge}><Text style={{ color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 9 }}>PLUS +{o.plus_bonus_pct}%</Text></View>
                )}
              </View>
              <Text style={type.small}>{o.category} · {o.cta}</Text>
            </View>
            <View style={s.pct}>
              <Text style={{ color: colors.brandPrimary, fontFamily: font.textBold, fontSize: 16 }}>{o.effective_pct}%</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setSelected(null)} />
          <View style={s.sheet}>
            <View style={s.grabber} />
            {selected && (
              <>
                <Text style={[type.h3]}>{selected.merchant}</Text>
                <Text style={type.bodyMuted}>{selected.cta}</Text>
                <Text style={s.field}>Spend amount (USD)</Text>
                <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={s.input} testID="redeem-amount" />
                <Text style={type.small}>Reward: ~${((parseFloat(amount) || 0) * selected.effective_pct / 100).toFixed(2)}</Text>
                {msg && <Text testID="redeem-ok" style={{ color: colors.brandPrimary, marginTop: spacing.sm }}>{msg}</Text>}
                {err && <Text testID="redeem-err" style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text>}
                <Pressable onPress={redeem} disabled={busy} style={[cta.btn, { marginTop: spacing.md }, busy && { opacity: 0.5 }]} testID="redeem-go">
                  {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>Redeem</Text>}
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}
const s = StyleSheet.create({
  balance: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  big: { fontFamily: font.display, fontSize: 34, color: colors.onSurface, letterSpacing: -0.5, marginTop: 4 },
  plusHint: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandTertiary, alignSelf: "flex-start", paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginTop: spacing.sm },
  offer: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  logo: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  plusBadge: { backgroundColor: colors.brandPrimary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill },
  pct: { backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandSecondary },
  sheet: { backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  field: { fontFamily: font.textMedium, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.md, marginBottom: 4 },
  input: { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontFamily: font.display, fontSize: 22 },
});
