import { useEffect, useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, flag, formatMoney } from "@/src/theme";

const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "AED", "AUD", "CAD", "SGD", "CHF", "CNY"];

export default function Send() {
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("EUR");
  const [amount, setAmount] = useState("100");
  const [recipient, setRecipient] = useState("");
  const [country, setCountry] = useState("");
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const num = useMemo(() => parseFloat(amount) || 0, [amount]);
  const availableFrom = user?.balances?.[from] ?? 0;

  useEffect(() => {
    if (num <= 0) { setQuote(null); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const q = await api(`/fee/quote?from_currency=${from}&to_currency=${to}&amount=${num}`);
        setQuote(q);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [from, to, num]);

  const swap = () => { const f = from; setFrom(to); setTo(f); };

  const canSend = num > 0 && recipient.trim() && country.trim() && num <= availableFrom && quote;

  const onSend = async () => {
    setErr(null); setSending(true);
    try {
      const r = await api("/transfers", {
        method: "POST",
        body: {
          from_currency: from, to_currency: to, amount: num,
          recipient_name: recipient.trim(), recipient_country: country.trim(),
        },
      });
      setSuccess(r);
      await refresh();
    } catch (e: any) { setErr(e.message || "Transfer failed"); }
    finally { setSending(false); }
  };

  if (success) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={44} color={colors.brandPrimary} />
        </View>
        <Text style={[type.h1, { marginTop: spacing.lg }]}>Sent!</Text>
        <Text style={[type.bodyMuted, { marginTop: spacing.sm, textAlign: "center" }]}>
          {formatMoney(success.amount, success.from_currency)} → {recipient} received {formatMoney(success.receiving_amount, success.to_currency)}
        </Text>
        <Pressable testID="send-again-btn" onPress={() => { setSuccess(null); setRecipient(""); setCountry(""); }} style={[styles.cta, { marginTop: spacing.xl }]}>
          <Text style={styles.ctaText}>Send again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={type.h2}>Send money</Text>
        <Text style={type.bodyMuted}>Transparent fees · Best rate guaranteed</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 180 }} keyboardShouldPersistTaps="handled">
          <View style={styles.amountCard}>
            <Text style={type.label}>You send</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
              <TextInput
                testID="send-amount-input"
                value={amount} onChangeText={setAmount} keyboardType="decimal-pad"
                style={styles.amountInput}
              />
              <CurrencyPicker value={from} onChange={setFrom} testID="from-currency" />
            </View>
            <Text style={[type.small, { marginTop: 4 }]}>Available: {formatMoney(availableFrom, from)}</Text>
          </View>

          <Pressable onPress={swap} style={styles.swapBtn} testID="swap-btn">
            <Ionicons name="swap-vertical" size={18} color={colors.brandPrimary} />
          </Pressable>

          <View style={styles.amountCard}>
            <Text style={type.label}>Recipient gets</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm }}>
              <Text style={[styles.amountInput, { color: quote ? colors.onSurface : colors.onSurfaceTertiary }]}>
                {loading ? "…" : quote ? quote.receiving_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
              </Text>
              <CurrencyPicker value={to} onChange={setTo} testID="to-currency" />
            </View>
            <Text style={[type.small, { marginTop: 4 }]}>
              {quote ? `1 ${from} = ${quote.exchange_rate} ${to}` : "Live rate"}
            </Text>
          </View>

          {/* Fee breakdown */}
          <View style={styles.feeCard} testID="fee-breakdown">
            <Text style={styles.sectionTitle}>Smart fee breakdown</Text>
            <FeeRow label="Amount sent" value={quote ? formatMoney(quote.amount_sent, from) : "—"} />
            <FeeRow label="Exchange rate" value={quote ? `${quote.exchange_rate}` : "—"} />
            <FeeRow label="Transfer fee" value={quote ? formatMoney(quote.transfer_fee, from) : "—"} />
            <FeeRow label="Taxes" value="$0.00" />
            <FeeRow label="Hidden fees" value="$0.00" muted />
            <View style={styles.divider} />
            <FeeRow label="Recipient gets" value={quote ? formatMoney(quote.receiving_amount, to) : "—"} bold />
            <FeeRow label="ETA" value={quote?.estimated_delivery || "—"} />
            {quote && (
              <View style={styles.savingsPill}>
                <Ionicons name="sparkles" size={12} color={colors.brandPrimary} />
                <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 12 }}>
                  You save {formatMoney(quote.savings_vs_paypal, from)} vs PayPal
                </Text>
              </View>
            )}
          </View>

          {/* Recipient */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Recipient</Text>
          <TextInput
            testID="recipient-name"
            value={recipient} onChangeText={setRecipient}
            placeholder="Full name" placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
          />
          <TextInput
            testID="recipient-country"
            value={country} onChangeText={setCountry}
            placeholder="Country (e.g. Germany)" placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
          />
          {err && <Text testID="send-error" style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text>}
        </ScrollView>

        <View style={[styles.stickyBar, { paddingBottom: insets.bottom + 78 }]}>
          <Pressable
            testID="send-submit-btn"
            onPress={onSend}
            disabled={!canSend || sending}
            style={[styles.cta, (!canSend || sending) && { opacity: 0.5 }]}
          >
            {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> :
              <Text style={styles.ctaText}>Send {quote ? formatMoney(num, from) : ""}</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function CurrencyPicker({ value, onChange, testID }: { value: string; onChange: (v: string) => void; testID: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable onPress={() => setOpen(!open)} style={styles.curPill} testID={testID}>
        <Text style={{ fontSize: 16 }}>{flag[value]}</Text>
        <Text style={{ color: colors.onSurface, fontFamily: font.textMedium }}>{value}</Text>
        <Ionicons name="chevron-down" size={14} color={colors.onSurfaceSecondary} />
      </Pressable>
      {open && (
        <View style={styles.curDropdown}>
          <ScrollView style={{ maxHeight: 220 }}>
            {CURRENCIES.map((c) => (
              <Pressable key={c} onPress={() => { onChange(c); setOpen(false); }} style={styles.curOpt} testID={`${testID}-opt-${c}`}>
                <Text style={{ fontSize: 16 }}>{flag[c]}</Text>
                <Text style={{ color: colors.onSurface, fontFamily: font.textMedium }}>{c}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
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

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  amountCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  amountInput: {
    flex: 1, fontFamily: font.display, fontSize: 32, color: colors.onSurface, padding: 0,
  },
  swapBtn: {
    alignSelf: "center", width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.brandSecondary, marginVertical: -4, zIndex: 1,
  },
  curPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surfaceTertiary, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
  },
  curDropdown: {
    position: "absolute", right: 0, top: 44, zIndex: 100,
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, minWidth: 110, elevation: 10,
  },
  curOpt: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10 },
  feeCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, marginTop: spacing.md,
  },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  savingsPill: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, marginTop: spacing.sm,
  },
  sectionTitle: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginBottom: spacing.sm },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    fontFamily: font.text, fontSize: 15, marginBottom: spacing.sm,
  },
  stickyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
  },
  cta: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md,
    alignItems: "center",
  },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
  successCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.brandSecondary,
  },
});
