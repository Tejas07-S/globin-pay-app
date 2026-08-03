import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/src/Screen";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { api } from "@/src/api";

const PALETTE = ["#10B981", "#3B82F6", "#F59E0B", "#A855F7", "#EF4444", "#06B6D4", "#EAB308"];

export default function Health() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api("/health/score").then(setD).catch(() => {}); }, []);

  if (!d) return <Screen title="Financial Health"><View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.onSurface} /></View></Screen>;

  const scoreColor = d.score >= 80 ? colors.brandPrimary : d.score >= 50 ? colors.warning : colors.error;
  const pieData = d.exposure.map((e: any, i: number) => ({ value: e.usd_value, color: PALETTE[i % PALETTE.length], text: e.currency }));
  const spendingBars = d.spending_series.map((v: number, i: number) => ({ value: v, label: d.months[i], frontColor: colors.error }));
  const incomeBars = d.income_series.map((v: number, i: number) => ({ value: v, label: d.months[i], frontColor: colors.brandPrimary }));

  return (
    <Screen title="Financial Health" subtitle="Powered by Finn AI">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {/* Score */}
        <View style={s.scoreCard} testID="hs-score">
          <Text style={type.label}>Financial Health Score</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 4 }}>
            <Text style={[s.bigScore, { color: scoreColor }]}>{d.score}</Text>
            <Text style={[type.body, { color: colors.onSurfaceSecondary }]}>/ 100</Text>
          </View>
          <View style={s.bar}><View style={[s.barFill, { width: `${d.score}%`, backgroundColor: scoreColor }]} /></View>
          <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
            <Mini label="Inflow" value={`$${d.inflow_usd.toFixed(0)}`} icon="arrow-down" />
            <Mini label="Outflow" value={`$${d.outflow_usd.toFixed(0)}`} icon="arrow-up" />
            <Mini label="Savings" value={`${d.savings_rate_pct}%`} icon="pie-chart" />
          </View>
        </View>

        {/* Spending vs Income */}
        <Text style={s.section}>Spending vs Income</Text>
        <View style={s.card}>
          <Text style={type.label}>Spending · last 6 months</Text>
          <BarChart data={spendingBars} height={120} barBorderRadius={6} barWidth={20} spacing={14} yAxisTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }} xAxisLabelTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }} yAxisColor="transparent" xAxisColor={colors.border} rulesColor={colors.border} noOfSections={3} />
          <Text style={[type.label, { marginTop: spacing.md }]}>Income</Text>
          <BarChart data={incomeBars} height={120} barBorderRadius={6} barWidth={20} spacing={14} yAxisTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }} xAxisLabelTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }} yAxisColor="transparent" xAxisColor={colors.border} rulesColor={colors.border} noOfSections={3} />
        </View>

        {/* Currency exposure */}
        <Text style={s.section}>Currency exposure</Text>
        <View style={s.card}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <PieChart
              data={pieData.length ? pieData : [{ value: 1, color: colors.border }]}
              donut radius={64} innerRadius={40}
              backgroundColor={colors.surfaceSecondary}
              centerLabelComponent={() => (
                <View style={{ alignItems: "center" }}>
                  <Text style={type.small}>Total</Text>
                  <Text style={[type.body, { fontFamily: font.textBold }]}>${(d.exposure.reduce((a: number, e: any) => a + e.usd_value, 0) as number).toFixed(0)}</Text>
                </View>
              )}
            />
            <View style={{ flex: 1, marginLeft: spacing.lg }}>
              {d.exposure.slice(0, 5).map((e: any, i: number) => (
                <View key={e.currency} style={s.legend}>
                  <View style={[s.dot, { backgroundColor: PALETTE[i % PALETTE.length] }]} />
                  <Text style={[type.body, { flex: 1 }]}>{e.currency}</Text>
                  <Text style={[type.small, { fontFamily: font.textMedium }]}>{e.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* AI recommendations */}
        <Text style={s.section}>Finn&apos;s recommendations</Text>
        {d.recommendations.map((r: any, i: number) => (
          <View key={i} style={s.rec} testID={`hs-rec-${i}`}>
            <View style={s.recIcon}><Ionicons name={r.icon} size={16} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.textBold }]}>{r.title}</Text>
              <Text style={type.small}>{r.body}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

function Mini({ label, value, icon }: any) {
  return (
    <View style={s.mini}>
      <Ionicons name={icon} size={12} color={colors.onSurfaceSecondary} />
      <Text style={type.small}>{label}</Text>
      <Text style={[type.body, { fontFamily: font.textBold, fontSize: 15 }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scoreCard: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  bigScore: { fontFamily: font.display, fontSize: 56, letterSpacing: -1 },
  bar: { height: 8, backgroundColor: colors.surfaceTertiary, borderRadius: 4, marginTop: spacing.sm, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4 },
  mini: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, alignItems: "flex-start", gap: 4 },
  section: { fontFamily: font.textBold, fontSize: 16, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  legend: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rec: { flexDirection: "row", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  recIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandSecondary },
});
