import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from "react-native";
import { Screen } from "@/src/Screen";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type, font, flag, formatMoney } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function WalletDetail() {
  const { user } = useAuth();
  const balances = user?.balances || {};
  return (
    <Screen title="Multi-Currency Wallet" subtitle="Hold 11 currencies · Real-time balances">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {Object.entries(balances).map(([cur, amt]) => (
          <View key={cur} style={s.row} testID={`wd-${cur}`}>
            <Text style={{ fontSize: 22 }}>{flag[cur] || "🌐"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>{cur}</Text>
              <Text style={type.small}>{fullNames[cur] || cur}</Text>
            </View>
            <Text style={[type.body, { fontFamily: font.textBold, color: (amt as number) > 0 ? colors.onSurface : colors.onSurfaceTertiary }]}>
              {formatMoney(amt as number, cur)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
const fullNames: Record<string, string> = { USD: "US Dollar", EUR: "Euro", GBP: "British Pound", INR: "Indian Rupee", JPY: "Japanese Yen", AED: "UAE Dirham", AUD: "Australian Dollar", CAD: "Canadian Dollar", SGD: "Singapore Dollar", CHF: "Swiss Franc", CNY: "Chinese Yuan" };
const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
});
