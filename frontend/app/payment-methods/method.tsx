/**
 * Step 2 of Add Payment Method — choose how to connect.
 * Link Bank (recommended) · Add Manually · Scan Cheque (coming soon)
 */
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@/src/Screen";
import { colors, spacing, radius, type, font } from "@/src/theme";

export default function ChooseMethod() {
  const router = useRouter();
  const { country, name, flag } = useLocalSearchParams<{ country: string; name: string; flag: string }>();

  const options = [
    {
      icon: "flash-outline", tag: "Recommended · Instant",
      title: "Link Bank",
      desc: "Sign in to your bank and connect instantly. No manual details needed.",
      onPress: () => router.push({ pathname: "/payment-methods/link", params: { country, name, flag } as any }),
      tid: "opt-link",
    },
    {
      icon: "create-outline", tag: "1–2 business days",
      title: "Add Manually",
      desc: "Type your account details and verify with micro-deposits.",
      onPress: () => router.push({ pathname: "/payment-methods/manual", params: { country, name, flag } as any }),
      tid: "opt-manual",
    },
    {
      icon: "camera-outline", tag: "Coming soon",
      title: "Scan Cheque",
      desc: "Snap your cheque and we'll extract the details for you.",
      disabled: true,
      tid: "opt-scan",
    },
  ];

  return (
    <Screen title="How to connect" subtitle={`${flag} ${name} · Step 2 of 3`}>
      <View style={{ padding: spacing.lg, gap: spacing.md }}>
        {options.map((o) => (
          <Pressable
            key={o.tid}
            testID={o.tid}
            onPress={o.onPress}
            disabled={o.disabled}
            style={[s.card, o.disabled && { opacity: 0.5 }]}
          >
            <View style={s.badge}>
              <Ionicons name={o.icon as any} size={22} color={colors.brandPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={[type.body, { fontFamily: font.textBold }]}>{o.title}</Text>
                <View style={s.tag}><Text style={s.tagTxt}>{o.tag}</Text></View>
              </View>
              <Text style={type.small}>{o.desc}</Text>
            </View>
            {!o.disabled && <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />}
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  badge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  tag: { backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagTxt: { color: colors.brandPrimary, fontFamily: font.textBold, fontSize: 10 },
});
