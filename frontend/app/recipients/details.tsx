/**
 * Add recipient — Step 2: name + country-aware account details.
 * Uses the shared CountryForm so behaviour matches Payment Methods.
 */
import { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, input } from "@/src/Screen";
import CountryForm from "@/src/CountryForm";
import { colors, spacing, type } from "@/src/theme";
import { api } from "@/src/api";

export default function RecipientDetails() {
  const router = useRouter();
  const { country, name, flag } = useLocalSearchParams<{ country: string; name: string; flag: string }>();
  const [recipientName, setRecipientName] = useState("");
  const [nickname, setNickname] = useState("");
  const [favorite, setFavorite] = useState(false);

  const onSubmit = async ({ method_type, details }: any) => {
    if (!recipientName.trim()) throw new Error("Recipient name is required");
    await api("/recipients/detailed", {
      method: "POST",
      body: { name: recipientName, country, method_type, details, nickname: nickname || undefined, favorite },
    });
    Alert.alert("✅ Recipient saved!", `${recipientName} is ready. Send them money anytime from the Recipients screen.`);
    router.replace("/recipients");
  };

  return (
    <Screen title="Recipient details" subtitle={`${flag} ${name} · Save without sending`}>
      <CountryForm
        country={country!}
        submitLabel="Save recipient"
        onSubmit={onSubmit}
        extraHeader={
          <View style={{ marginBottom: spacing.md, gap: 4 }}>
            <Text style={input.label}>Recipient&apos;s full name</Text>
            <TextInput
              testID="rec-name"
              value={recipientName} onChangeText={setRecipientName}
              placeholder="As on their bank record"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />
            <Text style={[input.label, { marginTop: spacing.md }]}>Nickname (optional)</Text>
            <TextInput
              testID="rec-nickname"
              value={nickname} onChangeText={setNickname}
              placeholder="e.g. Mom · Team · Landlord"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />
            <Pressable
              testID="rec-favorite"
              onPress={() => setFavorite(!favorite)}
              style={s.favRow}
            >
              <Ionicons name={favorite ? "star" : "star-outline"} size={18} color={favorite ? colors.warning : colors.onSurfaceTertiary} />
              <Text style={[type.body, { color: favorite ? colors.warning : colors.onSurface }]}>
                {favorite ? "★ Added to favorites" : "Add to favorites"}
              </Text>
            </Pressable>
          </View>
        }
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  favRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
});
