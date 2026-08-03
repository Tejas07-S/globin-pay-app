/**
 * Payment Methods list — user's own linked banks / UPI / wallets.
 * Also the entry point for adding a new method and cash-out (withdraw).
 */
import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator, Modal, TextInput } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { api } from "@/src/api";

type PM = {
  id: string; country: string; flag: string; currency: string;
  method_type: string; holder_name: string; nickname?: string;
  bank_name?: string; display: string; last4: string;
  verified: boolean; is_default: boolean; linked_via: string;
  verification_method?: string;
};

export default function PaymentMethodsScreen() {
  const router = useRouter();
  const [methods, setMethods] = useState<PM[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstTime, setFirstTime] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pm, st] = await Promise.all([
        api<{ methods: PM[] }>("/payment-methods"),
        api<{ first_time: boolean }>("/onboarding/payment-status"),
      ]);
      setMethods(pm.methods);
      setFirstTime(st.first_time);
    } finally { setLoading(false); }
  };

  useFocusEffect(useCallback(() => { load(); }, []));

  const remove = (m: PM) => {
    Alert.alert("Remove payment method?",
      `${m.nickname || m.bank_name} ${m.display} — you can add it back anytime.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: async () => {
          await api(`/payment-methods/${m.id}`, { method: "DELETE" });
          load();
        }},
      ]);
  };

  const setDefault = async (m: PM) => {
    await api(`/payment-methods/${m.id}/default`, { method: "POST" });
    load();
  };

  return (
    <Screen title="Payment Methods" subtitle="Your linked banks, UPI & wallets">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
        {loading && <ActivityIndicator color={colors.onSurface} />}

        {!loading && methods && methods.length === 0 && (
          <View style={s.empty} testID="pm-empty">
            <Text style={{ fontSize: 48 }}>👋</Text>
            <Text style={[type.h3, { marginTop: spacing.sm, textAlign: "center" }]}>
              Let&apos;s connect your first Payment Method
            </Text>
            <Text style={[type.bodyMuted, { textAlign: "center", marginTop: spacing.xs }]}>
              Link a bank, UPI ID, or card so you can top up or cash out anytime.
            </Text>
            <Pressable
              testID="pm-add-first"
              onPress={() => router.push("/payment-methods/add")}
              style={[cta.btn, { marginTop: spacing.lg, alignSelf: "stretch" }]}>
              <Text style={cta.txt}>+ Add Payment Method</Text>
            </Pressable>
            {firstTime && (
              <Pressable
                testID="pm-add-recipient"
                onPress={() => router.push("/recipients/add")}
                style={{ marginTop: spacing.md, paddingVertical: 12 }}>
                <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, textAlign: "center" }}>
                  Or add someone you want to send money to →
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {methods && methods.length > 0 && (
          <>
            {methods.map((m) => (
              <MethodCard key={m.id} m={m} onDefault={setDefault} onRemove={remove}
                onVerify={() => router.push({ pathname: "/payment-methods/verify", params: { id: m.id, display: m.display } as any })}
                onWithdraw={() => router.push({ pathname: "/withdraw", params: { id: m.id } as any })}
                onRename={(pid: string, nick: string) => api(`/payment-methods/${pid}/nickname`, { method: "POST", body: { nickname: nick } }).then(load)}
              />
            ))}
            <Pressable
              testID="pm-add-more"
              onPress={() => router.push("/payment-methods/add")}
              style={s.addRow}>
              <View style={s.plusIcon}><Ionicons name="add" size={22} color={colors.brandPrimary} /></View>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>Add another payment method</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.onSurfaceTertiary} />
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function MethodCard({ m, onDefault, onRemove, onVerify, onWithdraw, onRename }: any) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [nick, setNick] = useState(m.nickname || "");

  return (
    <View style={s.card} testID={`pm-${m.id}`}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
        <View style={s.badge}>
          <Text style={{ fontSize: 22 }}>{iconFor(m.method_type, m.flag)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={[type.body, { fontFamily: font.textBold }]}>
              {m.nickname || `${m.bank_name || m.country} ${labelFor(m.method_type)}`}
            </Text>
            {m.is_default && <Pill label="DEFAULT" color={colors.brandPrimary} />}
            {m.verified
              ? <Pill label="VERIFIED" color={colors.brandPrimary} icon="checkmark-circle" />
              : <Pill label="PENDING" color={colors.warning} icon="time-outline" />}
          </View>
          <Text style={type.small}>{m.flag} {m.country} · {m.currency} · {m.display}</Text>
          <Text style={type.small}>{m.holder_name} · {m.linked_via === "link" ? "Linked via bank" : "Added manually"}</Text>
        </View>
        <Pressable testID={`pm-rename-${m.id}`} onPress={() => setRenameOpen(true)} style={s.iconBtn}>
          <Ionicons name="create-outline" size={16} color={colors.onSurfaceTertiary} />
        </Pressable>
      </View>

      <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" }}>
        {!m.verified && (
          <Pressable testID={`pm-verify-${m.id}`} onPress={onVerify} style={[s.actionBtn, { borderColor: colors.warning }]}>
            <Ionicons name="shield-checkmark-outline" size={14} color={colors.warning} />
            <Text style={{ color: colors.warning, fontFamily: font.textMedium, fontSize: 12 }}>Verify</Text>
          </Pressable>
        )}
        {m.verified && (
          <Pressable testID={`pm-withdraw-${m.id}`} onPress={onWithdraw} style={[s.actionBtn, { borderColor: colors.brandPrimary }]}>
            <Ionicons name="arrow-down-outline" size={14} color={colors.brandPrimary} />
            <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 12 }}>Withdraw</Text>
          </Pressable>
        )}
        {!m.is_default && (
          <Pressable testID={`pm-default-${m.id}`} onPress={() => onDefault(m)} style={s.actionBtn}>
            <Ionicons name="star-outline" size={14} color={colors.onSurface} />
            <Text style={{ color: colors.onSurface, fontFamily: font.textMedium, fontSize: 12 }}>Set default</Text>
          </Pressable>
        )}
        <Pressable testID={`pm-remove-${m.id}`} onPress={() => onRemove(m)} style={[s.actionBtn, { borderColor: colors.error }]}>
          <Ionicons name="trash-outline" size={14} color={colors.error} />
          <Text style={{ color: colors.error, fontFamily: font.textMedium, fontSize: 12 }}>Remove</Text>
        </Pressable>
      </View>

      <Modal transparent visible={renameOpen} animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={s.modalBg}>
          <View style={s.modalCard}>
            <Text style={type.h3}>Rename payment method</Text>
            <Text style={[type.small, { marginBottom: spacing.md }]}>Give it a nickname like &ldquo;Salary&rdquo; or &ldquo;Business&rdquo;</Text>
            <TextInput
              testID={`pm-rename-input-${m.id}`}
              value={nick}
              onChangeText={setNick}
              placeholder="Nickname"
              placeholderTextColor={colors.onSurfaceTertiary}
              style={input.field}
            />
            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
              <Pressable onPress={() => setRenameOpen(false)} style={[cta.btn, { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>
                <Text style={[cta.txt, { color: colors.onSurface }]}>Cancel</Text>
              </Pressable>
              <Pressable
                testID={`pm-rename-save-${m.id}`}
                onPress={async () => { await onRename(m.id, nick); setRenameOpen(false); }}
                style={[cta.btn, { flex: 1 }]}>
                <Text style={cta.txt}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Pill({ label, color, icon }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: `${color}22`, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
      {icon && <Ionicons name={icon} size={11} color={color} />}
      <Text style={{ color, fontFamily: font.textBold, fontSize: 10 }}>{label}</Text>
    </View>
  );
}

function iconFor(t: string, flag: string) {
  if (t === "upi") return "📱";
  if (t === "card") return "💳";
  if (t === "wallet") return flag;
  return "🏦";
}
function labelFor(t: string) {
  return t === "upi" ? "UPI" : t === "card" ? "Card" : t === "wallet" ? "Wallet" : "Bank";
}

const s = StyleSheet.create({
  empty: { alignItems: "center", padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginTop: spacing.lg },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  badge: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  addRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  plusIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.brandTertiary },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: colors.border },
});
