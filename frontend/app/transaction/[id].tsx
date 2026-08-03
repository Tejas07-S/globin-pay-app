import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Share, Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta } from "@/src/Screen";
import { colors, spacing, radius, type, font, flag, formatMoney } from "@/src/theme";
import { api } from "@/src/api";

export default function TransactionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api(`/transactions/${id}`).then(setData).catch((e) => setErr(e.message)).finally(() => setLoading(false));
  }, [id]);

  const share = async () => {
    if (!data) return;
    const t = data.tx;
    const msg = `GLOBiN pay receipt\n${t.recipient_name} · ${t.recipient_country}\n${formatMoney(t.amount, t.from_currency)} → ${formatMoney(t.receiving_amount, t.to_currency)}\nRate ${t.exchange_rate} · Fee ${t.fee} ${t.from_currency}\nTxn ID ${t.id.slice(0,8).toUpperCase()}`;
    try {
      if (Platform.OS === "web") {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(msg);
        }
      } else {
        await Share.share({ message: msg });
      }
    } catch {}
  };

  if (loading) return <Screen title="Transaction"><View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.onSurface} /></View></Screen>;
  if (err || !data) return <Screen title="Transaction"><View style={{ padding: spacing.lg }}><Text style={{ color: colors.error }}>{err || "Not found"}</Text></View></Screen>;

  const t = data.tx;
  return (
    <Screen title="Transaction" subtitle={`ID ${t.id.slice(0,8).toUpperCase()}`}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={s.hero}>
          <Text style={{ fontSize: 40 }}>{flag[t.to_currency] || "🌐"}</Text>
          <Text style={[type.h1, { marginTop: spacing.sm }]}>-{formatMoney(t.amount, t.from_currency)}</Text>
          <Text style={type.bodyMuted}>→ {formatMoney(t.receiving_amount, t.to_currency)} to {t.recipient_name}</Text>
          <View style={s.badge}><Text style={{ color: colors.brandPrimary, fontFamily: font.textBold, fontSize: 11 }}>{(t.status || "COMPLETED").toUpperCase()}</Text></View>
        </View>

        <Text style={s.section}>Timeline</Text>
        {data.timeline.map((step: any, i: number) => (
          <View key={i} style={s.step} testID={`step-${step.status}`}>
            <View style={s.stepDot}><Ionicons name="checkmark" size={12} color={colors.onBrandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>{step.label}</Text>
              <Text style={type.small}>{new Date(step.at).toLocaleString()}</Text>
            </View>
          </View>
        ))}

        <Text style={s.section}>Fee breakdown</Text>
        <View style={s.card}>
          <Row label="Amount sent" value={formatMoney(t.amount, t.from_currency)} />
          <Row label="Exchange rate" value={`1 ${t.from_currency} = ${t.exchange_rate} ${t.to_currency}`} />
          <Row label="Transfer fee" value={formatMoney(t.fee, t.from_currency)} />
          <Row label="Taxes" value="$0.00" />
          <Row label="Hidden fees" value="$0.00" muted />
          <View style={s.divider} />
          <Row label="Recipient gets" value={formatMoney(t.receiving_amount, t.to_currency)} bold />
        </View>

        <View style={s.aiCard} testID="ai-fee-explain">
          <View style={s.finnBadge}><Ionicons name="sparkles" size={14} color={colors.brandPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[type.label, { color: colors.brandPrimary }]}>Finn explains</Text>
            <Text style={[type.body, { marginTop: 4 }]}>{data.ai_fee_explanation}</Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
          <Pressable style={[cta.btn, styles.side]} onPress={share} testID="share-btn">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name="share-social" size={16} color={colors.onBrandPrimary} />
              <Text style={cta.txt}>Share receipt</Text>
            </View>
          </Pressable>
        </View>
        <Text style={{ ...type.small, textAlign: "center", marginTop: spacing.md }}>PDF export requires a device build.</Text>
      </ScrollView>
    </Screen>
  );
}

function Row({ label, value, bold, muted }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={[type.bodyMuted, muted && { color: colors.success }]}>{label}</Text>
      <Text style={[type.body, bold && { fontFamily: font.textBold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ side: { flex: 1 } });
const s = StyleSheet.create({
  hero: { alignItems: "center", paddingVertical: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  badge: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary },
  section: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  step: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  stepDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  aiCard: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.brandSecondary, marginTop: spacing.md },
  finnBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandSecondary },
});
