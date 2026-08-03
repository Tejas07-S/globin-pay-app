import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { BarChart, PieChart } from "react-native-gifted-charts";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";

export default function Analytics() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<"networth" | "spending" | "income">("networth");

  useEffect(() => {
    api("/analytics").then(setData).catch(() => {});
  }, []);

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.onSurface} />
      </View>
    );
  }

  const bars = (tab === "spending" ? data.spending_series : data.income_series).map((v: number, i: number) => ({
    value: v, label: data.months[i], frontColor: tab === "spending" ? colors.error : colors.brandPrimary,
  }));

  const pieData = data.allocation.map((a: any) => ({
    value: a.usd_value,
    color: pickColor(a.currency),
    text: a.currency,
  }));

  const heroValue =
    tab === "networth" ? data.net_worth_usd :
    tab === "spending" ? data.spending_usd : data.income_usd;
  const heroLabel = tab === "networth" ? "Net worth" : tab === "spending" ? "Total spending" : "Total income";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} testID="back-btn" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={type.h3}>Analytics</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={styles.heroCard}>
          <Text style={type.label}>{heroLabel}</Text>
          <Text style={styles.heroNum}>{formatMoney(heroValue, "USD")}</Text>
          <View style={styles.healthPill}>
            <Ionicons name="pulse" size={14} color={colors.brandPrimary} />
            <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 12 }}>
              Health score {data.financial_health_score}/100
            </Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {(["networth", "spending", "income"] as const).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={[styles.tab, tab === k && styles.tabActive]} testID={`tab-${k}`}>
              <Text style={{ color: tab === k ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontFamily: font.textMedium, fontSize: 13, textTransform: "capitalize" }}>
                {k === "networth" ? "Net worth" : k}
              </Text>
            </Pressable>
          ))}
        </View>

        {tab === "networth" ? (
          <View style={styles.card}>
            <Text style={styles.title}>Currency allocation</Text>
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: spacing.md }}>
              <PieChart
                data={pieData.length ? pieData : [{ value: 1, color: colors.border }]}
                donut
                radius={70}
                innerRadius={45}
                backgroundColor={colors.surfaceSecondary}
                centerLabelComponent={() => (
                  <View style={{ alignItems: "center" }}>
                    <Text style={type.small}>Total</Text>
                    <Text style={[type.body, { fontFamily: font.textBold }]}>${data.net_worth_usd.toFixed(0)}</Text>
                  </View>
                )}
              />
              <View style={{ flex: 1, marginLeft: spacing.lg }}>
                {data.allocation.slice(0, 5).map((a: any) => (
                  <View key={a.currency} style={styles.allocRow}>
                    <View style={[styles.dot, { backgroundColor: pickColor(a.currency) }]} />
                    <Text style={[type.body, { flex: 1 }]}>{a.currency}</Text>
                    <Text style={[type.small, { fontFamily: font.textMedium }]}>{a.pct}%</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{tab === "spending" ? "Spending" : "Income"} · last 6 months</Text>
            <View style={{ marginLeft: -spacing.md, marginTop: spacing.md }}>
              <BarChart
                data={bars}
                barWidth={22}
                barBorderRadius={6}
                spacing={16}
                height={160}
                yAxisTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: colors.onSurfaceTertiary, fontSize: 10 }}
                yAxisColor="transparent"
                xAxisColor={colors.border}
                rulesColor={colors.border}
                noOfSections={3}
              />
            </View>
          </View>
        )}

        <View style={[styles.card, { marginTop: spacing.md }]}>
          <Text style={styles.title}>Spending categories</Text>
          {data.categories.map((c: any) => (
            <View key={c.name} style={styles.catRow}>
              <View style={[styles.catIcon, { backgroundColor: c.color + "22", borderColor: c.color + "66" }]}>
                <View style={[styles.dot, { backgroundColor: c.color, width: 10, height: 10 }]} />
              </View>
              <Text style={[type.body, { flex: 1 }]}>{c.name}</Text>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>${c.usd.toFixed(2)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const PALETTE = ["#10B981", "#3B82F6", "#F59E0B", "#A855F7", "#EF4444", "#06B6D4", "#EAB308", "#EC4899", "#84CC16", "#22D3EE", "#F97316"];
function pickColor(cur: string) {
  const keys = ["USD","EUR","GBP","INR","JPY","AED","AUD","CAD","SGD","CHF","CNY"];
  return PALETTE[keys.indexOf(cur) % PALETTE.length];
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  heroCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  heroNum: { fontFamily: font.display, fontSize: 40, color: colors.onSurface, letterSpacing: -0.5, marginTop: 4 },
  healthPill: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: radius.pill, marginTop: spacing.sm,
  },
  tabs: {
    flexDirection: "row", gap: 6,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    padding: 4, marginVertical: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: "center" },
  tabActive: { backgroundColor: colors.brandPrimary },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  title: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface },
  allocRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  catRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  catIcon: {
    width: 32, height: 32, borderRadius: radius.md, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
});
