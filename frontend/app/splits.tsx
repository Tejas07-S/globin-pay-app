import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";

export default function Splits() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [participants, setParticipants] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try { setItems(await api("/splits")); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true);
    try {
      const parts = participants.split(",").map((s) => s.trim()).filter(Boolean);
      await api("/splits", { method: "POST", body: { title, total: parseFloat(total) || 0, currency: "USD", participants: parts } });
      setOpen(false); setTitle(""); setTotal(""); setParticipants("");
      await load();
    } finally { setBusy(false); }
  };

  const toggle = async (split_id: string, name: string) => {
    await api(`/splits/${split_id}/mark?name=${encodeURIComponent(name)}`, { method: "POST" });
    await load();
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="back-btn"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={type.h3}>Split bills</Text>
        <Pressable onPress={() => setOpen(true)} style={styles.plus} testID="split-new-btn"><Ionicons name="add" size={22} color={colors.onBrandPrimary} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {loading && <ActivityIndicator color={colors.onSurface} />}
        {!loading && items.length === 0 && (
          <View style={styles.empty} testID="split-empty">
            <Ionicons name="receipt-outline" size={28} color={colors.onSurfaceTertiary} />
            <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>No splits yet. Tap + to add one.</Text>
          </View>
        )}
        {items.map((it) => (
          <View key={it.id} style={styles.card} testID={`split-${it.id}`}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[type.body, { fontFamily: font.textBold }]}>{it.title}</Text>
              <Text style={[type.body, { fontFamily: font.textBold }]}>{formatMoney(it.total, it.currency)}</Text>
            </View>
            <Text style={type.small}>{it.participants.length} people · {formatMoney(it.share_each, it.currency)} each</Text>
            <View style={{ marginTop: spacing.sm, gap: 6 }}>
              {it.participants.map((p: any, i: number) => (
                <Pressable key={i} onPress={() => toggle(it.id, p.name)} style={styles.partRow} testID={`split-${it.id}-part-${i}`}>
                  <View style={[styles.check, p.paid && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                    {p.paid && <Ionicons name="checkmark" size={12} color={colors.onBrandPrimary} />}
                  </View>
                  <Text style={[type.body, { flex: 1, textDecorationLine: p.paid ? "line-through" : "none", color: p.paid ? colors.onSurfaceTertiary : colors.onSurface }]}>{p.name}</Text>
                  <Text style={[type.small, { color: p.paid ? colors.brandPrimary : colors.warning, fontFamily: font.textMedium }]}>
                    {p.paid ? "Paid" : "Owes"}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.grabber} />
            <Text style={[type.h3, { marginBottom: spacing.md }]}>New split</Text>
            <TextInput testID="split-title" value={title} onChangeText={setTitle} placeholder="Dinner at Sushi Ryu" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} />
            <TextInput testID="split-total" value={total} onChangeText={setTotal} placeholder="Total amount (USD)" keyboardType="decimal-pad" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} />
            <TextInput testID="split-parts" value={participants} onChangeText={setParticipants} placeholder="Names, comma-separated (Alice, Bob, Charlie)" placeholderTextColor={colors.onSurfaceTertiary} style={styles.input} multiline />
            <Pressable onPress={create} disabled={busy || !title || !total || !participants} style={[styles.cta, (busy || !title || !total || !participants) && { opacity: 0.5 }]} testID="split-create">
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Create split</Text>}
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
  back: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  plus: {
    width: 40, height: 40, borderRadius: radius.pill, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  empty: {
    borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary, padding: spacing.xl, alignItems: "center",
  },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md,
  },
  partRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
  },
  check: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  sheet: {
    backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, fontFamily: font.text, fontSize: 15, marginBottom: spacing.sm,
  },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 16, borderRadius: radius.md, alignItems: "center", marginTop: spacing.sm },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 16 },
});
