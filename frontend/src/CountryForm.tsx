/**
 * Reusable country-aware form for adding a Payment Method or Recipient.
 * - Fetches country schema from /api/countries/{code}/schema
 * - Renders a picker for method_type (bank / upi) if multiple available
 * - Renders each field with inline "?" help that calls /api/finn/explain-term
 */
import React, { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { cta, input } from "@/src/Screen";
import { api } from "@/src/api";

export type MethodSchema = {
  type: string; label: string; icon?: string;
  fields: Array<{
    key: string; label: string; placeholder?: string; help?: string;
    keyboard?: string; min?: number; max?: number; auto?: "upper" | "lower";
    select?: Array<{ value: string; label: string }>; default?: string;
  }>;
};
export type CountrySchema = {
  code: string; name: string; flag: string; currency: string;
  domestic?: { method_type: string; label: string };
  methods: MethodSchema[];
  popular_banks?: Array<{ slug: string; name: string }>;
};

type Props = {
  country: string;
  submitLabel: string;
  extraHeader?: React.ReactNode;
  extraFields?: React.ReactNode;
  onSubmit: (payload: { method_type: string; details: Record<string, string> }) => Promise<void>;
  onSchemaLoaded?: (schema: CountrySchema) => void;
  submitting?: boolean;
  showBankPicker?: boolean;
};

export default function CountryForm({ country, submitLabel, extraHeader, extraFields, onSubmit, onSchemaLoaded, submitting, showBankPicker }: Props) {
  const [schema, setSchema] = useState<CountrySchema | null>(null);
  const [methodType, setMethodType] = useState<string>("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [helpTerm, setHelpTerm] = useState<string | null>(null);
  const [helpAnswer, setHelpAnswer] = useState<string>("");

  useEffect(() => {
    api<CountrySchema>(`/countries/${country}/schema`).then((s) => {
      setSchema(s);
      onSchemaLoaded?.(s);
      if (s.methods.length > 0) {
        setMethodType(s.methods[0].type);
        const initial: Record<string, string> = {};
        s.methods[0].fields.forEach((f) => { if (f.default) initial[f.key] = f.default; });
        setValues(initial);
      }
    }).catch((e) => setErr(String(e.message || e)));
  }, [country, onSchemaLoaded]);

  const activeMethod = schema?.methods.find((m) => m.type === methodType);

  const explain = async (label: string, term?: string) => {
    const q = term || label;
    setHelpTerm(label);
    setHelpAnswer("");
    try {
      const r = await api<{ answer: string }>("/finn/explain-term", { method: "POST", body: { term: q } });
      setHelpAnswer(r.answer);
    } catch { setHelpAnswer("Couldn't fetch help right now."); }
  };

  const submit = async () => {
    setErr("");
    if (!activeMethod) return;
    for (const f of activeMethod.fields) {
      if (f.select) continue;
      const v = (values[f.key] || "").trim();
      if (!v) { setErr(`${f.label} is required.`); return; }
      const cleaned = v.replace(/[\s-]/g, "");
      if (f.min && cleaned.length < f.min) { setErr(`${f.label} looks too short.`); return; }
    }
    setBusy(true);
    try {
      await onSubmit({ method_type: methodType, details: values });
    } catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(false); }
  };

  if (!schema) return <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.onSurface} />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {extraHeader}

        <View style={s.countryBadge}>
          <Text style={{ fontSize: 22 }}>{schema.flag}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontFamily: font.textBold }]}>{schema.name}</Text>
            <Text style={type.small}>Currency: {schema.currency}</Text>
          </View>
        </View>

        {schema.methods.length > 1 && (
          <View style={{ marginTop: spacing.lg }}>
            <Text style={input.label}>How do you want to add it?</Text>
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              {schema.methods.map((m) => (
                <Pressable
                  key={m.type}
                  testID={`method-${m.type}`}
                  onPress={() => { setMethodType(m.type); setValues({}); }}
                  style={[s.chip, methodType === m.type && s.chipActive]}
                >
                  <Text style={[s.chipTxt, methodType === m.type && { color: colors.onBrandPrimary }]}>
                    {m.type === "upi" ? "📱 UPI ID" : `🏦 ${m.label}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {extraFields}

        <View style={{ marginTop: spacing.lg }}>
          {activeMethod?.fields.map((f) => (
            <View key={f.key} style={{ marginTop: spacing.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={input.label}>{f.label}</Text>
                {f.help && (
                  <Pressable testID={`help-${f.key}`} onPress={() => explain(f.label, f.key.toUpperCase())} style={s.helpBtn}>
                    <Ionicons name="help-circle-outline" size={16} color={colors.brandPrimary} />
                    <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 11 }}>What&apos;s this?</Text>
                  </Pressable>
                )}
              </View>
              {f.select ? (
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 6 }}>
                  {f.select.map((o) => (
                    <Pressable
                      key={o.value}
                      testID={`select-${f.key}-${o.value}`}
                      onPress={() => setValues({ ...values, [f.key]: o.value })}
                      style={[s.chip, values[f.key] === o.value && s.chipActive]}
                    >
                      <Text style={[s.chipTxt, values[f.key] === o.value && { color: colors.onBrandPrimary }]}>{o.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <TextInput
                  testID={`field-${f.key}`}
                  value={values[f.key] || ""}
                  onChangeText={(t) => {
                    let v = t;
                    if (f.auto === "upper") v = v.toUpperCase();
                    if (f.auto === "lower") v = v.toLowerCase();
                    if (f.max) v = v.slice(0, f.max + 4);
                    setValues({ ...values, [f.key]: v });
                  }}
                  placeholder={f.placeholder}
                  placeholderTextColor={colors.onSurfaceTertiary}
                  autoCapitalize={f.auto === "upper" ? "characters" : f.auto === "lower" ? "none" : "sentences"}
                  keyboardType={(f.keyboard as any) || "default"}
                  style={input.field}
                />
              )}
              {f.help && <Text style={s.hint}>{f.help}</Text>}
            </View>
          ))}
        </View>

        {err && <Text style={{ color: colors.error, marginTop: spacing.md }} testID="form-err">{err}</Text>}

        <Pressable
          testID="form-submit"
          onPress={submit}
          disabled={busy || submitting}
          style={[cta.btn, { marginTop: spacing.xl, opacity: (busy || submitting) ? 0.6 : 1 }]}
        >
          {(busy || submitting) ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>{submitLabel}</Text>}
        </Pressable>
      </ScrollView>

      <Modal transparent visible={!!helpTerm} animationType="fade" onRequestClose={() => setHelpTerm(null)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <Text style={{ fontSize: 22 }}>✨</Text>
              <Text style={type.h3}>Finn explains</Text>
            </View>
            <Text style={[type.body, { fontFamily: font.textBold, marginTop: spacing.sm }]}>{helpTerm}</Text>
            {helpAnswer
              ? <Text style={[type.bodyMuted, { marginTop: 6 }]}>{helpAnswer}</Text>
              : <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.md }} />}
            <Pressable
              testID="help-close"
              onPress={() => setHelpTerm(null)}
              style={[cta.btn, { marginTop: spacing.lg }]}
            >
              <Text style={cta.txt}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  countryBadge: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  chip: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipTxt: { color: colors.onSurface, fontFamily: font.textMedium, fontSize: 13 },
  helpBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2 },
  hint: { color: colors.onSurfaceTertiary, fontFamily: font.text, fontSize: 11, marginTop: 4 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: "100%", maxWidth: 380, borderWidth: 1, borderColor: colors.brandSecondary },
});
