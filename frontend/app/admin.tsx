import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LineChart } from "react-native-gifted-charts";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";

type Tab = "overview" | "users" | "keys" | "notify" | "referrals" | "audit";

const PROVIDERS = ["wise", "stripe", "rapyd", "complyadvantage", "refinitiv", "marqeta", "exchange_rate"];

export default function Admin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [founder, setFounder] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setMsg(null);
    try {
      if (tab === "overview") setFounder(await api("/admin/founder"));
      if (tab === "users") setUsers(await api("/admin/users"));
      if (tab === "audit") setLogs(await api("/admin/audit-logs"));
      if (tab === "keys") setKeys(await api("/admin/apikeys"));
    } catch (e: any) { setMsg(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (user?.is_admin) load(); /* eslint-disable-next-line */ }, [tab, user?.is_admin]);

  const bootstrap = async () => {
    setLoading(true); setMsg(null);
    try { await api("/admin/bootstrap", { method: "POST" }); await refresh(); setMsg("You are now an admin."); }
    catch (e: any) { setMsg(e.message); } finally { setLoading(false); }
  };

  if (!user?.is_admin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
        <Header title="Admin" back={() => router.back()} />
        <View style={{ padding: spacing.lg }}>
          <View style={s.card}>
            <Ionicons name="briefcase" size={28} color={colors.brandPrimary} />
            <Text style={[type.h3, { marginTop: spacing.sm }]}>Founder / Admin console</Text>
            <Text style={[type.bodyMuted, { marginTop: 4 }]}>{"You're not an admin yet."}</Text>
            <Pressable testID="bootstrap-admin-btn" onPress={bootstrap} style={[s.cta, { marginTop: spacing.md }]}><Text style={s.ctaText}>Become admin (first user only)</Text></Pressable>
            {msg && <Text style={{ color: msg.toLowerCase().includes("admin") && !msg.toLowerCase().includes("already") ? colors.brandPrimary : colors.error, marginTop: spacing.sm }}>{msg}</Text>}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <Header title="Founder dashboard" back={() => router.back()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 6, paddingVertical: spacing.md }}>
        {(["overview","users","keys","notify","referrals","audit"] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabActive, { flexShrink: 0 }]} testID={`admin-tab-${k}`}>
            <Text style={{ color: tab === k ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontFamily: font.textMedium, fontSize: 12, textTransform: "capitalize" }}>{k === "keys" ? "API keys" : k === "notify" ? "Notify" : k}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.onSurface} />}>
        {tab === "overview" && founder && <Overview d={founder} />}
        {tab === "users" && users.map((u) => <UserRow key={u.id} u={u} onChange={load} />)}
        {tab === "keys" && <ApiKeys keys={keys} onChange={load} />}
        {tab === "notify" && <Notify />}
        {tab === "referrals" && founder && <Referrals count={founder.referrals_count} />}
        {tab === "audit" && logs.map((l) => (
          <View key={l.id} style={s.card}>
            <Text style={[type.body, { fontFamily: font.textBold }]}>{l.action.toUpperCase()}</Text>
            <Text style={type.small}>{new Date(l.created_at).toLocaleString()}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Header({ title, back }: any) {
  return (
    <View style={s.header}>
      <Pressable onPress={back} style={s.back} testID="back-btn"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
      <Text style={type.h3}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );
}

function Overview({ d }: any) {
  const chart = d.series.volume.map((v: number, i: number) => ({ value: v, label: d.series.days[i]?.slice(0, 3) || "" }));
  return (
    <View>
      <View style={{ flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" }}>
        <MetricTile icon="people" color={colors.brandPrimary} label="Total users" value={d.total_users} />
        <MetricTile icon="planet" color={colors.info} label="Countries" value={d.countries_served} />
        <MetricTile icon="cash" color={colors.brandPrimary} label="Volume" value={formatMoney(d.transaction_volume_usd, "USD")} />
        <MetricTile icon="trending-up" color={colors.brandPrimary} label="Revenue" value={formatMoney(d.revenue_usd, "USD")} />
        <MetricTile icon="warning" color={colors.error} label="Fraud alerts" value={d.fraud_alerts} />
        <MetricTile icon="hourglass" color={colors.warning} label="KYC pending" value={d.kyc_pending} />
      </View>
      <Text style={s.section}>Live analytics · 7 days</Text>
      <View style={s.card}>
        <Text style={type.label}>Transaction volume (USD)</Text>
        <LineChart
          data={chart} color={colors.brandPrimary} thickness={2} areaChart
          startFillColor={colors.brandPrimary} endFillColor={colors.surfaceSecondary}
          startOpacity={0.4} endOpacity={0.02}
          yAxisTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }}
          xAxisColor={colors.border} yAxisColor="transparent" rulesColor={colors.border}
          height={140} noOfSections={3} adjustToWidth
        />
      </View>
      <View style={[s.card, { marginTop: spacing.md }]}>
        <Text style={type.label}>New signups per day</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing.sm }}>
          {d.series.days.map((day: string, i: number) => (
            <View key={day + i} style={{ alignItems: "center" }}>
              <Text style={[type.body, { fontFamily: font.textBold }]}>{d.series.signups[i]}</Text>
              <Text style={[type.small, { marginTop: 2 }]}>{day.slice(0, 3)}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function MetricTile({ icon, color, label, value }: any) {
  return (
    <View style={s.metric} testID={`metric-${label}`}>
      <View style={[s.metricIcon, { backgroundColor: color + "22", borderColor: color + "66" }]}><Ionicons name={icon} size={16} color={color} /></View>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.body, { fontFamily: font.textBold, fontSize: 18, marginTop: 2 }]}>{value}</Text>
    </View>
  );
}

function UserRow({ u, onChange }: any) {
  const freeze = async () => { await api(`/admin/users/${u.id}/freeze`, { method: "POST" }); await onChange(); };
  const verify = async () => { await api(`/admin/users/${u.id}/kyc/verified`, { method: "POST" }); await onChange(); };
  const reject = async () => { await api(`/admin/users/${u.id}/kyc/rejected`, { method: "POST" }); await onChange(); };
  return (
    <View style={s.card} testID={`user-${u.id}`}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontFamily: font.textMedium }]}>{u.full_name}</Text>
          <Text style={type.small}>{u.email}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
            <Pill text={u.kyc_status} color={u.kyc_status === "verified" ? colors.brandPrimary : colors.warning} />
            {u.frozen && <Pill text="FROZEN" color={colors.error} />}
            {u.premium_active && <Pill text="PLUS" color={colors.brandPrimary} />}
            {u.is_admin && <Pill text="ADMIN" color={colors.info} />}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 6, marginTop: spacing.sm }}>
        <Pressable style={s.smallBtn} onPress={freeze} testID={`freeze-${u.id}`}><Text style={s.smallBtnTxt}>{u.frozen ? "Unfreeze" : "Freeze"}</Text></Pressable>
        {u.kyc_status !== "verified" && <Pressable style={[s.smallBtn, { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }]} onPress={verify}><Text style={[s.smallBtnTxt, { color: colors.brandPrimary }]}>Verify</Text></Pressable>}
        {u.kyc_status !== "rejected" && <Pressable style={[s.smallBtn, { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.4)" }]} onPress={reject}><Text style={[s.smallBtnTxt, { color: colors.error }]}>Reject</Text></Pressable>}
      </View>
    </View>
  );
}

function ApiKeys({ keys, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [prov, setProv] = useState("wise");
  const [k, setK] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await api("/admin/apikeys", { method: "POST", body: { provider: prov, key: k, enabled: true } }); setOpen(false); setK(""); await onChange(); }
    finally { setBusy(false); }
  };
  const toggle = async (p: string) => { await api(`/admin/apikeys/${p}/toggle`, { method: "POST" }); await onChange(); };
  return (
    <View>
      <Text style={type.bodyMuted}>Bring your own keys. Stored encrypted at rest (Fernet), toggled behind feature flags.</Text>
      {PROVIDERS.map((p) => {
        const row = keys.find((r: any) => r.provider === p);
        return (
          <View key={p} style={s.keyRow} testID={`key-${p}`}>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.textMedium, textTransform: "capitalize" }]}>{p.replace("_", " ")}</Text>
              <Text style={type.small}>{row ? `Set · ****${row.last4} · ${row.enabled ? "enabled" : "disabled"}` : "Not configured"}</Text>
            </View>
            {row && <Pressable onPress={() => toggle(p)} style={s.smallBtn} testID={`toggle-${p}`}><Text style={s.smallBtnTxt}>{row.enabled ? "Disable" : "Enable"}</Text></Pressable>}
            <Pressable onPress={() => { setProv(p); setOpen(true); }} style={[s.smallBtn, { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]} testID={`set-${p}`}>
              <Text style={[s.smallBtnTxt, { color: colors.onBrandPrimary }]}>{row ? "Update" : "Set key"}</Text>
            </Pressable>
          </View>
        );
      })}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.grabber} />
            <Text style={[type.h3, { marginBottom: spacing.md }]}>Set {prov} key</Text>
            <TextInput value={k} onChangeText={setK} placeholder="Paste secret key" secureTextEntry placeholderTextColor={colors.onSurfaceTertiary} style={s.field} />
            <Pressable onPress={save} disabled={busy || !k} style={[s.cta, (busy || !k) && { opacity: 0.5 }]}><Text style={s.ctaText}>Save encrypted</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Notify() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aud, setAud] = useState<"all" | "plus" | "unverified">("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = async () => {
    setBusy(true); setMsg(null);
    try { await api("/admin/announce", { method: "POST", body: { title, body, audience: aud } }); setMsg("Announcement sent."); setTitle(""); setBody(""); }
    catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  };
  return (
    <View>
      <Text style={type.bodyMuted}>Broadcast an in-app announcement. Real push notifications need google-services.json and a real device build.</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.onSurfaceTertiary} style={s.field} />
      <TextInput value={body} onChangeText={setBody} placeholder="Message body" placeholderTextColor={colors.onSurfaceTertiary} multiline style={[s.field, { height: 100, textAlignVertical: "top" }]} />
      <View style={{ flexDirection: "row", gap: 6, marginBottom: spacing.md }}>
        {(["all", "plus", "unverified"] as const).map((a) => (
          <Pressable key={a} onPress={() => setAud(a)} style={[s.audPill, aud === a && s.audPillActive]} testID={`aud-${a}`}>
            <Text style={{ color: aud === a ? colors.onBrandPrimary : colors.onSurface, fontFamily: font.textMedium, fontSize: 12, textTransform: "capitalize" }}>{a}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable onPress={send} disabled={busy || !title || !body} style={[s.cta, (busy || !title || !body) && { opacity: 0.5 }]} testID="notify-send-btn">
        {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={s.ctaText}>Send announcement</Text>}
      </Pressable>
      {msg && <Text style={{ color: colors.brandPrimary, marginTop: spacing.sm }}>{msg}</Text>}
    </View>
  );
}

function Referrals({ count }: any) {
  return (
    <View style={s.card}>
      <Ionicons name="gift" size={22} color={colors.brandPrimary} />
      <Text style={[type.h3, { marginTop: spacing.sm }]}>Referral program</Text>
      <Text style={type.bodyMuted}>Current reward: <Text style={{ color: colors.brandPrimary, fontFamily: font.textBold }}>$5 per invite</Text> · Cashback: 0.5% per transfer</Text>
      <Text style={[type.body, { marginTop: spacing.md }]}>Total successful redemptions: <Text style={{ fontFamily: font.textBold }}>{count}</Text></Text>
      <Text style={[type.small, { marginTop: spacing.sm }]}>Program parameters can be tuned in code (REFERRAL_REWARD_USD, CASHBACK_PCT). Persist to DB for runtime control later.</Text>
    </View>
  );
}

function Pill({ text, color }: any) {
  return <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: color + "22", borderWidth: 1, borderColor: color + "66" }}><Text style={{ color, fontSize: 10, fontFamily: font.textMedium }}>{text?.toUpperCase?.() || text}</Text></View>;
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  tab: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border, height: 36 },
  tabActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  metric: { width: "31%", backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  metricIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, marginBottom: 6 },
  section: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  smallBtnTxt: { fontFamily: font.textMedium, fontSize: 12, color: colors.onSurface },
  keyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  sheet: { backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  field: { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontFamily: font.text, fontSize: 15, marginBottom: spacing.sm },
  audPill: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  audPillActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignItems: "center" },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 15 },
});
