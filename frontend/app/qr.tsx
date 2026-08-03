import { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, ComingSoonBadge, cta } from "@/src/Screen";
import { colors, spacing, radius, type, font } from "@/src/theme";

export default function QR() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [scan, setScan] = useState("");

  return (
    <Screen title="Scan & Pay" subtitle="Point at any UPI QR">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <ComingSoonBadge />
        <View style={styles.viewfinder} testID="qr-viewfinder">
          <View style={styles.corner} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <Ionicons name="qr-code" size={80} color={colors.onSurfaceTertiary} />
          <Text style={[type.bodyMuted, { textAlign: "center", position: "absolute", bottom: 24, left: 24, right: 24 }]}>
            Camera preview appears on device.{"\n"}Paste a UPI ID below to simulate.
          </Text>
        </View>
        <View>
          <Text style={{ fontFamily: font.textMedium, fontSize: 13, color: colors.onSurfaceSecondary, marginBottom: 4 }}>Paste UPI ID / code</Text>
          <TextInput
            testID="qr-paste"
            value={scan} onChangeText={setScan}
            placeholder="e.g. merchant@upi" placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="none"
            style={{ backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontFamily: font.text, fontSize: 15 }}
          />
        </View>
        <Pressable
          testID="qr-continue"
          onPress={() => router.push({ pathname: "/upi", params: { vpa: scan } as any })}
          disabled={!scan}
          style={[cta.btn, !scan && { opacity: 0.4 }]}
        >
          <Text style={cta.txt}>Continue with {scan || "…"}</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: { height: 320, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  corner: { position: "absolute", top: 16, left: 16, width: 28, height: 28, borderTopWidth: 3, borderLeftWidth: 3, borderColor: colors.brandPrimary, borderTopLeftRadius: 8 },
  tr: { top: 16, right: 16, left: undefined, borderTopWidth: 3, borderRightWidth: 3, borderLeftWidth: 0, borderTopRightRadius: 8, borderTopLeftRadius: 0 },
  bl: { bottom: 16, left: 16, top: undefined, borderBottomWidth: 3, borderLeftWidth: 3, borderTopWidth: 0, borderBottomLeftRadius: 8, borderTopLeftRadius: 0 },
  br: { bottom: 16, right: 16, top: undefined, left: undefined, borderBottomWidth: 3, borderRightWidth: 3, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 8, borderTopLeftRadius: 0 },
});
