import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen, cta } from "@/src/Screen";
import { colors, spacing, radius, type, font, formatMoney } from "@/src/theme";
import { api } from "@/src/api";

type Tab = "dashboard" | "clients" | "invoices" | "bulk" | "tax";

export default function Business() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [clients, setClients] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [tax, setTax] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const loadAll = async () => {
    setBusy(true);
    try {
      const [c, i, t] = await Promise.all([
        api("/business/clients"),
        api("/invoices"),
        api("/business/tax-report"),
      ]);
      setClients(c as any[]); setInvoices(i as any[]); setTax(t);
    } finally { setBusy(false); }
  };
  useEffect(() => { loadAll(); }, []);

  return (
    <Screen title="Business Hub" subtitle="Freelancer & SMB toolkit">
      <View style={s.tabs}>
        {(["dashboard", "clients", "invoices", "bulk", "tax"] as Tab[]).map((k) => (
          <Pressable key={k} onPress={() => setTab(k)} style={[s.tab, tab === k && s.tabActive]} testID={`biz-tab-${k}`}>
            <Text style={{ color: tab === k ? colors.onBrandPrimary : colors.onSurfaceSecondary, fontFamily: font.textMedium, fontSize: 12, textTransform: "capitalize" }}>{k}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
        {busy && <ActivityIndicator color={colors.onSurface} />}

        {tab === "dashboard" && (
          <View>
            <View style={{ flexDirection: "row", gap: spacing.md }}>
              <Stat label="Clients" value={clients.length} />
              <Stat label="Invoices" value={invoices.length} />
              <Stat label="Paid" value={invoices.filter((i) => i.status === "paid").length} />
            </View>
            <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.md }}>
              <Stat label="Pending" value={`$${invoices.filter((i) => i.status === "pending").reduce((a, i) => a + i.amount, 0).toFixed(0)}`} />
              <Stat label="Fees paid" value={tax ? `$${tax.total_fees_paid?.toFixed?.(2) || 0}` : "—"} />
              <Stat label="Income" value={tax ? `$${tax.total_income?.toFixed?.(0) || 0}` : "—"} />
            </View>
            <Text style={s.section}>Recent invoices</Text>
            {invoices.slice(0, 5).map((i) => (
              <View key={i.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontFamily: font.textMedium }]}>{i.client_name}</Text>
                  <Text style={type.small}>{i.description}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[type.body, { fontFamily: font.textBold }]}>{formatMoney(i.amount, i.currency)}</Text>
                  <Text style={[type.small, { color: i.status === "paid" ? colors.brandPrimary : colors.warning }]}>{i.status.toUpperCase()}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {tab === "clients" && <Clients clients={clients} onChange={loadAll} />}
        {tab === "invoices" && (
          <View>
            {invoices.map((i) => (
              <View key={i.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontFamily: font.textMedium }]}>{i.client_name}</Text>
                  <Text style={type.small}>{i.description} · due {new Date(i.due_date).toLocaleDateString()}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[type.body, { fontFamily: font.textBold }]}>{formatMoney(i.amount, i.currency)}</Text>
                  <Text style={[type.small, { color: i.status === "paid" ? colors.brandPrimary : colors.warning }]}>{i.status.toUpperCase()}</Text>
                </View>
              </View>
            ))}
            {invoices.length === 0 && <Text style={type.bodyMuted}>Create an invoice from the Freelancer Hub.</Text>}
          </View>
        )}

        {tab === "bulk" && <BulkPay onDone={loadAll} />}

        {tab === "tax" && tax && (
          <View>
            <Text style={s.section}>Tax report · {tax.year}</Text>
            <View style={s.card}>
              <Row label="Total income" value={`$${tax.total_income.toFixed(2)}`} />
              <Row label="Total outflow" value={`$${tax.total_outflow_usd.toFixed(2)}`} />
              <Row label="Fees paid (deductible)" value={`$${tax.total_fees_paid.toFixed(2)}`} />
              <Row label="Transactions" value={tax.transactions_count} />
              <Row label="Invoices paid" value={tax.invoices_paid} />
            </View>
            <Pressable
              testID="tax-export-btn"
              onPress={async () => {
                if (Platform.OS === "web" && typeof navigator !== "undefined" && (navigator as any).clipboard) {
                  await (navigator as any).clipboard.writeText(tax.csv);
                } else {
                  try { await Share.share({ message: tax.csv }); } catch {}
                }
              }}
              style={[cta.btn, { marginTop: spacing.md }]}
            >
              <Text style={cta.txt}>Export CSV (share)</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Clients({ clients, onChange }: any) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [company, setCompany] = useState(""); const [country, setCountry] = useState("US"); const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try { await api("/business/clients", { method: "POST", body: { name, email, company, country, currency } }); setOpen(false); setName(""); setEmail(""); setCompany(""); await onChange(); }
    finally { setBusy(false); }
  };
  const del = async (id: string) => { await api(`/business/clients/${id}`, { method: "DELETE" }); await onChange(); };

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={[cta.btn, { marginBottom: spacing.md }]} testID="new-client-btn"><Text style={cta.txt}>+ Add client</Text></Pressable>
      {clients.length === 0 && <Text style={type.bodyMuted}>No clients yet. Add your first to start invoicing.</Text>}
      {clients.map((c: any) => (
        <View key={c.id} style={s.row} testID={`client-${c.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontFamily: font.textMedium }]}>{c.name}</Text>
            <Text style={type.small}>{c.email} · {c.country} · {c.currency}</Text>
            {c.company && <Text style={type.small}>{c.company}</Text>}
          </View>
          <Pressable onPress={() => del(c.id)} style={s.iconBtn}><Ionicons name="trash-outline" size={16} color={colors.error} /></Pressable>
        </View>
      ))}
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }} onPress={() => setOpen(false)} />
          <View style={s.sheet}>
            <View style={s.grabber} />
            <Text style={[type.h3, { marginBottom: spacing.md }]}>New client</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Name" placeholderTextColor={colors.onSurfaceTertiary} style={s.field} />
            <TextInput value={company} onChangeText={setCompany} placeholder="Company (optional)" placeholderTextColor={colors.onSurfaceTertiary} style={s.field} />
            <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor={colors.onSurfaceTertiary} style={s.field} />
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <TextInput value={country} onChangeText={setCountry} placeholder="US" placeholderTextColor={colors.onSurfaceTertiary} style={[s.field, { flex: 1 }]} />
              <TextInput value={currency} onChangeText={setCurrency} placeholder="USD" placeholderTextColor={colors.onSurfaceTertiary} style={[s.field, { flex: 1 }]} />
            </View>
            <Pressable onPress={create} disabled={busy || !name || !email} style={[cta.btn, (busy || !name || !email) && { opacity: 0.5 }]}>
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>Create client</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function BulkPay({ onDone }: any) {
  const [csv, setCsv] = useState("Alice,India,120\nBob,UK,220");
  const [title, setTitle] = useState("Team payout · Aug");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const items = csv.split("\n").filter(Boolean).map((line) => {
        const [name, country, amt] = line.split(",").map((s) => s.trim());
        return { recipient_name: name, recipient_country: country, amount: parseFloat(amt) || 0, from_currency: "USD", to_currency: "USD" };
      });
      const r = await api("/business/bulk-pay", { method: "POST", body: { title, items } });
      setRes(r); await onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <View>
      <Text style={s.section}>Bulk payments</Text>
      <Text style={type.bodyMuted}>Pay many recipients in one go. Paste name,country,amount per line (USD).</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Batch name" placeholderTextColor={colors.onSurfaceTertiary} style={s.field} />
      <TextInput value={csv} onChangeText={setCsv} multiline placeholderTextColor={colors.onSurfaceTertiary} style={[s.field, { height: 140, textAlignVertical: "top" }]} testID="bulk-csv" />
      {err && <Text style={{ color: colors.error }}>{err}</Text>}
      <Pressable onPress={send} disabled={busy} style={[cta.btn, busy && { opacity: 0.5 }]} testID="bulk-send-btn">
        {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={cta.txt}>Run batch</Text>}
      </Pressable>
      {res && (
        <View style={[s.card, { marginTop: spacing.md }]} testID="bulk-result">
          <Text style={[type.body, { fontFamily: font.textBold }]}>Batch complete — {res.count} payouts</Text>
          {res.results.map((r: any, i: number) => (
            <Text key={i} style={type.small}>{r.status === "sent" ? "✓" : "✗"} {r.recipient} — {r.status === "sent" ? `$${r.amount}` : r.reason}</Text>
          ))}
        </View>
      )}
    </View>
  );
}

function Stat({ label, value }: any) {
  return (
    <View style={s.stat}>
      <Text style={type.label}>{label}</Text>
      <Text style={[type.body, { fontFamily: font.textBold, fontSize: 22, marginTop: 4 }]}>{value}</Text>
    </View>
  );
}
function Row({ label, value }: any) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 }}>
      <Text style={type.bodyMuted}>{label}</Text><Text style={[type.body, { fontFamily: font.textMedium }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 4, marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  tabActive: { backgroundColor: colors.brandPrimary },
  stat: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  section: { fontFamily: font.textBold, fontSize: 15, color: colors.onSurface, marginTop: spacing.lg, marginBottom: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sheet: { backgroundColor: colors.surface, padding: spacing.lg, paddingBottom: spacing.xxl, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, borderColor: colors.border },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  field: { backgroundColor: colors.surfaceSecondary, color: colors.onSurface, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, fontFamily: font.text, fontSize: 15, marginBottom: spacing.sm },
});
