/**
 * Step 1 of Add Payment Method — country picker with search.
 * Also acts as first-time onboarding if `?welcome=1` is present.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/src/Screen";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { api } from "@/src/api";

type C = { code: string; name: string; flag: string; currency: string };

export default function AddPaymentMethod() {
  const router = useRouter();
  const { welcome } = useLocalSearchParams();
  const [countries, setCountries] = useState<C[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    api<{ countries: C[] }>("/countries/schema").then((d) => setCountries(d.countries));
  }, []);

  const filtered = countries?.filter((c) =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase() === q.toLowerCase()
  );

  return (
    <Screen title="Add Payment Method" subtitle={welcome ? "Step 1 of 3 — choose country" : "Which country is your bank in?"}>
      {welcome && (
        <View style={s.welcome} testID="pm-welcome">
          <Text style={{ fontSize: 32 }}>👋</Text>
          <Text style={type.h3}>Hi there, let&apos;s connect your first Payment Method.</Text>
          <Text style={type.bodyMuted}>Which country is your bank in?</Text>
        </View>
      )}

      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
        <View style={s.search}>
          <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} />
          <TextInput
            testID="country-search"
            value={q} onChangeText={setQ}
            placeholder="Search country" placeholderTextColor={colors.onSurfaceTertiary}
            style={s.searchInput}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {!countries && <ActivityIndicator color={colors.onSurface} />}
        {filtered?.map((c) => (
          <Pressable
            key={c.code}
            testID={`country-${c.code}`}
            onPress={() => router.push({ pathname: "/payment-methods/method", params: { country: c.code, name: c.name, flag: c.flag } as any })}
            style={s.row}>
            <Text style={{ fontSize: 28 }}>{c.flag}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>{c.name}</Text>
              <Text style={type.small}>{c.currency}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  welcome: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: 6, alignItems: "flex-start" },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.onSurface, fontFamily: font.text, fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
});
