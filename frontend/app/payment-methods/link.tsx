/**
 * Link Bank flow — pick a popular bank, mock "Login securely" screen,
 * then hit /payment-methods/link and land back on the list.
 * When Plaid/Setu keys become available this is where we swap in the
 * real integration.
 */
import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { api } from "@/src/api";

type Bank = { slug: string; name: string };

export default function LinkBank() {
  const router = useRouter();
  const { country, name: countryName, flag } = useLocalSearchParams<{ country: string; name: string; flag: string }>();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [picked, setPicked] = useState<Bank | null>(null);
  const [flags, setFlags] = useState<{ plaid: boolean; setu: boolean }>({ plaid: false, setu: false });
  const [holder, setHolder] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [step, setStep] = useState<"pick" | "login">("pick");

  useEffect(() => {
    api<any>(`/countries/${country}/schema`).then((s) => {
      setBanks(s.popular_banks || []);
      setFlags(s.flags || { plaid: false, setu: false });
    });
  }, [country]);

  const submit = async () => {
    if (!picked || !holder.trim()) { setErr("Enter the account holder name"); return; }
    setBusy(true); setErr("");
    try {
      await api("/payment-methods/link", {
        method: "POST",
        body: {
          country, bank_slug: picked.slug, bank_name: picked.name,
          holder_name: holder,
        },
      });
      router.replace("/payment-methods");
    } catch (e: any) { setErr(e.message || "Link failed"); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Link Bank" subtitle={`${flag} ${countryName} · Step 3 of 3`}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {step === "pick" ? (
          <>
            <View style={s.info}>
              <Ionicons name="lock-closed" size={16} color={colors.brandPrimary} />
              <Text style={[type.small, { flex: 1 }]}>
                Bank-linking uses your bank&apos;s own login. GLOBiN pay never sees your password.
                {!flags.plaid && country === "US" ? " (Currently simulated — flip USE_PLAID once keys are set.)" : ""}
                {!flags.setu  && country === "IN" ? " (Currently simulated — flip USE_SETU once keys are set.)" : ""}
              </Text>
            </View>
            <Text style={[type.body, { fontFamily: font.textBold, marginTop: spacing.lg, marginBottom: spacing.sm }]}>
              Choose your bank
            </Text>
            {banks.length === 0 && <ActivityIndicator color={colors.onSurface} />}
            {banks.map((b) => (
              <Pressable
                key={b.slug}
                testID={`bank-${b.slug}`}
                onPress={() => { setPicked(b); setStep("login"); }}
                style={s.row}
              >
                <View style={s.logo}><Text style={{ color: colors.brandPrimary, fontFamily: font.textBold, fontSize: 14 }}>{b.name.slice(0, 2).toUpperCase()}</Text></View>
                <Text style={[type.body, { fontFamily: font.textMedium, flex: 1 }]}>{b.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
              </Pressable>
            ))}
          </>
        ) : (
          <>
            <View style={s.bankHead}>
              <View style={s.logo}><Text style={{ color: colors.brandPrimary, fontFamily: font.textBold, fontSize: 14 }}>{picked?.name.slice(0, 2).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={type.h3}>{picked?.name}</Text>
                <Text style={type.small}>Secure sign-in · You&apos;ll be back in seconds</Text>
              </View>
            </View>
            <View style={s.info}>
              <Ionicons name="shield-checkmark" size={16} color={colors.brandPrimary} />
              <Text style={[type.small, { flex: 1 }]}>
                In production this opens your bank&apos;s login inside a secure webview. For this demo we just capture your name.
              </Text>
            </View>

            <Text style={[input.label, { marginTop: spacing.lg }]}>Account holder name</Text>
            <TextInput
              testID="holder-name"
              value={holder} onChangeText={setHolder}
              placeholder="Your full name as per bank"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />

            {err && <Text style={{ color: colors.error, marginTop: spacing.sm }} testID="link-err">{err}</Text>}

            <Pressable
              testID="link-connect"
              onPress={submit}
              disabled={busy}
              style={[cta.btn, { marginTop: spacing.xl, opacity: busy ? 0.6 : 1 }]}
            >
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>🔐 Connect securely</Text>}
            </Pressable>
            <Pressable testID="link-back" onPress={() => setStep("pick")} style={{ marginTop: spacing.md, paddingVertical: 10 }}>
              <Text style={{ color: colors.onSurfaceTertiary, fontFamily: font.textMedium, textAlign: "center" }}>Choose a different bank</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  info: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.brandSecondary },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  logo: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandSecondary },
  bankHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
});
