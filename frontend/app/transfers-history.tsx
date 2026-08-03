import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Screen } from "@/src/Screen";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";
import { api } from "@/src/api";
import { Ionicons } from "@expo/vector-icons";

export default function TransfersHistory() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<any[]>("/transfers").then((r) => setItems(r)).finally(() => setLoading(false)); }, []);

  return (
    <Screen title="Global Transfers" subtitle="All your money movements">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {loading && <ActivityIndicator color={colors.onSurface} />}
        {!loading && items.length === 0 && <Text style={type.bodyMuted}>No transfers yet.</Text>}
        {items.map((t) => (
          <View key={t.id} style={s.row}>
            <View style={s.icon}><Ionicons name="paper-plane" size={16} color={colors.brandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>{t.recipient_name}</Text>
              <Text style={type.small}>{t.recipient_country} · {new Date(t.created_at).toLocaleDateString()}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>-{formatMoney(t.amount, t.from_currency)}</Text>
              <Text style={[type.small, { color: colors.success }]}>+{formatMoney(t.receiving_amount, t.to_currency)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  icon: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
});
