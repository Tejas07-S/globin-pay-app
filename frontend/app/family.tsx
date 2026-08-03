import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";

export default function Family() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [fam, setFam] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [allowance, setAllowance] = useState("");
  const [fundAmt, setFundAmt] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setFam(await api("/family")); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try { setFam(await api("/family", { method: "POST", body: { name: name.trim() } })); } finally { setCreating(false); }
  };
  const addMember = async () => {
    setBusy(true);
    try {
      const r = await api("/family/add-member", { method: "POST", body: { member_email: memberEmail.trim(), allowance_usd: parseFloat(allowance) || 0 } });
      setFam(r); setAddOpen(false); setMemberEmail(""); setAllowance("");
    } finally { setBusy(false); }
  };
  const fund = async () => {
    setBusy(true);
    try {
      const r = await api("/family/fund", { method: "POST", body: { amount_usd: parseFloat(fundAmt) || 0 } });
      setFam(r); setFundOpen(false); setFundAmt(""); await refresh();
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="back-btn"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={type.h3}>Family wallet</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {loading && <ActivityIndicator color={colors.onSurface} />}
        {!loading && !fam && (
          <View style={styles.emptyCard} testID="family-empty">
            <View style={styles.emptyIcon}><Ionicons name="people" size={28} color={colors.brandPrimary} /></View>
            <Text style={[type.h3, { marginTop: spacing.md }]}>Start a family wallet</Text>
            <Text style={[type.bodyMuted, { textAlign: "center", marginTop: 4 }]}>
              Share money with your family. Set monthly allowances for kids and partners.
            </Text>
            <TextInput
              testID="family-name-input"
              value={name} onChangeText={setName}
              placeholder="Family name (e.g. The Does)" placeholderTextColor={colors.onSurfaceTertiary}
              style={[styles.input, { width: "100%", marginTop: spacing.md }]}
            />
            <Pressable onPress={create} disabled={creating} style={[styles.cta, { width: "100%" }, creating && { opacity: 0.5 }]} testID="family-create-btn">
              {creating ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Create family</Text>}
            </Pressable>
          </View>
        )}
        {fam && (
          <>
            <View style={styles.balanceCard}>
              <Text style={type.label}>{fam.name} · Shared balance</Text>
              <Text style={styles.big}>{formatMoney(fam.balance_usd, "USD")}</Text>
              <View style={styles.actions}>
                <Pressable onPress={() => setFundOpen(true)} style={styles.actionBtn} testID="family-fund-btn">
                  <Ionicons name="add" size={18} color={colors.brandPrimary} />
                  <Text style={styles.actionTxt}>Add funds</Text>
                </Pressable>
                <Pressable onPress={() => setAddOpen(true)} style={styles.actionBtn} testID="family-add-btn">
                  <Ionicons name="person-add" size={18} color={colors.brandPrimary} />
                  <Text style={styles.actionTxt}>Add member</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.section}>Members ({fam.members.length})</Text>
            {fam.members.map((m: any, i: number) => (
              <View key={i} style={styles.memberRow} testID={`family-member-${i}`}>
                <View style={styles.avatar}><Text style={{ fontFamily: font.textBold, color: colors.onSurface }}>{m.email.slice(0, 1).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontFamily: font.textMedium }]}>{m.email}</Text>
                  <Text style={type.small}>{m.role}</Text>
                </View>
                {m.allowance_usd > 0 && (
                  <View style={styles.allowPill}><Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 11 }}>${m.allowance_usd}/mo</Text></View>
                )}
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <SheetModal visible={addOpen} onClose={() => setAddOpen(false)} title="Add member">
        <TextInput testID="family-email-input" value={memberEmail} onChangeText={setMemberEmail} placeholder="member@email.com" placeholderTextColor={colors.onSurfaceTertiary} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
        <TextInput testID="family-allow-input" value={allowance} onChangeText={setAllowance} placeholder="Monthly allowance (USD)" placeholderTextColor={colors.onSurfaceTertiary} keyboardType="decimal-pad" style={styles.input} />
        <Pressable onPress={addMember} disabled={busy || !memberEmail} style={[styles.cta, (busy || !memberEmail) && { opacity: 0.5 }]} testID="family-add-submit">
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Add member</Text>}
        </Pressable>
      </SheetModal>

      <SheetModal visible={fundOpen} onClose={() => setFundOpen(false)} title="Add funds to family">
        <Text style={type.bodyMuted}>Available: {formatMoney(user?.balances?.USD || 0, "USD")}</Text>
        <TextInput testID="family-fund-input" value={fundAmt} onChangeText={setFundAmt} placeholder="Amount (USD)" placeholderTextColor={colors.onSurfaceTertiary} keyboardType="decimal-pad" style={styles.input} />
        <Pressable onPress={fund} disabled={busy || !fundAmt} style={[styles.cta, (busy || !fundAmt) && { opacity: 0.5 }]} testID="family-fund-submit">
          {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Transfer</Text>}
        </Pressable>
      </SheetModal>
    </View>
  );
}

function SheetModal({ visible, onClose, title, children }: any) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.grabber} />
          <Text style={[type.h3, { marginBottom: spacing.md }]}>{title}</Text>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  back: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  emptyCard: {
    alignItems: "center", padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandSecondary },
  balanceCard: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  big: { fontFamily: font.display, fontSize: 36, color: colors.onSurface, marginTop: 4 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, backgroundColor: colors.brandTertiary, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandSecondary },
  actionTxt: { color: colors.brandPrimary, fontFamily: font.textMedium },
  section: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  memberRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  allowPill: {
    paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary,
  },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, fontFamily: font.text, fontSize: 15, marginBottom: spacing.sm,
  },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.sm },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
});
