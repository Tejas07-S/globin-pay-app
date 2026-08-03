import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Share, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";

export default function Referral() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { refresh } = useAuth();
  const [data, setData] = useState<any>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { setData(await api("/referral/me")); } catch {}
  };
  useEffect(() => { load(); }, []);

  const redeem = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api<any>("/referral/redeem", { method: "POST", body: { code: code.trim().toUpperCase() } });
      setMsg(`+$${r.credited_usd} credited to your USD wallet`);
      setCode("");
      await refresh(); await load();
    } catch (e: any) { setErr(e.message || "Redeem failed"); }
    finally { setBusy(false); }
  };

  const share = async () => {
    if (!data?.code) return;
    const message = `Join me on GLOBiN pay and we both get $5. Use my code ${data.code}. Download: https://globin.pay`;
    if (Platform.OS === "web") {
      try {
        if (typeof navigator !== "undefined" && (navigator as any).share) {
          await (navigator as any).share({ text: message });
        } else if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(message);
          setMsg("Copied invite link to clipboard");
        }
      } catch {}
    } else {
      try { await Share.share({ message }); } catch {}
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} style={styles.back} testID="back-btn"><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={type.h3}>Refer & earn</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        <View style={styles.hero}>
          <View style={styles.giftIcon}><Ionicons name="gift" size={28} color={colors.brandPrimary} /></View>
          <Text style={[type.h2, { textAlign: "center", marginTop: spacing.sm }]}>Give $5, get $5</Text>
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: 4 }]}>
            Share your code — you both get $5 when your friend signs up.
          </Text>
        </View>

        <Text style={styles.section}>Your code</Text>
        <View style={styles.codeRow} testID="referral-code">
          <Text style={styles.codeText}>{data?.code || "…"}</Text>
          <Pressable testID="share-btn" onPress={share} style={styles.shareBtn}>
            <Ionicons name="share-social" size={16} color={colors.onBrandPrimary} />
            <Text style={{ color: colors.onBrandPrimary, fontFamily: font.textMedium }}>Share</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
          <View style={styles.stat} testID="stat-invited">
            <Text style={type.label}>Invited</Text>
            <Text style={styles.statNum}>{data?.invited_count ?? "—"}</Text>
          </View>
          <View style={styles.stat} testID="stat-cashback">
            <Text style={type.label}>Cashback</Text>
            <Text style={[styles.statNum, { color: colors.brandPrimary }]}>{formatMoney(data?.cashback_usd || 0, "USD")}</Text>
          </View>
        </View>

        <Text style={styles.section}>{"Got a friend's code?"}</Text>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <TextInput
            testID="redeem-code-input"
            value={code} onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="GP-XXXXXX" placeholderTextColor={colors.onSurfaceTertiary}
            autoCapitalize="characters" style={[styles.input, { flex: 1 }]}
          />
          <Pressable testID="redeem-btn" onPress={redeem} disabled={busy || !code} style={[styles.cta, { paddingHorizontal: 24 }, (busy || !code) && { opacity: 0.5 }]}>
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Redeem</Text>}
          </Pressable>
        </View>
        {msg && <Text testID="ref-success" style={{ color: colors.brandPrimary, marginTop: spacing.md }}>{msg}</Text>}
        {err && <Text testID="ref-error" style={{ color: colors.error, marginTop: spacing.md }}>{err}</Text>}

        <View style={styles.cashbackCard}>
          <Ionicons name="cash" size={22} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontFamily: font.textMedium }]}>0.5% cashback on every transfer</Text>
            <Text style={type.small}>Credited automatically to your cashback wallet.</Text>
          </View>
        </View>
      </ScrollView>
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
  hero: { alignItems: "center", paddingVertical: spacing.xl },
  giftIcon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTertiary,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.brandSecondary,
  },
  section: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  codeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  codeText: { fontFamily: font.display, fontSize: 22, color: colors.onSurface, letterSpacing: 2 },
  shareBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill },
  stat: {
    flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  statNum: { fontFamily: font.display, fontSize: 24, color: colors.onSurface, marginTop: 2 },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, fontFamily: font.text, fontSize: 15,
  },
  cta: { backgroundColor: colors.brandPrimary, paddingVertical: 14, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  ctaText: { color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 15 },
  cashbackCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.brandTertiary, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.brandSecondary, marginTop: spacing.lg,
  },
});
