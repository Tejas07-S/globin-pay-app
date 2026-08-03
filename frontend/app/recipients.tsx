import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta, input } from "@/src/Screen";
import { colors, spacing, radius, type, font, flag } from "@/src/theme";
import { api } from "@/src/api";

type Recipient = { id: string; name: string; country: string; currency: string; account_type: string; identifier: string; nickname?: string; favorite: boolean; verified: boolean; sent_count: number };

export default function Recipients() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ all: Recipient[]; favorites: Recipient[]; recent: Recipient[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api<any>(`/recipients${q ? `?q=${encodeURIComponent(q)}` : ""}`);
      setData(r);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q]);

  const toggleFav = async (id: string) => {
    await api(`/recipients/${id}/favorite`, { method: "POST" });
    await load();
  };
  const remove = async (id: string) => {
    await api(`/recipients/${id}`, { method: "DELETE" });
    await load();
  };

  const send = (r: Recipient) => router.push({ pathname: "/send-abroad", params: { rid: r.id, name: r.name, country: r.country } as any });

  return (
    <Screen title="Recipients" subtitle="Favorites · Recent · Save without sending">
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, flexDirection: "row", gap: spacing.sm }}>
        <View style={[s.search, { flex: 1 }]}>
          <Ionicons name="search" size={16} color={colors.onSurfaceTertiary} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search by name or country" placeholderTextColor={colors.onSurfaceTertiary} style={s.searchInput} testID="rec-search" />
        </View>
        <Pressable
          testID="rec-add-btn"
          onPress={() => router.push("/recipients/add")}
          style={{ backgroundColor: colors.brandPrimary, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" }}
        >
          <Ionicons name="add" size={22} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {loading && <ActivityIndicator color={colors.onSurface} />}
        {data && data.favorites.length > 0 && (
          <>
            <Text style={s.section}>⭐ Favorites</Text>
            {data.favorites.map((r) => <Row key={r.id} r={r} onFav={toggleFav} onDel={remove} onSend={send} />)}
          </>
        )}
        {data && data.recent.length > 0 && (
          <>
            <Text style={s.section}>Recent</Text>
            {data.recent.map((r) => <Row key={"rec-" + r.id} r={r} onFav={toggleFav} onDel={remove} onSend={send} />)}
          </>
        )}
        <Text style={s.section}>All ({data?.all.length || 0})</Text>
        {data && data.all.length === 0 && (
          <View style={s.empty}>
            <Text style={{ fontSize: 40 }}>👥</Text>
            <Text style={[type.h3, { marginTop: spacing.sm, textAlign: "center" }]}>No recipients yet</Text>
            <Text style={[type.bodyMuted, { marginTop: 4, textAlign: "center" }]}>
              Save people you send money to often — with just their bank / UPI details.
            </Text>
            <Pressable
              testID="rec-empty-add"
              onPress={() => router.push("/recipients/add")}
              style={{ marginTop: spacing.md, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: 999 }}
            >
              <Text style={{ color: colors.onBrandPrimary, fontFamily: font.textBold }}>+ Add first recipient</Text>
            </Pressable>
          </View>
        )}
        {data && data.all.map((r) => <Row key={"all-" + r.id} r={r} onFav={toggleFav} onDel={remove} onSend={send} />)}
      </ScrollView>
    </Screen>
  );
}

function Row({ r, onFav, onDel, onSend }: any) {
  return (
    <View style={s.row} testID={`rec-${r.id}`}>
      <Pressable onPress={() => onSend(r)} style={{ flexDirection: "row", flex: 1, alignItems: "center", gap: spacing.md }}>
        <View style={s.avatar}>
          <Text style={{ fontFamily: font.textBold, color: colors.onSurface }}>{r.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[type.body, { fontFamily: font.textMedium }]}>{r.name}</Text>
            {r.verified && <Ionicons name="checkmark-circle" size={14} color={colors.brandPrimary} testID={`verified-${r.id}`} />}
          </View>
          <Text style={type.small}>{flag[r.currency] || "🌐"} {r.country} · {r.account_type.toUpperCase()} · {r.identifier?.slice(0, 20)}</Text>
          {r.sent_count > 0 && <Text style={type.small}>Sent {r.sent_count}×</Text>}
        </View>
      </Pressable>
      <Pressable onPress={() => onFav(r.id)} style={s.iconBtn} testID={`fav-${r.id}`}>
        <Ionicons name={r.favorite ? "star" : "star-outline"} size={18} color={r.favorite ? colors.warning : colors.onSurfaceTertiary} />
      </Pressable>
      <Pressable onPress={() => onDel(r.id)} style={s.iconBtn} testID={`del-${r.id}`}>
        <Ionicons name="trash-outline" size={16} color={colors.error} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, paddingVertical: 12, color: colors.onSurface, fontFamily: font.text, fontSize: 14 },
  section: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brandSecondary, alignItems: "center", justifyContent: "center" },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  empty: { borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, padding: spacing.xl, alignItems: "center" },
});
