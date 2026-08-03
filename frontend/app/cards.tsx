import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta } from "@/src/Screen";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

type Card = { id: string; label: string; pan: string; cvv: string; expiry: string; brand: string; status: string; monthly_limit_usd: number };

export default function Cards() {
  const params = useLocalSearchParams<{ travel?: string }>();
  const travel = params?.travel === "1";
  const { user } = useAuth();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { setItems(await api("/cards")); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const issue = async () => {
    setBusy(true); setErr(null);
    try {
      await api("/cards", { method: "POST", body: { label: travel ? "GLOBiN Travel Card" : "GLOBiN Virtual", kind: "virtual" } });
      await load();
    } catch (e: any) { setErr(e.message || "Failed to issue"); }
    finally { setBusy(false); }
  };
  const freeze = async (id: string) => {
    try { await api(`/cards/${id}/freeze`, { method: "POST" }); await load(); } catch {}
  };

  return (
    <Screen title={travel ? "Travel Card" : "Cards"} subtitle={travel ? "Zero-FX abroad · Free Plus perk" : "Virtual cards · Instant issue"}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {loading && <ActivityIndicator color={colors.onSurface} />}
        {!loading && items.length === 0 && (
          <View style={s.emptyWrap} testID="cards-empty">
            <Text style={[type.h2, { textAlign: "center" }]}>{travel ? "Issue a Travel Card" : "No cards yet"}</Text>
            <Text style={[type.bodyMuted, { textAlign: "center", marginTop: spacing.xs, paddingHorizontal: spacing.lg }]}>
              {user?.kyc_status === "verified"
                ? (travel ? "Spend abroad at real market rates. Cashback on travel merchants." : "Get an instant virtual card. Freeze/unfreeze anytime.")
                : "Verify your identity to issue a card."}
            </Text>
          </View>
        )}
        {items.map((c) => (
          <View key={c.id} style={s.cardWrap} testID={`card-${c.id}`}>
            <LinearGradient
              colors={c.status === "frozen"
                ? ["#0f172a", "#1e293b"]
                : travel ? ["#022c22", "#059669", "#10B981"] : ["#111827", "#065f46", "#064e3b"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={s.card}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: "#FAFAFA", fontFamily: font.textMedium, letterSpacing: 1, fontSize: 11 }}>{c.label.toUpperCase()}</Text>
                <Ionicons name="wifi" size={16} color="#FAFAFA" style={{ transform: [{ rotate: "90deg" }] }} />
              </View>
              <Text style={s.pan}>{reveal[c.id] ? c.pan : "•••• •••• •••• " + c.pan.slice(-4)}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md }}>
                <View>
                  <Text style={s.cardLabel}>Cardholder</Text>
                  <Text style={s.cardVal}>{user?.full_name?.toUpperCase() || "GLOBIN USER"}</Text>
                </View>
                <View>
                  <Text style={s.cardLabel}>Expires</Text>
                  <Text style={s.cardVal}>{c.expiry}</Text>
                </View>
                <View>
                  <Text style={s.cardLabel}>CVV</Text>
                  <Text style={s.cardVal}>{reveal[c.id] ? c.cvv : "•••"}</Text>
                </View>
              </View>
              <Text style={{ color: "#FAFAFA", fontFamily: font.display, fontSize: 16, position: "absolute", top: 14, right: 18 }}>VISA</Text>
              {c.status === "frozen" && (
                <View style={s.frozenOverlay}><Ionicons name="snow" size={40} color="#93C5FD" /><Text style={{ color: "#fff", fontFamily: font.textBold, marginTop: 4 }}>FROZEN</Text></View>
              )}
            </LinearGradient>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <Pressable onPress={() => setReveal((r) => ({ ...r, [c.id]: !r[c.id] }))} style={s.iconBtn} testID={`reveal-${c.id}`}>
                <Ionicons name={reveal[c.id] ? "eye-off" : "eye"} size={16} color={colors.onSurface} />
                <Text style={s.iconBtnTxt}>{reveal[c.id] ? "Hide" : "Show"}</Text>
              </Pressable>
              <Pressable onPress={() => freeze(c.id)} style={s.iconBtn} testID={`freeze-${c.id}`}>
                <Ionicons name={c.status === "frozen" ? "flame" : "snow"} size={16} color={colors.onSurface} />
                <Text style={s.iconBtnTxt}>{c.status === "frozen" ? "Unfreeze" : "Freeze"}</Text>
              </Pressable>
              <View style={[s.iconBtn, { flex: 1 }]}>
                <Text style={{ fontFamily: font.text, fontSize: 12, color: colors.onSurfaceSecondary }}>Limit ${c.monthly_limit_usd.toLocaleString()}/mo</Text>
              </View>
            </View>
          </View>
        ))}

        {err && <Text style={{ color: colors.error, marginTop: spacing.sm }} testID="cards-err">{err}</Text>}

        <Pressable onPress={issue} disabled={busy} style={[cta.btn, { marginTop: spacing.lg }, busy && { opacity: 0.5 }]} testID="cards-issue-btn">
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>{items.length === 0 ? "Issue virtual card" : "Add another card"}</Text>}
        </Pressable>

        <View style={s.physical}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontFamily: font.textBold }]}>Physical card</Text>
            <Text style={type.small}>Coming soon — needs KYC + delivery. We&apos;ll notify you.</Text>
          </View>
          <View style={{ paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ color: colors.onSurfaceSecondary, fontFamily: font.textMedium, fontSize: 11 }}>SOON</Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  emptyWrap: { paddingVertical: spacing.xl, alignItems: "center" },
  cardWrap: { marginBottom: spacing.lg },
  card: { borderRadius: 20, padding: spacing.lg, height: 200, overflow: "hidden", justifyContent: "space-between" },
  pan: { color: "#FAFAFA", fontFamily: font.display, fontSize: 22, letterSpacing: 3, marginTop: spacing.lg },
  cardLabel: { color: "rgba(255,255,255,0.6)", fontFamily: font.text, fontSize: 9, letterSpacing: 1 },
  cardVal: { color: "#FAFAFA", fontFamily: font.textMedium, fontSize: 12, marginTop: 2 },
  frozenOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(15,23,42,0.75)", alignItems: "center", justifyContent: "center" },
  iconBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.surfaceSecondary, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  iconBtnTxt: { color: colors.onSurface, fontFamily: font.textMedium, fontSize: 12 },
  physical: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md },
});
