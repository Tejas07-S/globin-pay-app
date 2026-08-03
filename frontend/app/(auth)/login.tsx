import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { signInWithGoogle } from "@/src/googleAuth";
import { BrandMark } from "@/src/BrandMark";
import { colors, spacing, radius, type, font } from "@/src/theme";

const HERO = "https://images.unsplash.com/photo-1710438399422-2fca27686bcd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzJ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMGRhcmslMjBnbGFzc3klMjBmbHVpZCUyMHRleHR1cmV8ZW58MHx8fHwxNzg1MzI3NzU4fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async () => {
    setErr(null); setLoading(true);
    try { await login(email.trim(), pw); }
    catch (e: any) { setErr(e.message || "Login failed"); }
    finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Image source={HERO} style={StyleSheet.absoluteFill as any} contentFit="cover" />
      <LinearGradient
        colors={["rgba(10,10,10,0.5)", "rgba(10,10,10,0.85)", "rgba(10,10,10,1)"]}
        style={StyleSheet.absoluteFill as any}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + spacing.xxxl, paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandRow}>
            <BrandMark size={22} />
          </View>
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={[type.h1, { fontSize: 40, marginBottom: spacing.sm }]}>Welcome back.</Text>
            <Text style={[type.bodyMuted, { marginBottom: spacing.xl }]}>
              The smart way to move money — across the world and next door.
            </Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              testID="login-email-input"
              value={email} onChangeText={setEmail}
              autoCapitalize="none" keyboardType="email-address"
              placeholder="you@example.com" placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
            />
            <Text style={styles.label}>Password</Text>
            <TextInput
              testID="login-password-input"
              value={pw} onChangeText={setPw}
              secureTextEntry placeholder="••••••••" placeholderTextColor={colors.onSurfaceTertiary}
              style={styles.input}
            />
            {err && <Text testID="login-error" style={styles.err}>{err}</Text>}
          </View>

          <Pressable
            testID="login-submit-button"
            onPress={onSubmit}
            disabled={loading}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> :
              <Text style={styles.ctaText}>Continue</Text>}
          </Pressable>

          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.line} />
          </View>

          <Pressable
            testID="google-signin-button"
            onPress={async () => {
              setErr(null); setLoading(true);
              const r = await signInWithGoogle();
              setLoading(false);
              if (!r.ok && r.reason !== "redirecting" && r.reason !== "cancelled") {
                setErr(r.reason);
              }
            }}
            style={({ pressed }) => [styles.googleBtn, pressed && { opacity: 0.9 }]}
          >
            <Ionicons name="logo-google" size={18} color={colors.onSurface} />
            <Text style={styles.googleText}>Continue with Google</Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={type.bodyMuted}>New here? </Text>
            <Link href="/(auth)/register" testID="go-register-link">
              <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium }}>Create account</Text>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xl },
  logo: {
    width: 36, height: 36, borderRadius: radius.md,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
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
  divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { color: colors.onSurfaceTertiary, fontFamily: font.textMedium, fontSize: 12 },
  googleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceTertiary, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 14, borderRadius: radius.md, marginTop: spacing.md,
  },
  googleText: { color: colors.onSurface, fontFamily: font.textMedium, fontSize: 15 },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
});
