import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, formatMoney, flag } from "@/src/theme";

const STATUS_COLOR = { paid: colors.success, pending: colors.warning, overdue: colors.error } as any;

export default function Invoices() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);

  const [client, setClient] = useState("");
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [desc, setDesc] = useState("");

  const load = async () => {
    try { setItems(await api("/invoices")); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      await api("/invoices", {
        method: "POST",
        body: {
          client_name: client, client_email: email,
          amount: parseFloat(amount) || 0, currency,
          description: desc, due_days: 14,
        },
      });
      setShowNew(false); setClient(""); setEmail(""); setAmount(""); setDesc("");
      await load();
    } finally { setBusy(false); }
  };

  const markPaid = async (id: string) => {
    await api(`/invoices/${id}/mark-paid`, { method: "POST" });
    await load();
  };

  const totalPending = items.filter(i => i.status === "pending").reduce((s, i) => s + i.amount, 0);
  const totalPaid = items.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} testID="back-btn" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={type.h3}>Freelance Hub</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={[styles.statCard, { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary }]}>
            <Text style={[type.label, { color: colors.brandPrimary }]}>Total invoiced</Text>
            <Text style={[type.number, { fontSize: 22, color: colors.onSurface }]}>${(totalPending + totalPaid).toFixed(0)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={type.label}>Pending</Text>
            <Text style={[type.number, { fontSize: 22, color: colors.warning }]}>${totalPending.toFixed(0)}</Text>
          </View>
        </View>

        <Pressable testID="new-invoice-btn" onPress={() => setShowNew(true)} style={styles.banner}>
          <View style={styles.bannerIcon}><Ionicons name="add" size={22} color={colors.onBrandPrimary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontFamily: font.textBold, color: colors.onSurface }]}>Create new invoice</Text>
            <Text style={type.small}>Send a payment link in seconds</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.onSurfaceTertiary} />
        </Pressable>

        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Recent invoices</Text>
        {loading && <ActivityIndicator color={colors.onSurface} style={{ marginTop: spacing.lg }} />}
        {!loading && items.length === 0 && (
          <View style={styles.empty} testID="empty-invoices">
            <Ionicons name="document-outline" size={28} color={colors.onSurfaceTertiary} />
            <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>No invoices yet.</Text>
          </View>
        )}
        {items.map((inv) => (
          <View key={inv.id} style={styles.invRow} testID={`inv-${inv.id}`}>
            <View style={styles.invIcon}><Text style={{ fontSize: 18 }}>{flag[inv.currency] || "💼"}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontFamily: font.textMedium }]}>{inv.client_name}</Text>
              <Text style={type.small}>{inv.description}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[type.body, { fontFamily: font.textBold }]}>{formatMoney(inv.amount, inv.currency)}</Text>
              <View style={styles.pillRow}>
                <View style={[styles.pill, { borderColor: STATUS_COLOR[inv.status] + "66", backgroundColor: STATUS_COLOR[inv.status] + "22" }]}>
                  <Text style={{ color: STATUS_COLOR[inv.status], fontFamily: font.textMedium, fontSize: 11 }}>
                    {inv.status.toUpperCase()}
                  </Text>
                </View>
                {inv.status === "pending" && (
                  <Pressable testID={`mark-paid-${inv.id}`} onPress={() => markPaid(inv.id)} style={styles.markBtn}>
                    <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 11 }}>Mark paid</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={showNew} transparent animationType="slide" onRequestClose={() => setShowNew(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setShowNew(false)} />
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={[type.h3, { marginBottom: spacing.md }]}>New invoice</Text>
            <TextInput testID="inv-client" value={client} onChangeText={setClient} placeholder="Client name" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} />
            <TextInput testID="inv-email" value={email} onChangeText={setEmail} placeholder="Client email" placeholderTextColor={colors.onSurfaceTertiary} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TextInput testID="inv-amount" value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { flex: 1 }]} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {["USD", "EUR", "GBP", "INR"].map((c) => (
                  <Pressable key={c} onPress={() => setCurrency(c)} style={[styles.curChip, currency === c && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]} testID={`inv-cur-${c}`}>
                    <Text style={{ color: currency === c ? colors.onBrandPrimary : colors.onSurface, fontFamily: font.textMedium }}>{c}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            <TextInput testID="inv-desc" value={desc} onChangeText={setDesc} placeholder="Description" placeholderTextColor={colors.onSurfaceTertiary} style={[styles.input, { height: 60 }]} multiline />
            <Pressable
              testID="inv-create-btn"
              onPress={create}
              disabled={busy || !client || !email || !amount}
              style={[styles.cta, (busy || !client || !email || !amount) && { opacity: 0.4 }]}
            >
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Create & share link</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
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
  statCard: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  banner: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginTop: spacing.md,
  },
  bannerIcon: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginBottom: spacing.sm },
  empty: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary, padding: spacing.xl, alignItems: "center",
  },
  invRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm,
  },
  invIcon: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  pillRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  pill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, borderWidth: 1 },
  markBtn: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandSecondary,
  },
  sheet: {
    backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    fontFamily: font.text, fontSize: 15, marginBottom: spacing.sm,
  },
  curChip: {
    paddingHorizontal: spacing.md, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
  },
  cta: {
    backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md,
    alignItems: "center", marginTop: spacing.md,
  },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
});
