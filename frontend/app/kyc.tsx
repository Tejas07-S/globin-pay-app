import { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";

const DOC_TYPES = [
  { key: "passport", label: "Passport", icon: "airplane" },
  { key: "national_id", label: "National ID", icon: "card" },
  { key: "driving_license", label: "Driving License", icon: "car" },
  { key: "aadhaar", label: "Aadhaar", icon: "shield" },
];

export default function KYC() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [docType, setDocType] = useState("passport");
  const [docNumber, setDocNumber] = useState("");
  const [country, setCountry] = useState("");
  const [dob, setDob] = useState("");
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null); setLoading(true);
    try {
      await api("/kyc", {
        method: "POST",
        body: { doc_type: docType, doc_number: docNumber, country, date_of_birth: dob, address },
      });
      await refresh();
      setDone(true);
    } catch (e: any) {
      setErr(e.message || "KYC submission failed");
    } finally { setLoading(false); }
  };

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
        <View style={styles.successCircle}>
          <Ionicons name="shield-checkmark" size={44} color={colors.brandPrimary} />
        </View>
        <Text style={[type.h1, { marginTop: spacing.lg }]}>Verified</Text>
        <Text style={[type.bodyMuted, { textAlign: "center", marginTop: spacing.sm }]}>
          Your identity is confirmed. Higher limits are now unlocked.
        </Text>
        <Pressable testID="kyc-done-btn" onPress={() => router.replace("/(tabs)/wallet")} style={[styles.cta, { marginTop: spacing.xl, paddingHorizontal: 40 }]}>
          <Text style={styles.ctaText}>Back to wallet</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} testID="back-btn" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={type.h3}>Verify identity</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View style={styles.progress}>
          <View style={[styles.progressBar, { width: `${(step + 1) * 50}%` }]} />
        </View>
        <Text style={type.label}>Step {step + 1} of 2</Text>

        {step === 0 ? (
          <>
            <Text style={[type.h2, { marginTop: spacing.sm }]}>Choose document</Text>
            <Text style={[type.bodyMuted, { marginBottom: spacing.lg }]}>Pick an identity document to continue.</Text>
            <View style={{ gap: spacing.sm }}>
              {DOC_TYPES.map((d) => (
                <Pressable
                  key={d.key} testID={`doc-${d.key}`}
                  onPress={() => setDocType(d.key)}
                  style={[styles.docCard, docType === d.key && styles.docCardActive]}
                >
                  <View style={styles.docIcon}><Ionicons name={d.icon as any} size={20} color={colors.brandPrimary} /></View>
                  <Text style={[type.body, { flex: 1, fontFamily: font.textMedium }]}>{d.label}</Text>
                  {docType === d.key && <Ionicons name="checkmark-circle" size={20} color={colors.brandPrimary} />}
                </Pressable>
              ))}
            </View>
            <Pressable testID="kyc-next-btn" onPress={() => setStep(1)} style={[styles.cta, { marginTop: spacing.xl }]}>
              <Text style={styles.ctaText}>Continue</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={[type.h2, { marginTop: spacing.sm }]}>Your details</Text>
            <Text style={[type.bodyMuted, { marginBottom: spacing.lg }]}>Enter the info on your document.</Text>

            <Text style={styles.label}>Document number</Text>
            <TextInput testID="doc-number" value={docNumber} onChangeText={setDocNumber} placeholder="AB1234567" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} />

            <Text style={styles.label}>Country</Text>
            <TextInput testID="doc-country" value={country} onChangeText={setCountry} placeholder="United States" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} />

            <Text style={styles.label}>Date of birth</Text>
            <TextInput testID="doc-dob" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} />

            <Text style={styles.label}>Address</Text>
            <TextInput testID="doc-address" value={address} onChangeText={setAddress} placeholder="Full address" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { height: 80 }]} multiline />

            <View style={styles.selfieNote}>
              <Ionicons name="sparkles" size={14} color={colors.brandPrimary} />
              <Text style={[type.small, { color: colors.brandPrimary, flex: 1 }]}>
                Selfie & liveness check simulated — auto-verified for demo.
              </Text>
            </View>

            {err && <Text testID="kyc-err" style={{ color: colors.error, marginTop: spacing.sm }}>{err}</Text>}

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Pressable testID="kyc-back-btn" onPress={() => setStep(0)} style={[styles.cta, styles.ctaSecondary, { flex: 1 }]}>
                <Text style={[styles.ctaText, { color: colors.onSurface }]}>Back</Text>
              </Pressable>
              <Pressable
                testID="kyc-submit-btn"
                onPress={submit}
                disabled={loading || !docNumber || !country || !dob || !address}
                style={[styles.cta, { flex: 2 }, (loading || !docNumber || !country || !dob || !address) && { opacity: 0.4 }]}
              >
                {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Submit</Text>}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
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
  progress: { height: 4, backgroundColor: colors.surfaceSecondary, borderRadius: 2, marginBottom: spacing.sm },
  progressBar: { height: 4, backgroundColor: colors.brandPrimary, borderRadius: 2 },
  docCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  docCardActive: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
  docIcon: {
    width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center",
  },
  label: { ...type.label, marginTop: spacing.md, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    fontFamily: font.text, fontSize: 15,
  },
  selfieNote: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.brandTertiary, padding: spacing.md,
    borderRadius: radius.md, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.brandSecondary,
  },
  cta: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md,
    alignItems: "center",
  },
  ctaSecondary: { backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
  successCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.brandSecondary,
  },
});
