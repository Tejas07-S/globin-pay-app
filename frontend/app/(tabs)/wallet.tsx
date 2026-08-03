import { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, RefreshControl, ActivityIndicator, Animated, Easing,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { BrandMark } from "@/src/BrandMark";
import { colors, spacing, radius, type, font, flag, formatMoney } from "@/src/theme";
import type { CountrySchema } from "@/src/CountryForm";

const HERO = "https://images.unsplash.com/photo-1710438399422-2fca27686bcd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBnbGFzc3klMjBmbHVpZCUyMHRleHR1cmV8ZW58MHx8fHwxNzg1MzI3NzU4fDA&ixlib=rb-4.1.0&q=85";

type Mode = "international" | "domestic";

type Insight = {
  id: string; kind: string; icon: string; title: string; body: string; cta: string;
  action: { type: string; from?: string; to?: string };
};

const INTL_ACTIONS = [
  { icon: "wallet", label: "Multi-Currency\nWallet",    route: "/wallet-detail",   tid: "act-wallet" },
  { icon: "paper-plane", label: "Send Abroad",           route: "/send-abroad",     tid: "act-send-abroad" },
  { icon: "swap-horizontal", label: "Currency Exchange", route: "/exchange",        tid: "act-exchange" },
  { icon: "sparkles", label: "AI Exchange\nAdvisor",     route: "/(tabs)/ai",       tid: "act-ai-advisor" },
  { icon: "card", label: "Travel Card",                  route: "/cards?travel=1",  tid: "act-travel-card" },
  { icon: "planet", label: "Global Transfers",           route: "/transfers-history", tid: "act-global" },
];

// Non-country-specific domestic actions. The primary "domestic rail" tile
// (UPI / ACH / SEPA / etc.) is prepended dynamically from the backend's
// country schema — see `domesticTile` below. No country branching here.
const DOM_ACTIONS_STATIC = [
  { icon: "qr-code", label: "QR Scan",        route: "/qr",        tid: "act-qr" },
  { icon: "phone-portrait", label: "Mobile\nRecharge", route: "/recharge", tid: "act-recharge" },
  { icon: "receipt", label: "Bill Payments",  route: "/bills",     tid: "act-bills" },
  { icon: "people", label: "Split Bills",     route: "/splits",    tid: "act-split" },
];

export default function Home() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>("international");
  const [wallet, setWallet] = useState<any>(null);
  const [txs, setTxs] = useState<any[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [pms, setPms] = useState<any[]>([]);
  const [recips, setRecips] = useState<any[]>([]);
  const [onboarding, setOnboarding] = useState<{ first_time: boolean; has_payment_method: boolean; has_recipient: boolean } | null>(null);
  const [domesticSchema, setDomesticSchema] = useState<CountrySchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const slide = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const [w, t, ins, pm, rec, ob] = await Promise.all([
        api<any>("/wallet").catch(() => null),
        api<any[]>("/transfers").catch(() => []),
        api<{ insights: Insight[] }>("/ai/insights").catch(() => ({ insights: [] })),
        api<{ methods: any[] }>("/payment-methods").catch(() => ({ methods: [] })),
        api<{ all: any[]; favorites: any[]; recent: any[] }>("/recipients").catch(() => ({ all: [], favorites: [], recent: [] })),
        api<any>("/onboarding/payment-status").catch(() => null),
      ]);
      setWallet(w); setTxs(t || []); setInsights(ins?.insights || []);
      setPms(pm?.methods || []);
      setRecips(rec?.favorites?.length ? rec.favorites : (rec?.all || []).slice(0, 4));
      setOnboarding(ob);
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Fetch the domestic rail schema for whatever country the user onboarded
  // with — this is the only source of the "Domestic" tile's icon/label/route
  // context; nothing about it is hardcoded here.
  useEffect(() => {
    if (!user?.country) return;
    api<CountrySchema>(`/countries/${user.country}/schema`).then(setDomesticSchema).catch(() => setDomesticSchema(null));
  }, [user?.country]);

  const switchMode = (m: Mode) => {
    setMode(m);
    Animated.timing(slide, { toValue: m === "international" ? 0 : 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  };

  const insightAction = (a: Insight["action"]) => {
    if (a.type === "send") router.push("/send-abroad");
    else if (a.type === "rates") router.push("/(tabs)/rates");
    else if (a.type === "kyc") router.push("/kyc");
    else if (a.type === "plus") router.push("/plus");
    else if (a.type === "marketplace") router.push("/marketplace");
    else if (a.type === "invoices") router.push("/invoices");
    else if (a.type === "alert") router.push("/(tabs)/rates");
  };

  const currencies = wallet ? Object.entries(wallet.balances).filter(([, v]) => (v as number) > 0).sort((a, b) => (b[1] as number) - (a[1] as number)) : [];
  const isZeroBalance = wallet ? Object.values(wallet.balances).every((v) => (v as number) === 0) : false;

  const domesticPrimaryMethod = domesticSchema?.methods.find((m) => m.type === domesticSchema.domestic?.method_type);
  const domesticActions = domesticSchema
    ? [
        {
          icon: (domesticPrimaryMethod?.icon || "business") as any,
          label: domesticSchema.domestic?.label || "Bank Transfer",
          route: "/domestic",
          tid: "act-domestic",
        },
        ...DOM_ACTIONS_STATIC,
      ]
    : DOM_ACTIONS_STATIC;
  const actions = mode === "international" ? INTL_ACTIONS : domesticActions;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); refresh(); }} tintColor={colors.onSurface} />}
      >
        {/* HERO */}
        <View style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}>
          <Image source={HERO} style={StyleSheet.absoluteFill as any} contentFit="cover" />
          <LinearGradient colors={["rgba(10,10,10,0.4)", "rgba(10,10,10,0.9)"]} style={StyleSheet.absoluteFill as any} />

          <View style={styles.topBar}>
            <BrandMark size={20} />
            <Pressable
              testID="kyc-btn"
              onPress={() => router.push("/kyc")}
              style={[styles.kycPill, user?.kyc_status === "verified" && { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }]}
            >
              <Ionicons name={user?.kyc_status === "verified" ? "shield-checkmark" : "shield-outline"} size={14} color={user?.kyc_status === "verified" ? colors.brandPrimary : colors.warning} />
              <Text style={[styles.kycText, user?.kyc_status === "verified" && { color: colors.brandPrimary }]}>
                {user?.kyc_status === "verified" ? "Verified" : "Verify"}
              </Text>
            </Pressable>
          </View>

          <View style={{ marginTop: spacing.xl }}>
            <Text style={type.label}>
              Hi {user?.full_name?.split(" ")[0] || "Friend"}
              {domesticSchema ? ` · ${domesticSchema.flag} ${domesticSchema.name}` : ""} · Total balance (USD)
            </Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: spacing.sm }}>
              <Text testID="total-balance" style={styles.bigNum}>{loading ? "$—" : formatMoney(wallet?.total_usd || 0, "USD")}</Text>
              {user?.premium_active && (
                <View style={styles.plusMini}><Ionicons name="sparkles" size={10} color={colors.onBrandPrimary} /><Text style={{ color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 10 }}>PLUS</Text></View>
              )}
            </View>
            {!loading && isZeroBalance ? (
              <View style={{ marginTop: spacing.xs }}>
                <Text style={[type.bodyMuted, { fontFamily: font.textMedium }]}>Your wallet is ready.</Text>
                <Text style={type.bodyMuted}>Link a payment method to get started.</Text>
              </View>
            ) : (
              <Text style={[type.bodyMuted, { marginTop: spacing.xs }]}>
                {currencies.length} currencies · {user?.kyc_status === "verified" ? "Verified" : "Unverified"} · No hidden fees
              </Text>
            )}
          </View>

          {/* SLIDE TOGGLE */}
          <View style={styles.toggle} testID="mode-toggle">
            <Animated.View style={[
              styles.thumb,
              { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 100] }) as any }] },
            ]} />
            <Pressable style={styles.togglePart} onPress={() => switchMode("international")} testID="toggle-international">
              <Ionicons name="planet" size={14} color={mode === "international" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.toggleText, mode === "international" && styles.toggleTextActive]}>International</Text>
            </Pressable>
            <Pressable style={styles.togglePart} onPress={() => switchMode("domestic")} testID="toggle-domestic">
              <Ionicons name="home" size={14} color={mode === "domestic" ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.toggleText, mode === "domestic" && styles.toggleTextActive]}>Domestic</Text>
            </Pressable>
          </View>
        </View>

        {/* ACTIONS GRID */}
        <View style={styles.grid} testID={`grid-${mode}`}>
          {actions.map((a) => (
            <Pressable key={a.tid} testID={a.tid} onPress={() => router.push(a.route as any)} style={styles.tile}>
              <View style={styles.tileIcon}><Ionicons name={a.icon as any} size={22} color={colors.brandPrimary} /></View>
              <Text style={styles.tileLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* ZERO-BALANCE ONBOARDING ACTIONS */}
        {!loading && isZeroBalance && (
          <View style={styles.welcome} testID="welcome-card">
            <Text style={{ fontSize: 34 }}>👋</Text>
            <Text style={styles.welcomeTitle}>Welcome to GLOBiN pay, {user?.full_name?.split(" ")[0] || "friend"}!</Text>
            <Text style={styles.welcomeBody}>Would you like to…</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
              <Pressable
                testID="welcome-link-pm"
                onPress={() => router.push({ pathname: "/payment-methods/add", params: { welcome: "1" } as any })}
                style={styles.welcomeBtn}
              >
                <Ionicons name="business-outline" size={16} color={colors.onBrandPrimary} />
                <Text style={styles.welcomeBtnTxt}>Link Payment Method</Text>
              </Pressable>
              <Pressable
                testID="welcome-verify-identity"
                onPress={() => router.push("/kyc")}
                style={[styles.welcomeBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brandPrimary }]}
              >
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.brandPrimary} />
                <Text style={[styles.welcomeBtnTxt, { color: colors.brandPrimary }]}>Verify Identity</Text>
              </Pressable>
              <Pressable
                testID="welcome-add-recipient"
                onPress={() => router.push("/recipients/add")}
                style={[styles.welcomeBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brandPrimary }]}
              >
                <Ionicons name="person-add-outline" size={16} color={colors.brandPrimary} />
                <Text style={[styles.welcomeBtnTxt, { color: colors.brandPrimary }]}>Add a Recipient</Text>
              </Pressable>
              <Pressable
                testID="welcome-view-rates"
                onPress={() => router.push("/(tabs)/rates")}
                style={[styles.welcomeBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.brandPrimary }]}
              >
                <Ionicons name="trending-up-outline" size={16} color={colors.brandPrimary} />
                <Text style={[styles.welcomeBtnTxt, { color: colors.brandPrimary }]}>View Live Exchange Rates</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* PAYMENT METHODS SECTION */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }} testID="section-payment-methods">
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Payment Methods</Text>
            <Pressable testID="pm-see-all" onPress={() => router.push("/payment-methods")}>
              <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 13 }}>
                {pms.length > 0 ? "See all →" : "+ Add"}
              </Text>
            </Pressable>
          </View>
          {pms.length === 0 && !onboarding?.first_time && (
            <Pressable
              testID="pm-add-cta"
              onPress={() => router.push("/payment-methods/add")}
              style={styles.emptyRow}
            >
              <View style={styles.emptyIcon}><Ionicons name="add" size={20} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontFamily: font.textMedium }]}>Link a payment method</Text>
                <Text style={type.small}>Top up and cash out anytime</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: spacing.sm, gap: spacing.md }}>
            {pms.map((m: any) => (
              <Pressable
                key={m.id}
                testID={`home-pm-${m.id}`}
                onPress={() => router.push("/payment-methods")}
                style={styles.pmCard}
              >
                <Text style={{ fontSize: 24 }}>{m.method_type === "upi" ? "📱" : m.method_type === "card" ? "💳" : "🏦"}</Text>
                <Text style={styles.pmCardTitle} numberOfLines={1}>{m.nickname || m.bank_name || `${m.country} Bank`}</Text>
                <Text style={styles.pmCardSub}>{m.display}</Text>
                <View style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
                  {m.is_default && <View style={styles.tag}><Text style={styles.tagTxt}>DEFAULT</Text></View>}
                  {m.verified ? <View style={styles.tagOk}><Text style={styles.tagOkTxt}>✓ VERIFIED</Text></View>
                              : <View style={styles.tagWarn}><Text style={styles.tagWarnTxt}>PENDING</Text></View>}
                </View>
              </Pressable>
            ))}
            {pms.length > 0 && (
              <Pressable testID="pm-add-inline" onPress={() => router.push("/payment-methods/add")} style={styles.pmAddCard}>
                <Ionicons name="add" size={24} color={colors.brandPrimary} />
                <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, marginTop: 4, fontSize: 12 }}>Add method</Text>
              </Pressable>
            )}
          </ScrollView>
          {pms.some((m: any) => m.verified) && (
            <Pressable testID="withdraw-cta" onPress={() => router.push("/withdraw")} style={styles.withdrawBar}>
              <Ionicons name="arrow-down-circle" size={18} color={colors.brandPrimary} />
              <Text style={{ flex: 1, color: colors.brandPrimary, fontFamily: font.textMedium }}>Withdraw wallet balance</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.brandPrimary} />
            </Pressable>
          )}
        </View>

        {/* RECIPIENTS SECTION */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }} testID="section-recipients">
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>Recipients</Text>
            <Pressable testID="rec-see-all" onPress={() => router.push("/recipients")}>
              <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 13 }}>
                {recips.length > 0 ? "See all →" : "+ Add"}
              </Text>
            </Pressable>
          </View>
          {recips.length === 0 && !onboarding?.first_time && (
            <Pressable
              testID="rec-add-cta"
              onPress={() => router.push("/recipients/add")}
              style={styles.emptyRow}
            >
              <View style={styles.emptyIcon}><Ionicons name="person-add" size={18} color={colors.brandPrimary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontFamily: font.textMedium }]}>Save people you send money to</Text>
                <Text style={type.small}>Auto-fills bank details next time</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: spacing.sm, gap: spacing.md }}>
            {recips.map((r: any) => (
              <Pressable
                key={r.id}
                testID={`home-rec-${r.id}`}
                onPress={() => router.push({ pathname: "/send-abroad", params: { rid: r.id, name: r.name, country: r.country } as any })}
                style={styles.recCard}
              >
                <View style={styles.recAvatar}>
                  <Text style={{ color: colors.onSurface, fontFamily: font.textBold, fontSize: 16 }}>{r.name.slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text style={styles.pmCardTitle} numberOfLines={1}>{r.name}</Text>
                <Text style={styles.pmCardSub}>{r.flag || flag[r.currency] || "🌐"} {r.country}</Text>
              </Pressable>
            ))}
            {recips.length > 0 && (
              <Pressable testID="rec-add-inline" onPress={() => router.push("/recipients/add")} style={styles.pmAddCard}>
                <Ionicons name="person-add" size={22} color={colors.brandPrimary} />
                <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, marginTop: 4, fontSize: 12 }}>Add recipient</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>

        {/* FINN INSIGHTS */}
        {insights.length > 0 && (
          <View style={{ marginTop: spacing.md }}>
            <View style={styles.finnHeader}>
              <View style={styles.finnBadge}><Ionicons name="sparkles" size={14} color={colors.brandPrimary} /></View>
              <Text style={styles.sectionTitle}>Finn suggests</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingVertical: spacing.sm }}>
              {insights.map((ins) => (
                <Pressable key={ins.id} onPress={() => insightAction(ins.action)} style={[styles.insightCard, { borderColor: kindColor(ins.kind) + "55" }]} testID={`insight-${ins.id}`}>
                  <View style={[styles.insightIcon, { backgroundColor: kindColor(ins.kind) + "22", borderColor: kindColor(ins.kind) + "66" }]}>
                    <Ionicons name={ins.icon as any} size={16} color={kindColor(ins.kind)} />
                  </View>
                  <Text style={styles.insightTitle}>{ins.title}</Text>
                  <Text style={styles.insightBody}>{ins.body}</Text>
                  <View style={styles.insightCta}>
                    <Text style={{ color: kindColor(ins.kind), fontFamily: font.textMedium, fontSize: 12 }}>{ins.cta}</Text>
                    <Ionicons name="arrow-forward" size={12} color={kindColor(ins.kind)} />
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* CURRENCY STRIP */}
        {mode === "international" && (
          <>
            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
              <Text style={styles.sectionTitle}>Your currencies</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md }}>
              {loading && <ActivityIndicator color={colors.onSurface} />}
              {currencies.map(([cur, amt]) => (
                <View key={cur} style={styles.curCard} testID={`cur-card-${cur}`}>
                  <Text style={{ fontSize: 22 }}>{flag[cur] || "🌐"}</Text>
                  <Text style={[type.label, { color: colors.onSurface, marginTop: spacing.sm }]}>{cur}</Text>
                  <Text style={[type.number, { fontSize: 18, marginTop: spacing.xs }]}>{formatMoney(amt as number, cur)}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* RECENT ACTIVITY */}
        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
          <Text style={styles.sectionTitle}>Recent activity</Text>
          {txs.length === 0 ? (
            <View style={styles.empty} testID="empty-activity">
              <Ionicons name="receipt-outline" size={28} color={colors.onSurfaceTertiary} />
              <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>No transfers yet. Tap Send Abroad to try.</Text>
            </View>
          ) : (
            txs.slice(0, 6).map((t) => (
              <Pressable key={t.id} onPress={() => router.push({ pathname: "/transaction/[id]", params: { id: t.id } as any })} style={styles.txRow} testID={`tx-${t.id}`}>
                <View style={styles.txIcon}><Ionicons name="paper-plane" size={16} color={colors.brandPrimary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontFamily: font.textMedium }]}>{t.recipient_name}</Text>
                  <Text style={type.small}>{t.recipient_country} · {new Date(t.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[type.body, { fontFamily: font.textMedium }]}>-{formatMoney(t.amount, t.from_currency)}</Text>
                  <Text style={[type.small, { color: colors.success }]}>Completed</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function kindColor(k: string) {
  switch (k) {
    case "opportunity": return colors.brandPrimary;
    case "wait":        return colors.warning;
    case "reward":      return colors.info;
    case "upsell":      return colors.brandPrimary;
    case "action":      return colors.warning;
    default:            return colors.onSurfaceSecondary;
  }
}

const styles = StyleSheet.create({
  hero: {
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, overflow: "hidden",
    borderBottomLeftRadius: 28, borderBottomRightRadius: 28,
  },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kycPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    backgroundColor: "rgba(245,158,11,0.12)", borderRadius: radius.pill,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.4)",
  },
  kycText: { fontFamily: font.textMedium, color: colors.warning, fontSize: 12 },
  bigNum: { fontFamily: font.display, fontSize: 40, color: colors.onSurface, letterSpacing: -1 },
  plusMini: {
    flexDirection: "row", alignItems: "center", gap: 3,
    backgroundColor: colors.brandPrimary, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: radius.pill,
  },
  toggle: {
    marginTop: spacing.lg, alignSelf: "center", flexDirection: "row",
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.pill, padding: 4,
    borderWidth: 1, borderColor: colors.border, position: "relative",
  },
  thumb: {
    position: "absolute", top: 4, left: 4, width: 100, height: 34,
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
  },
  togglePart: { flexDirection: "row", alignItems: "center", gap: 6, width: 100, height: 34, justifyContent: "center" },
  toggleText: { color: colors.onSurfaceSecondary, fontFamily: font.textMedium, fontSize: 12 },
  toggleTextActive: { color: colors.onBrandPrimary },
  grid: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.md,
    paddingHorizontal: spacing.lg, marginTop: spacing.lg,
  },
  tile: {
    width: "30.7%", aspectRatio: 1,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center", padding: spacing.sm,
  },
  tileIcon: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    borderWidth: 1, borderColor: colors.brandSecondary,
    alignItems: "center", justifyContent: "center",
  },
  tileLabel: { fontFamily: font.textMedium, color: colors.onSurface, fontSize: 12, textAlign: "center", marginTop: spacing.sm },
  finnHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  finnBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandSecondary },
  sectionTitle: { fontFamily: font.textBold, fontSize: 16, color: colors.onSurface },
  insightCard: {
    width: 270, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, padding: spacing.md, gap: 6,
  },
  insightIcon: {
    width: 30, height: 30, borderRadius: 8, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  insightTitle: { fontFamily: font.textBold, color: colors.onSurface, fontSize: 14 },
  insightBody: { fontFamily: font.text, color: colors.onSurfaceSecondary, fontSize: 12, lineHeight: 16 },
  insightCta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  curCard: { width: 130, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  empty: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.xl, alignItems: "center", marginTop: spacing.sm },
  txRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, marginTop: spacing.sm,
  },
  txIcon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },

  // New: Payment Methods + Recipients home sections
  welcome: { marginHorizontal: spacing.lg, marginTop: spacing.lg, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.brandSecondary, alignItems: "flex-start" },
  welcomeTitle: { fontFamily: font.textBold, fontSize: 18, color: colors.onSurface, marginTop: 4 },
  welcomeBody: { fontFamily: font.text, color: colors.onSurfaceSecondary, marginTop: 2 },
  welcomeBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 999 },
  welcomeBtnTxt: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 13 },

  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  emptyIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandSecondary },

  pmCard: { width: 150, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: 2 },
  pmCardTitle: { fontFamily: font.textBold, color: colors.onSurface, fontSize: 13, marginTop: 6 },
  pmCardSub: { fontFamily: font.text, color: colors.onSurfaceSecondary, fontSize: 11 },
  pmAddCard: { width: 110, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.brandSecondary, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },

  tag: { backgroundColor: colors.brandPrimary, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  tagTxt: { fontFamily: font.textBold, fontSize: 9, color: colors.onBrandPrimary },
  tagOk: { backgroundColor: colors.brandTertiary, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: colors.brandSecondary },
  tagOkTxt: { fontFamily: font.textBold, fontSize: 9, color: colors.brandPrimary },
  tagWarn: { backgroundColor: "rgba(245,158,11,0.15)", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  tagWarnTxt: { fontFamily: font.textBold, fontSize: 9, color: colors.warning },

  withdrawBar: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.brandSecondary, marginTop: spacing.sm },
  recCard: { width: 100, alignItems: "center", backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  recAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center", marginBottom: 4 },
});
