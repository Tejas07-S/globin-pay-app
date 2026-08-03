import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { colors, spacing, radius, type, font } from "@/src/theme";

export default function Register() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setErr(null); setLoading(true);
    try { await register(email.trim(), pw, name.trim() || "New User"); }
    catch (e: any) { setErr(e.message || "Registration failed"); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.surface }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + spacing.xl, paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable testID="back-btn" onPress={() => router.back()} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={[type.h1, { fontSize: 36, marginBottom: spacing.sm }]}>Create account</Text>
          <Text style={[type.bodyMuted, { marginBottom: spacing.xl }]}>
            Join millions moving money smarter with GLOBiN pay.
          </Text>

          <Text style={styles.label}>Full name</Text>
          <TextInput
            testID="reg-name-input"
            value={name} onChangeText={setName}
            placeholder="Jane Doe" placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
          />
          <Text style={styles.label}>Email</Text>
          <TextInput
            testID="reg-email-input"
            value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address"
            placeholder="you@example.com" placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
          />
          <Text style={styles.label}>Password</Text>
          <TextInput
            testID="reg-password-input"
            value={pw} onChangeText={setPw}
            secureTextEntry placeholder="At least 6 characters" placeholderTextColor={colors.onSurfaceTertiary}
            style={styles.input}
          />
          {err && <Text testID="reg-error" style={styles.err}>{err}</Text>}
        </View>

        <Pressable
          testID="reg-submit-button"
          onPress={onSubmit}
          disabled={loading}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        >
          {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> :
            <Text style={styles.ctaText}>Create account</Text>}
        </Pressable>

        <View style={styles.footer}>
          <Text style={type.bodyMuted}>Have an account? </Text>
          <Link href="/(auth)/login" testID="go-login-link">
            <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium }}>Sign in</Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.lg,
  },
  label: { ...type.label, marginBottom: spacing.xs, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surfaceTertiary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    fontFamily: font.text, fontSize: 15,
  },
  err: { color: colors.error, marginTop: spacing.md, fontFamily: font.text },
  cta: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md,
    alignItems: "center", marginTop: spacing.lg,
  },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
});
