/**
 * Manually add a payment method — country-aware form.
 */
import { useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Screen, input } from "@/src/Screen";
import CountryForm from "@/src/CountryForm";
import { colors, spacing } from "@/src/theme";
import { api } from "@/src/api";

export default function AddManually() {
  const router = useRouter();
  const { country, name, flag } = useLocalSearchParams<{ country: string; name: string; flag: string }>();
  const [holder, setHolder] = useState("");
  const [nickname, setNickname] = useState("");

  const onSubmit = async ({ method_type, details }: any) => {
    if (!holder.trim()) throw new Error("Account holder name is required");
    const pm = await api<{ id: string }>("/payment-methods", {
      method: "POST",
      body: { country, method_type, holder_name: holder, nickname: nickname || undefined, details, linked_via: "manual" },
    });
    router.replace({ pathname: "/payment-methods/verify", params: { id: pm.id, display: "Just added" } as any });
  };

  return (
    <Screen title="Add manually" subtitle={`${flag} ${name} · Step 3 of 3`}>
      <CountryForm
        country={country!}
        submitLabel="Save & verify"
        onSubmit={onSubmit}
        extraFields={
          <View style={{ marginTop: spacing.lg }}>
            <Text style={input.label}>Account holder name</Text>
            <TextInput
              testID="holder-name"
              value={holder} onChangeText={setHolder}
              placeholder="As it appears on the bank record"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />
            <Text style={[input.label, { marginTop: spacing.md }]}>Nickname (optional)</Text>
            <TextInput
              testID="nickname"
              value={nickname} onChangeText={setNickname}
              placeholder="e.g. Salary · Savings · Business"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />
          </View>
        }
      />
    </Screen>
  );
}
