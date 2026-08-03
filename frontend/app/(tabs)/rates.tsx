import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LineChart } from "react-native-gifted-charts";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, flag } from "@/src/theme";

type Rate = { pair: string; quote: string; available: boolean; rate?: number; change_pct?: number | null };
type RatesResponse = { base: string; rates: Rate[]; source: string; stale: boolean; fetched_at: number };
type Trend = {
  pair: string; available: boolean;
  today?: number; yesterday?: number | null; change_pct?: number | null;
  history?: { date: string; rate: number }[];
  source?: string; stale?: boolean; disclaimer?: string; message?: string;
};

type LoadState = "loading" | "success" | "error";

export default function Rates() {
  const insets = useSafeAreaInsets();
  const [base, setBase] = useState("USD");
  const [selected, setSelected] = useState("EUR");
  const [ratesData, setRatesData] = useState<RatesResponse | null>(null);
  const [trend, setTrend] = useState<Trend | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const [r, t] = await Promise.all([
        api<RatesResponse>(`/rates?base=${base}`),
        api<Trend>(`/rates/predict?base=${base}&quote=${selected}`),
      ]);
      setRatesData(r);
      setTrend(t);
      setState("success");
    } catch {
      setState("error");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { setState("loading"); load(); /* eslint-disable-next-line */ }, [base, selected]);

  const chartData = (trend?.history || []).map((h) => ({
    value: h.rate,
    label: new Date(h.date).toLocaleDateString(undefined, { weekday: "short" }),
  }));
  const bases = ["USD", "EUR", "GBP", "INR", "JPY"];

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface, paddingTop: insets.top }}>
      <View style={styles.header}>
        <Text style={[type.h2]}>Market</Text>
        <Text style={type.bodyMuted}>Live exchange rates</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.onSurface} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {bases.map((b) => (
            <Pressable key={b} testID={`base-chip-${b}`} onPress={() => setBase(b)}
              style={[styles.chip, b === base && styles.chipActive, { flexShrink: 0 }]}>
              <Text style={{ fontSize: 14 }}>{flag[b]}</Text>
              <Text style={[styles.chipText, b === base && { color: colors.onBrandPrimary }]}>{b}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* LOADING */}
        {state === "loading" && (
          <View style={styles.trendCard} testID="rates-loading">
            <ActivityIndicator color={colors.onSurface} />
          </View>
        )}

        {/* ERROR */}
        {state === "error" && (
          <View style={styles.trendCard} testID="rates-error">
            <Ionicons name="cloud-offline-outline" size={22} color={colors.error} />
            <Text style={[type.body, { marginTop: spacing.sm, textAlign: "center" }]}>
              Couldn&apos;t load rates right now.
            </Text>
            <Pressable testID="rates-retry" onPress={() => { setState("loading"); load(); }} style={styles.retryBtn}>
              <Text style={{ color: colors.onBrandPrimary, fontFamily: font.textMedium, fontSize: 13 }}>Retry</Text>
            </Pressable>
          </View>
        )}

        {/* SUCCESS — trend card */}
        {state === "success" && trend && (
          <View style={styles.trendCard} testID="predict-card">
            {trend.available === false ? (
              <View style={{ alignItems: "center", paddingVertical: spacing.md }}>
                <Ionicons name="time-outline" size={20} color={colors.onSurfaceTertiary} />
                <Text style={[type.bodyMuted, { marginTop: spacing.xs, textAlign: "center" }]}>
                  {trend.message || "Rate temporarily unavailable."}
                </Text>
              </View>
            ) : (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <View>
                    <Text style={type.label}>Live rate · {base}/{selected}</Text>
                    <Text style={[type.number, { fontSize: 28, marginTop: 4 }]}>{trend.today?.toFixed(4) ?? "—"}</Text>
                  </View>
                  {trend.change_pct != null && (
                    <View style={[styles.changePill, { backgroundColor: trend.change_pct >= 0 ? colors.brandTertiary : colors.surfaceTertiary }]}>
                      <Ionicons name={trend.change_pct >= 0 ? "trending-up" : "trending-down"} size={12} color={trend.change_pct >= 0 ? colors.brandPrimary : colors.error} />
                      <Text style={{ color: trend.change_pct >= 0 ? colors.brandPrimary : colors.error, fontFamily: font.textMedium, fontSize: 12 }}>
                        {trend.change_pct >= 0 ? "+" : ""}{trend.change_pct.toFixed(2)}% vs yesterday
                      </Text>
                    </View>
                  )}
                </View>

                {chartData.length >= 2 ? (
                  <View style={{ marginTop: spacing.md, marginLeft: -spacing.md }}>
                    <LineChart
                      data={chartData}
                      color={colors.brandPrimary}
                      thickness={2}
                      startFillColor={colors.brandPrimary}
                      endFillColor={colors.surfaceSecondary}
                      startOpacity={0.4}
                      endOpacity={0.02}
                      areaChart
                      curved
                      hideDataPoints={false}
                      dataPointsColor={colors.brandPrimary}
                      dataPointsRadius={3}
                      yAxisTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }}
                      xAxisLabelTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }}
                      xAxisColor={colors.border}
                      yAxisColor="transparent"
                      rulesColor={colors.border}
                      rulesType="solid"
                      initialSpacing={10}
                      spacing={38}
                      height={140}
                      noOfSections={3}
                      adjustToWidth
                    />
                  </View>
                ) : (
                  <View style={styles.emptyTrend} testID="trend-empty">
                    <Ionicons name="analytics-outline" size={18} color={colors.onSurfaceTertiary} />
                    <Text style={[type.small, { marginTop: 4, textAlign: "center" }]}>
                      Building up trend history — check back tomorrow for a full chart.
                    </Text>
                  </View>
                )}

                <View style={styles.predictRow}>
                  <PredCell label="Today" value={trend.today?.toFixed(4)} />
                  <PredCell label="Yesterday" value={trend.yesterday?.toFixed(4)} />
                  <PredCell label="Source" value={trend.source} />
                </View>

                {trend.disclaimer && (
                  <Text style={[type.small, { marginTop: spacing.sm, color: colors.onSurfaceTertiary }]}>
                    {trend.disclaimer}
                  </Text>
                )}
                {trend.stale && (
                  <View style={styles.staleBadge}>
                    <Ionicons name="alert-circle-outline" size={12} color={colors.error} />
                    <Text style={{ color: colors.error, fontSize: 11, fontFamily: font.textMedium }}>
                      Showing last known rates — live update unavailable
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg }}>
          <Text style={styles.sectionTitle}>All pairs</Text>
        </View>

        {state === "loading" ? (
          <ActivityIndicator style={{ margin: spacing.xl }} color={colors.onSurface} />
        ) : state === "error" ? null : ratesData && ratesData.rates.length === 0 ? (
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: spacing.lg }]}>No rates available.</Text>
        ) : (
          ratesData?.rates.map((r) => (
            <Pressable
              key={r.pair} testID={`rate-${r.quote}`}
              onPress={() => r.available && setSelected(r.quote)}
              disabled={!r.available}
              style={[styles.rateRow, r.quote === selected && { borderColor: colors.brandSecondary }, !r.available && { opacity: 0.5 }]}
            >
              <View style={styles.flagCircle}><Text style={{ fontSize: 18 }}>{flag[r.quote]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontFamily: font.textMedium }]}>{r.pair}</Text>
                <Text style={type.small}>
                  {r.available ? `1 ${base} = ${r.rate!.toFixed(4)} ${r.quote}` : "Unavailable right now"}
                </Text>
              </View>
              {r.available && (
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[type.number, { fontSize: 15 }]}>{r.rate!.toFixed(4)}</Text>
                  {r.change_pct != null && (
                    <Text style={[type.small, { color: r.change_pct >= 0 ? colors.success : colors.error, fontFamily: font.textMedium }]}>
                      {r.change_pct >= 0 ? "+" : ""}{r.change_pct.toFixed(2)}%
                    </Text>
                  )}
                </View>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function PredCell({ label, value }: any) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.body, { fontFamily: font.textBold, marginTop: 2 }]}>{value ?? "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: spacing.md, height: 36, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { fontFamily: font.textMedium, fontSize: 13, color: colors.onSurface },
  trendCard: {
    marginHorizontal: spacing.lg, marginTop: spacing.lg,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  changePill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
  },
  emptyTrend: { alignItems: "center", paddingVertical: spacing.lg },
  predictRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.md },
  staleBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  retryBtn: {
    marginTop: spacing.md, alignSelf: "center",
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 8,
  },
  sectionTitle: { fontFamily: font.textBold, fontSize: 16, color: colors.onSurface, marginBottom: spacing.sm },
  rateRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  flagCircle: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceTertiary, alignItems: "center", justifyContent: "center",
  },
});
