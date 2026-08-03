import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { isPinEnabled, setPinEnabled, biometricAvailable, biometricPrompt } from "@/src/pin";
import { colors, spacing, radius, type, font } from "@/src/theme";

export default function PinSetup() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setAvailable(await biometricAvailable());
      setEnabled(await isPinEnabled());
    })();
  }, []);

  const toggle = async () => {
    setBusy(true); setMsg(null);
    if (!enabled) {
      const ok = await biometricPrompt("Enable biometric app lock");
      if (ok) {
        await setPinEnabled(true);
        setEnabled(true);
        setMsg("Biometric lock enabled");
      } else {
        setMsg("Biometric verification failed");
      }
    } else {
      await setPinEnabled(false);
      setEnabled(false);
      setMsg("Biometric lock disabled");
    }
    setBusy(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="back-btn"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={type.h3}>Biometric lock</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        <View style={styles.hero}>
          <View style={styles.circle}><Ionicons name="finger-print" size={44} color={colors.brandPrimary} /></View>
          <Text style={[type.h2, { textAlign: "center", marginTop: spacing.md }]}>App lock</Text>
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: spacing.xs }]}>
            Require Face ID / Touch ID / device passcode every time you open GlobalPay AI.
          </Text>
        </View>

        {!available ? (
          <View style={styles.warn} testID="bio-unavailable">
            <Ionicons name="warning" size={16} color={colors.warning} />
            <Text style={[type.small, { color: colors.warning, flex: 1 }]}>
              No biometric hardware or no passcode configured on this device.
            </Text>
          </View>
        ) : (
          <>
            <Pressable
              testID="pin-toggle-btn"
              onPress={toggle}
              disabled={busy}
              style={[styles.cta, enabled && { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border }, busy && { opacity: 0.5 }]}
            >
              {busy ? <ActivityIndicator color={enabled ? colors.onSurface : colors.onBrandPrimary} /> :
                <Text style={[styles.ctaText, enabled && { color: colors.onSurface }]}>{enabled ? "Disable app lock" : "Enable app lock"}</Text>}
            </Pressable>
            {msg && <Text style={{ color: colors.brandPrimary, marginTop: spacing.md, textAlign: "center" }} testID="pin-msg">{msg}</Text>}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  hero: { alignItems: "center", paddingVertical: spacing.xl },
  circle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandSecondary,
  },
  warn: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: "rgba(245,158,11,0.12)", padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: "rgba(245,158,11,0.4)",
  },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.lg },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
});
