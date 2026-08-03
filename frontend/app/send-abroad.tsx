import { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, flag as flagMap, formatMoney } from "@/src/theme";

type Country = { code: string; name: string; flag: string; currency: string; methods: string[]; eta: string };

const STEPS = ["Country", "Amount", "Rate", "Preview", "Done"] as const;

export default function SendAbroad() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState<Country | null>(null);
  const [from, setFrom] = useState("USD");
  const [amount, setAmount] = useState("500");
  const [recipient, setRecipient] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [timing, setTiming] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const num = useMemo(() => parseFloat(amount) || 0, [amount]);
  const available = user?.balances?.[from] ?? 0;
  const toCurrency = country?.currency || "USD";
  const [fraud, setFraud] = useState<any>(null);

  // Load countries on step 1
  useEffect(() => { api<Country[]>(`/countries${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(setCountries).catch(() => {}); }, [q]);

  // Load quote + timing when entering step 3
  useEffect(() => {
    if (step !== 2 || !country || num <= 0) return;
    setBusy(true);
    Promise.all([
      api(`/fee/quote?from_currency=${from}&to_currency=${toCurrency}&amount=${num}`),
      api("/ai/timing", { method: "POST", body: { from_currency: from, to_currency: toCurrency, amount: num } }),
    ]).then(([q, t]) => { setQuote(q); setTiming(t); }).catch((e) => setErr(e.message))
      .finally(() => setBusy(false));
  }, [step, country, from, num, toCurrency]);

  // Run fraud check when entering step 4
  useEffect(() => {
    if (step !== 3 || !country) return;
    api("/ai/fraud-check", {
      method: "POST",
      body: { recipient_name: recipient.trim(), recipient_country: country.name, amount_usd: num },
    }).then(setFraud).catch(() => setFraud(null));
  }, [step, country, num, recipient]);

  const send = async () => {
    if (!country) return;
    setBusy(true); setErr(null);
    try {
      const r = await api("/transfers", {
        method: "POST",
        body: {
          from_currency: from, to_currency: toCurrency, amount: num,
          recipient_name: recipient.trim(), recipient_country: country.name,
        },
      });
      setResult(r); await refresh(); setStep(4);
    } catch (e: any) { setErr(e.message || "Transfer failed"); }
    finally { setBusy(false); }
  };

  const canNext =
    (step === 0 && !!country) ||
    (step === 1 && num > 0 && num <= available && recipient.trim().length > 0) ||
    (step === 2 && !!quote) ||
    (step === 3 && (!fraud || fraud.decision !== "block"));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => (step === 0 || step === 4 ? router.back() : setStep(step - 1))}
          style={styles.back} testID="back-btn"
        >
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={type.h3}>Send abroad</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stepper */}
      {step < 4 && (
        <View style={styles.stepper} testID="stepper">
          {STEPS.slice(0, 4).map((label, i) => (
            <View key={label} style={{ flex: 1, alignItems: "center" }}>
              <View style={[styles.dot, i <= step && styles.dotActive]}>
                {i < step ? <Ionicons name="checkmark" size={12} color={colors.onBrandPrimary} /> :
                  <Text style={{ color: i === step ? colors.onBrandPrimary : colors.onSurfaceTertiary, fontFamily: font.textBold, fontSize: 11 }}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, i === step && { color: colors.onSurface }]}>{label}</Text>
              {i < 3 && <View style={[styles.rail, { left: "60%", right: "-40%", top: 11 }, i < step && { backgroundColor: colors.brandPrimary }]} />}
            </View>
          ))}
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        {/* STEP 1: Country */}
        {step === 0 && (
          <View style={{ flex: 1, paddingHorizontal: spacing.lg }}>
            <Text style={[type.h2, { marginTop: spacing.md }]}>Where to?</Text>
            <Text style={[type.bodyMuted, { marginBottom: spacing.md }]}>Choose your recipient&apos;s country.</Text>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} />
              <TextInput
                testID="country-search"
                value={q} onChangeText={setQ}
                placeholder="Search country or currency"
                placeholderTextColor={colors.onSurfaceTertiary}
                style={styles.searchInput}
              />
            </View>
            <FlatList
              data={countries}
              keyExtractor={(c) => c.code}
              contentContainerStyle={{ paddingBottom: 120, paddingTop: spacing.sm }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => setCountry(item)}
                  style={[styles.countryRow, country?.code === item.code && styles.countryRowActive]}
                  testID={`country-${item.code}`}
                >
                  <Text style={{ fontSize: 22 }}>{item.flag}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { fontFamily: font.textMedium }]}>{item.name}</Text>
                    <Text style={type.small}>{item.currency} · {item.methods[0]} · {item.eta}</Text>
                  </View>
                  {country?.code === item.code && <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />}
                </Pressable>
              )}
            />
          </View>
        )}

        {/* STEP 2: Amount */}
        {step === 1 && country && (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
            <Text style={[type.h2]}>How much?</Text>
            <Text style={[type.bodyMuted, { marginBottom: spacing.md }]}>Sending to {country.flag} {country.name}.</Text>

            <View style={styles.card}>
              <Text style={type.label}>You send</Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
                <TextInput
                  testID="amount-input"
                  value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
                  style={styles.amountInput}
                />
                <CurrencyPicker value={from} onChange={setFrom} testID="from-currency" />
              </View>
              <Text style={type.small}>Available: {formatMoney(available, from)}</Text>
              {num > available && <Text style={{ color: colors.error, marginTop: 4, fontSize: 12 }}>Insufficient funds</Text>}
            </View>

            <Text style={styles.section}>Recipient</Text>
            <TextInput
              testID="recipient-input"
              value={recipient} onChangeText={setRecipient}
              placeholder="Full name" placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
            />
            <Text style={type.small}>Delivered to {country.flag} {country.name} via {country.methods.slice(0, 2).join(" · ")}</Text>
          </ScrollView>
        )}

        {/* STEP 3: AI shows best rate */}
        {step === 2 && country && (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }}>
            <View style={styles.finnCard} testID="finn-timing">
              <View style={styles.finnBadge}><Ionicons name="sparkles" size={16} color={colors.brandPrimary} /></View>
              <Text style={[type.label, { color: colors.brandPrimary }]}>Finn says</Text>
              {busy || !timing ? <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.brandPrimary} /> : (
                <>
                  <Text style={[type.h2, { marginTop: 6, fontSize: 22, letterSpacing: -0.3 }]}>{timing.headline}</Text>
                  <View style={styles.timingRow}>
                    <TimingCell label="Today" value={timing.today_rate?.toFixed(4)} />
                    <TimingCell label="Forecast peak" value={timing.best_rate?.toFixed(4)} />
                    <TimingCell label="Confidence" value={`${timing.confidence}%`} />
                  </View>
                  <View style={[styles.badge, timing.verdict === "send_now" ? styles.badgeGreen : styles.badgeAmber]}>
                    <Ionicons name={timing.verdict === "send_now" ? "flash" : "time"} size={12} color={timing.verdict === "send_now" ? colors.brandPrimary : colors.warning} />
                    <Text style={{ color: timing.verdict === "send_now" ? colors.brandPrimary : colors.warning, fontFamily: font.textMedium, fontSize: 12 }}>
                      {timing.verdict === "send_now" ? "SEND NOW" : "WAIT — better rate coming"}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {quote && (
              <View style={styles.card}>
                <Text style={styles.section}>Smart fee breakdown</Text>
                <FeeRow label="Amount sent" value={formatMoney(quote.amount_sent, from)} />
                <FeeRow label="Exchange rate" value={String(quote.exchange_rate)} />
                <FeeRow label="Transfer fee" value={formatMoney(quote.transfer_fee, from)} />
                <FeeRow label="Taxes" value="$0.00" />
                <FeeRow label="Hidden fees" value="$0.00" muted />
                <View style={styles.divider} />
                <FeeRow label="Recipient gets" value={formatMoney(quote.receiving_amount, toCurrency)} bold />
                <FeeRow label="ETA" value={country.eta} />
                <View style={styles.saving}>
                  <Ionicons name="sparkles" size={12} color={colors.brandPrimary} />
                  <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 12 }}>
                    You save {formatMoney(quote.savings_vs_paypal, from)} vs PayPal
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* STEP 4: Preview */}
        {step === 3 && country && quote && (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }}>
            <Text style={[type.h2]}>Review & confirm</Text>
            <Text style={[type.bodyMuted, { marginBottom: spacing.md }]}>Finn just ran a fraud & AML check.</Text>

            {fraud && (
              <View style={[styles.fraudCard, { borderColor: fraud.decision === "block" ? colors.error : fraud.decision === "review" ? colors.warning : colors.brandSecondary }]} testID="fraud-card">
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={[styles.fraudBadge, { backgroundColor: (fraud.decision === "block" ? colors.error : fraud.decision === "review" ? colors.warning : colors.brandPrimary) + "22", borderColor: (fraud.decision === "block" ? colors.error : fraud.decision === "review" ? colors.warning : colors.brandPrimary) + "66" }]}>
                      <Ionicons name={fraud.decision === "proceed" ? "shield-checkmark" : fraud.decision === "review" ? "alert-circle" : "close-circle"} size={16} color={fraud.decision === "block" ? colors.error : fraud.decision === "review" ? colors.warning : colors.brandPrimary} />
                    </View>
                    <Text style={[type.label, { color: colors.brandPrimary }]}>Finn&apos;s fraud check</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: colors.onSurface, fontFamily: font.display, fontSize: 22 }}>{fraud.score}</Text>
                    <Text style={type.small}>risk / 100</Text>
                  </View>
                </View>
                <Text style={[type.body, { fontFamily: font.textBold, marginTop: spacing.sm }]}>{fraud.headline}</Text>
                <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
                  <View style={{ flex: 1 }}><Text style={type.small}>Fraud probability</Text><Text style={[type.body, { fontFamily: font.textMedium }]}>{fraud.fraud_probability_pct}%</Text></View>
                  <View style={{ flex: 1 }}><Text style={type.small}>Recipient trust</Text><Text style={[type.body, { fontFamily: font.textMedium, color: colors.brandPrimary }]}>{fraud.recipient_trust}/100</Text></View>
                </View>
                <View style={{ marginTop: spacing.sm, gap: 4 }}>
                  {fraud.flags.map((f: any, i: number) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }} testID={`fraud-flag-${i}`}>
                      <Ionicons
                        name={f.kind === "block" ? "close-circle" : f.kind === "warn" ? "warning" : f.kind === "safe" ? "checkmark-circle" : "information-circle"}
                        size={13}
                        color={f.kind === "block" ? colors.error : f.kind === "warn" ? colors.warning : f.kind === "safe" ? colors.brandPrimary : colors.info}
                        style={{ marginTop: 2 }}
                      />
                      <Text style={[type.small, { flex: 1, color: colors.onSurface }]}>
                        <Text style={{ fontFamily: font.textMedium }}>{f.label}. </Text>{f.detail}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            <View style={styles.card}>
              <PreviewRow label="Recipient" value={recipient} />
              <PreviewRow label="Country" value={`${country.flag} ${country.name}`} />
              <PreviewRow label="You send" value={formatMoney(num, from)} strong />
              <PreviewRow label="Rate" value={`1 ${from} = ${quote.exchange_rate} ${toCurrency}`} />
              <PreviewRow label="Fee" value={formatMoney(quote.transfer_fee, from)} />
              <View style={styles.divider} />
              <PreviewRow label="They receive" value={formatMoney(quote.receiving_amount, toCurrency)} strong big />
              <PreviewRow label="Delivery" value={country.eta} />
              <PreviewRow label="Rails" value={country.methods.slice(0, 2).join(" · ")} />
            </View>
            {err && <Text style={{ color: colors.error, marginTop: spacing.md }} testID="send-error">{err}</Text>}
          </ScrollView>
        )}

        {/* STEP 5: Success */}
        {step === 4 && result && country && (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
            <View style={styles.successCircle}><Ionicons name="checkmark" size={44} color={colors.brandPrimary} /></View>
            <Text style={[type.h1, { marginTop: spacing.lg }]}>Sent!</Text>
            <Text style={[type.bodyMuted, { textAlign: "center", marginTop: spacing.sm }]}>
              {formatMoney(result.amount, result.from_currency)} → {result.recipient_name} in {country.name} will receive {formatMoney(result.receiving_amount, result.to_currency)}
            </Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl }}>
              <Pressable onPress={() => router.replace("/(tabs)/wallet")} style={[styles.cta, styles.ctaSecondary]} testID="done-home">
                <Text style={[styles.ctaText, { color: colors.onSurface }]}>Home</Text>
              </Pressable>
              <Pressable onPress={() => { setStep(0); setResult(null); setRecipient(""); setAmount("500"); }} style={styles.cta} testID="done-again">
                <Text style={styles.ctaText}>Send again</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Sticky bottom CTA */}
        {step < 4 && (
          <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 14 }]}>
            <Pressable
              testID="next-btn"
              onPress={() => (step === 3 ? send() : setStep(step + 1))}
              disabled={!canNext || busy}
              style={[styles.cta, (!canNext || busy) && { opacity: 0.4 }]}
            >
              {busy && step === 3 ? <ActivityIndicator color={colors.onBrandPrimary} /> :
                <Text style={styles.ctaText}>{step === 3 ? "Confirm & send" : step === 2 ? "Continue to preview" : "Next"}</Text>}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

function CurrencyPicker({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) {
  const [open, setOpen] = useState(false);
  const list = ["USD", "EUR", "GBP", "INR", "JPY", "AED", "AUD", "CAD", "SGD", "CHF", "CNY"];
  return (
    <View>
      <Pressable testID={testID} onPress={() => setOpen(!open)} style={styles.curPill}>
        <Text style={{ fontSize: 16 }}>{flagMap[value]}</Text>
        <Text style={{ color: colors.onSurface, fontFamily: font.textMedium }}>{value}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.onSurfaceSecondary} />
      </Pressable>
      {open && (
        <View style={styles.curDropdown}>
          <ScrollView style={{ maxHeight: 220 }}>
            {list.map((c) => (
              <Pressable key={c} onPress={() => { onChange(c); setOpen(false); }} style={{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10 }} testID={`${testID}-opt-${c}`}>
                <Text style={{ fontSize: 16 }}>{flagMap[c]}</Text>
                <Text style={{ color: colors.onSurface, fontFamily: font.textMedium }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function TimingCell({ label, value }: any) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.body, { fontFamily: font.textBold, marginTop: 2 }]}>{value ?? "—"}</Text>
    </View>
  );
}
function FeeRow({ label, value, bold, muted }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={[type.bodyMuted, muted && { color: colors.success }]}>{label}</Text>
      <Text style={[type.body, bold && { fontFamily: font.textBold }]}>{value}</Text>
    </View>
  );
}
function PreviewRow({ label, value, strong, big }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 8 }}>
      <Text style={type.bodyMuted}>{label}</Text>
      <Text style={[type.body, strong && { fontFamily: font.textBold }, big && { fontFamily: font.display, fontSize: 22 }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  stepper: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, position: "relative" },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, zIndex: 2 },
  dotActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  rail: { position: "absolute", height: 2, backgroundColor: colors.border, zIndex: 1 },
  stepLabel: { fontFamily: font.textMedium, fontSize: 10, color: colors.onSurfaceTertiary, marginTop: 4 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.onSurface, fontFamily: font.text, fontSize: 14 },
  countryRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  countryRowActive: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  amountInput: { flex: 1, fontFamily: font.display, fontSize: 32, color: colors.onSurface, padding: 0 },
  curPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  curDropdown: { position: "absolute", right: 0, top: 44, zIndex: 100, backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, minWidth: 110, elevation: 10 },
  section: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontFamily: font.text, fontSize: 15 },
  finnCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.brandSecondary, gap: spacing.sm },
  finnBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandSecondary },
  timingRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  badge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginTop: spacing.sm },
  badgeGreen: { backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary },
  badgeAmber: { backgroundColor: "rgba(245,158,11,0.12)", borderWidth: 1, borderColor: "rgba(245,158,11,0.4)" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  saving: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginTop: spacing.sm },
  stickyBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  cta: { flex: 1, backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md, alignItems: "center" },
  ctaSecondary: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
  successCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandSecondary },
  fraudCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, marginBottom: spacing.md },
  fraudBadge: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
});
