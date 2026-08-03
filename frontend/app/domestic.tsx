/**
 * Domestic transfer — fully country-agnostic.
 *
 * Renders whatever the backend's /countries/{code}/schema says for the
 * user's own country (rail label, method picker, field set, currency).
 * Adding a new country's domestic rail is a backend-only change — this
 * screen never branches on a country code.
 */
import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { Screen, input } from "@/src/Screen";
import CountryForm, { CountrySchema } from "@/src/CountryForm";
import { colors, spacing, formatMoney } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

export default function Domestic() {
  const { user, refresh } = useAuth();
  const [schema, setSchema] = useState<CountrySchema | null>(null);
  const [recipientName, setRecipientName] = useState("");
  const [amount, setAmount] = useState("");
  const [ok, setOk] = useState<any>(null);

  // Onboarding guarantees a country is set before this screen is reachable;
  // this fallback only matters for pre-onboarding legacy states.
  const country = user?.country || "US";
  const num = parseFloat(amount) || 0;
  const balance = schema ? (user?.balances?.[schema.currency] ?? 0) : 0;

  const onSubmit = async ({ method_type, details }: { method_type: string; details: Record<string, string> }) => {
    if (!schema) throw new Error("Still loading — try again in a moment.");
    if (!recipientName.trim()) throw new Error("Recipient name is required.");
    if (num <= 0) throw new Error("Enter an amount.");
    if (num > balance) throw new Error(`Insufficient ${schema.currency} balance.`);

    const method = schema.methods.find((m) => m.type === method_type);
    const detailSummary = Object.entries(details).map(([, v]) => v).join(" · ");
    const r = await api<any>("/transfers", {
      method: "POST",
      body: {
        from_currency: schema.currency,
        to_currency: schema.currency,
        amount: num,
        recipient_name: recipientName.trim(),
        recipient_country: schema.name,
        note: `${schema.domestic?.label || method?.label || "Domestic transfer"} · ${detailSummary}`,
      },
    });
    setOk(r);
    await refresh();
  };

  if (ok) {
    return (
      <Screen title="Domestic Transfer" subtitle={schema ? `${schema.domestic?.label} · ${schema.name}` : undefined}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl }}>
          <Text style={{ fontSize: 40 }}>✅</Text>
          <Text style={{ marginTop: spacing.lg, color: colors.onSurface, fontSize: 17, textAlign: "center" }}>
            {formatMoney(ok.amount, schema?.currency || "USD")} sent to {recipientName}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Domestic Transfer"
      subtitle={schema ? `${schema.domestic?.label} · ${schema.name}` : "Loading…"}
    >
      <CountryForm
        country={country}
        submitLabel={num > 0 && schema ? `Send ${formatMoney(num, schema.currency)}` : "Send"}
        onSchemaLoaded={setSchema}
        extraHeader={
          <View style={{ marginBottom: spacing.md }}>
            <Text style={input.label}>Recipient name</Text>
            <TextInput
              testID="domestic-recipient"
              value={recipientName}
              onChangeText={setRecipientName}
              placeholder="Who are you sending to?"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />
            <Text style={[input.label, { marginTop: spacing.md }]}>
              Amount {schema ? `(${schema.currency})` : ""}
            </Text>
            <TextInput
              testID="domestic-amount"
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />
            {schema && (
              <Text style={{ color: colors.onSurfaceTertiary, marginTop: 4 }}>
                Available: {formatMoney(balance, schema.currency)}
              </Text>
            )}
          </View>
        }
        onSubmit={onSubmit}
      />
    </Screen>
  );
}
