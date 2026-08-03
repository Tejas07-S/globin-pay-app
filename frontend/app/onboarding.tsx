/**
 * Global onboarding — required once per account before the dashboard.
 *
 * Country search/flags come from the existing /api/countries endpoint
 * (same data source used elsewhere — see countries.py). Nothing here is
 * country-specific business logic; it's just picking values that get
 * saved via POST /api/onboarding/complete.
 */
import { useEffect, useMemo, useState } from "react";
import {
  View, Text, TextInput, Pressable, FlatList, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

type Country = { code: string; name: string; flag: string; currency: string };

// Wallet currencies the app actually supports holding a balance in
// (mirrors backend `SUPPORTED` in server.py) — used only for the manual
// currency-override picker, not for any per-country business logic.
const WALLET_CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY", "AED", "AUD", "CAD", "SGD", "CHF", "CNY"];

const ACCOUNT_TYPES: { value: "personal" | "business" | "student"; label: string; icon: any }[] = [
  { value: "personal", label: "Personal", icon: "person-outline" },
  { value: "business", label: "Business", icon: "briefcase-outline" },
  { value: "student", label: "Student", icon: "school-outline" },
];

const BANK_TYPES: { value: "checking" | "savings" | "business" | "digital"; label: string; icon: any }[] = [
  { value: "checking", label: "Checking", icon: "card-outline" },
  { value: "savings", label: "Savings", icon: "wallet-outline" },
  { value: "business", label: "Business Account", icon: "briefcase-outline" },
  { value: "digital", label: "Digital Bank", icon: "phone-portrait-outline" },
];

const STEPS = ["Country", "Currency", "Account", "Bank"];

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useAuth();

  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [countries, setCountries] = useState<Country[]>([]);
  const [loadingCountries, setLoadingCountries] = useState(true);

  const [country, setCountry] = useState<Country | null>(null);
  const [currency, setCurrency] = useState<string>("");
  const [accountType, setAccountType] = useState<typeof ACCOUNT_TYPES[number]["value"] | null>(null);
  const [bankType, setBankType] = useState<typeof BANK_TYPES[number]["value"] | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoadingCountries(true);
    api<Country[]>(`/countries${query ? `?q=${encodeURIComponent(query)}` : ""}`)
      .then((c) => { if (!cancelled) setCountries(c); })
      .catch(() => { if (!cancelled) setCountries([]); })
      .finally(() => { if (!cancelled) setLoadingCountries(false); });
    return () => { cancelled = true; };
  }, [query]);

  function selectCountry(c: Country) {
    setCountry(c);
    setCurrency(c.currency); // auto-detect — user can still override on the next step
    setStep(1);
  }

  async function finish() {
    if (!country || !currency || !accountType || !bankType) return;
    setSubmitting(true);
    setErr("");
    try {
      await api("/onboarding/complete", {
        method: "POST",
        body: {
          country: country.code,
          preferred_currency: currency,
          account_type: accountType,
          bank_type: bankType,
        },
      });
      await refresh();
      router.replace("/welcome");
    } catch (e: any) {
      setErr(e.message || "Something went wrong — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canGoNext = useMemo(() => {
    if (step === 0) return !!country;
    if (step === 1) return !!currency;
    if (step === 2) return !!accountType;
    if (step === 3) return !!bankType;
    return false;
  }, [step, country, currency, accountType, bankType]);

  function next() {
    if (step === 3) { finish(); return; }
    setStep((s) => s + 1);
  }
  function back() {
    if (step === 0) return;
    setErr("");
    setStep((s) => s - 1);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <View style={styles.progressRow}>
          {STEPS.map((label, i) => (
            <View key={label} style={{ flex: 1, alignItems: "center" }}>
              <View style={[styles.dot, i <= step && styles.dotActive]} />
              <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {step === 0 && (
          <View style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
              <Text style={type.h2}>Where are you based?</Text>
              <Text style={[type.bodyMuted, { marginTop: 4 }]}>This sets your default currency and payment options.</Text>
              <View style={styles.searchBox}>
                <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} />
                <TextInput
                  testID="onboarding-country-search"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search country…"
                  placeholderTextColor={colors.onSurfaceTertiary}
                  style={styles.searchInput}
                  autoCapitalize="none"
                />
              </View>
            </View>
            {loadingCountries ? (
              <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.xl }} />
            ) : (
              <FlatList
                data={countries}
                keyExtractor={(c) => c.code}
                contentContainerStyle={{ padding: spacing.lg, paddingBottom: 40 }}
                renderItem={({ item }) => (
                  <Pressable
                    testID={`country-${item.code}`}
                    onPress={() => selectCountry(item)}
                    style={[styles.countryRow, country?.code === item.code && styles.countryRowActive]}
                  >
                    <Text style={{ fontSize: 22 }}>{item.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { fontFamily: font.textMedium }]}>{item.name}</Text>
                      <Text style={type.small}>{item.currency}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
                  </Pressable>
                )}
              />
            )}
          </View>
        )}

        {step === 1 && country && (
          <View style={{ padding: spacing.lg }}>
            <Text style={type.h2}>Your default currency</Text>
            <Text style={[type.bodyMuted, { marginTop: 4 }]}>
              Auto-selected based on {country.flag} {country.name}. You can change it if you&apos;d prefer another.
            </Text>
            <View style={styles.currencyHero}>
              <Text style={{ fontSize: 32, fontFamily: font.display, color: colors.onSurface }}>{currency}</Text>
              <Text style={type.small}>Primary wallet currency</Text>
            </View>
            <Text style={[input_label]}>Or choose a different currency</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm }}>
              {WALLET_CURRENCIES.map((c) => (
                <Pressable
                  key={c}
                  testID={`currency-${c}`}
                  onPress={() => setCurrency(c)}
                  style={[styles.chip, currency === c && styles.chipActive]}
                >
                  <Text style={[styles.chipTxt, currency === c && styles.chipTxtActive]}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={{ padding: spacing.lg }}>
            <Text style={type.h2}>Account type</Text>
            <Text style={[type.bodyMuted, { marginTop: 4 }]}>What best describes how you&apos;ll use GLOBiN Pay?</Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {ACCOUNT_TYPES.map((t) => (
                <Pressable
                  key={t.value}
                  testID={`account-type-${t.value}`}
                  onPress={() => setAccountType(t.value)}
                  style={[styles.optionRow, accountType === t.value && styles.optionRowActive]}
                >
                  <Ionicons name={t.icon} size={20} color={accountType === t.value ? colors.onBrandPrimary : colors.brandPrimary} />
                  <Text style={[styles.optionTxt, accountType === t.value && { color: colors.onBrandPrimary }]}>{t.label}</Text>
                  {accountType === t.value && <Ionicons name="checkmark-circle" size={18} color={colors.onBrandPrimary} />}
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={{ padding: spacing.lg }}>
            <Text style={type.h2}>Primary bank type</Text>
            <Text style={[type.bodyMuted, { marginTop: 4 }]}>You can link the actual account afterward — this just personalizes your setup.</Text>
            <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
              {BANK_TYPES.map((t) => (
                <Pressable
                  key={t.value}
                  testID={`bank-type-${t.value}`}
                  onPress={() => setBankType(t.value)}
                  style={[styles.optionRow, bankType === t.value && styles.optionRowActive]}
                >
                  <Ionicons name={t.icon} size={20} color={bankType === t.value ? colors.onBrandPrimary : colors.brandPrimary} />
                  <Text style={[styles.optionTxt, bankType === t.value && { color: colors.onBrandPrimary }]}>{t.label}</Text>
                  {bankType === t.value && <Ionicons name="checkmark-circle" size={18} color={colors.onBrandPrimary} />}
                </Pressable>
              ))}
            </View>
            {err ? <Text style={{ color: colors.error, marginTop: spacing.md }} testID="onboarding-err">{err}</Text> : null}
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {step > 0 && (
          <Pressable testID="onboarding-back" onPress={back} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.onSurface} />
          </Pressable>
        )}
        <Pressable
          testID="onboarding-next"
          onPress={next}
          disabled={!canGoNext || submitting}
          style={[styles.nextBtn, (!canGoNext || submitting) && { opacity: 0.4 }]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onBrandPrimary} />
          ) : (
            <Text style={styles.nextTxt}>{step === 3 ? "Finish setup" : "Continue"}</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const input_label = { fontFamily: font.textMedium, fontSize: 13, color: colors.onSurfaceSecondary, marginTop: spacing.lg };

const styles = StyleSheet.create({
  progressRow: { flexDirection: "row", gap: 4 },
  dot: { width: "100%", height: 3, borderRadius: 2, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brandPrimary },
  stepLabel: { fontSize: 10, color: colors.onSurfaceTertiary, marginTop: 6, fontFamily: font.text },
  stepLabelActive: { color: colors.brandPrimary, fontFamily: font.textMedium },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.lg,
  },
  searchInput: { flex: 1, color: colors.onSurface, fontFamily: font.text, fontSize: 15, paddingVertical: 4 },
  countryRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    borderRadius: radius.md, marginBottom: 6,
  },
  countryRowActive: { backgroundColor: colors.surfaceSecondary },
  currencyHero: {
    marginTop: spacing.lg, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.brandSecondary, padding: spacing.lg, alignItems: "center", gap: 4,
  },
  chip: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill,
    paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontFamily: font.textMedium, fontSize: 13 },
  chipTxtActive: { color: colors.onBrandPrimary },
  optionRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  optionRowActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  optionTxt: { flex: 1, color: colors.onSurface, fontFamily: font.textMedium, fontSize: 15 },
  footer: {
    flexDirection: "row", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  backBtn: {
    width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  nextBtn: { flex: 1, backgroundColor: colors.brandPrimary, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingVertical: 14 },
  nextTxt: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
});
