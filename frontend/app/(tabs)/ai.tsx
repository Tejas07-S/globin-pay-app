import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import { api } from "@/src/api";
import { colors, spacing, radius, type, font } from "@/src/theme";

type Msg = { role: "user" | "assistant"; content: string; source?: string; ts?: string };
const SESSION = "gp-assistant-main";
const PROMPTS = [
  "What's my wallet balance?",
  "Explain my transfer fees",
  "What's today's USD/EUR rate?",
  "How can I save on international transfers?",
];
const REVEAL_MS_PER_WORD = 28; // simulated streaming pace — see README note in report re: why not true SSE

// Security (Phase G audit): react-native-markdown-display's default link
// handling calls Linking.openURL() with zero scheme validation — since
// link text in a Finn reply ultimately comes from an LLM (which could be
// prompt-injected or could hallucinate something malformed), an unvalidated
// scheme is a real, if narrow, attack surface (e.g. a deep link into
// another app, or a scheme this app doesn't expect). Only allow the
// schemes a financial-assistant chat actually needs.
const ALLOWED_LINK_SCHEMES = ["http:", "https:", "mailto:"];
function isSafeLink(url: string): boolean {
  try {
    const scheme = url.split(":")[0]?.toLowerCase() + ":";
    return ALLOWED_LINK_SCHEMES.includes(scheme);
  } catch {
    return false;
  }
}

export default function AI() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [insights, setInsights] = useState<any[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>(PROMPTS);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<"loading" | "success" | "error">("loading");
  const [revealMap, setRevealMap] = useState<Record<number, number>>({});
  const [streamingIndex, setStreamingIndex] = useState<number | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const scroller = useRef<ScrollView>(null);
  const revealTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fadeAnims = useRef<Record<number, Animated.Value>>({});

  const loadHistory = async () => {
    setHistoryState("loading");
    try {
      const h = await api<Msg[]>(`/ai/history?session_id=${SESSION}`);
      setMessages(h.map((m: any) => ({ role: m.role, content: m.content, source: m.source, ts: m.created_at })));
      setHistoryState("success");
    } catch {
      setHistoryState("error");
    }
    try {
      const r = await api<{ insights: any[] }>("/ai/insights");
      setInsights(r.insights || []);
    } catch {}
    try {
      const s = await api<{ suggestions: string[] }>("/ai/suggestions");
      if (s.suggestions?.length) setSuggestions(s.suggestions);
    } catch {
      // keep the static PROMPTS fallback — still a helpful empty state, just not personalized
    }
  };

  useEffect(() => { loadHistory(); }, []);
  useEffect(() => () => { if (revealTimer.current) clearInterval(revealTimer.current); }, []);

  function getFade(index: number): Animated.Value {
    if (!fadeAnims.current[index]) {
      fadeAnims.current[index] = new Animated.Value(0);
      Animated.timing(fadeAnims.current[index], {
        toValue: 1, duration: 260, useNativeDriver: true,
      }).start();
    }
    return fadeAnims.current[index];
  }

  function startReveal(index: number, fullText: string) {
    const words = fullText.split(" ");
    let count = 0;
    setRevealMap((m) => ({ ...m, [index]: 0 }));
    setStreamingIndex(index);
    revealTimer.current = setInterval(() => {
      count++;
      setRevealMap((m) => ({ ...m, [index]: count }));
      if (count % 4 === 0) scroller.current?.scrollToEnd({ animated: true });
      if (count >= words.length) {
        if (revealTimer.current) clearInterval(revealTimer.current);
        revealTimer.current = null;
        setStreamingIndex(null);
        scroller.current?.scrollToEnd({ animated: true });
      }
    }, REVEAL_MS_PER_WORD);
  }

  function stopStreaming() {
    if (revealTimer.current) { clearInterval(revealTimer.current); revealTimer.current = null; }
    if (streamingIndex !== null) {
      setRevealMap((m) => ({ ...m, [streamingIndex]: Number.MAX_SAFE_INTEGER })); // reveal the rest instantly
    }
    setStreamingIndex(null);
    abortRef.current?.abort();
  }

  function displayedContent(m: Msg, i: number): string {
    const revealed = revealMap[i];
    if (revealed === undefined) return m.content;
    const words = m.content.split(" ");
    return words.slice(0, Math.min(revealed, words.length)).join(" ");
  }

  const send = async (text: string, opts: { replaceLastAssistant?: boolean } = {}) => {
    if (!text.trim() || sending) return;
    setFailedMessage(null);

    let baseMessages = messages;
    if (opts.replaceLastAssistant) {
      // Regenerate: drop the trailing assistant reply, resend the same user turn
      baseMessages = messages.slice(0, -1);
      setMessages(baseMessages);
    } else {
      const userMsg: Msg = { role: "user", content: text, ts: new Date().toISOString() };
      baseMessages = [...messages, userMsg];
      setMessages(baseMessages);
      setInput("");
    }
    setSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const r = await api<{ reply: string; source: string }>("/ai/chat", {
        method: "POST", body: { session_id: SESSION, message: text }, signal: controller.signal,
      });
      const assistantIndex = baseMessages.length;
      setMessages((m) => [...m, { role: "assistant", content: r.reply, source: r.source, ts: new Date().toISOString() }]);
      startReveal(assistantIndex, r.reply);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // User hit Stop before the response came back — no error bubble needed
      } else {
        // The backend itself never returns a raw error for a normal chat failure
        // (it falls back to a real-data-backed reply) — this catch only fires for
        // genuine network/connectivity failures reaching our own backend at all.
        setMessages((m) => [...m, {
          role: "assistant",
          content: "I couldn't reach the server just now. Check your connection and try again.",
          source: "network_error",
          ts: new Date().toISOString(),
        }]);
        setFailedMessage(text);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
      setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const retry = () => {
    if (!failedMessage) return;
    setMessages((m) => m.slice(0, -1));
    send(failedMessage);
  };

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (lastUser) send(lastUser.content, { replaceLastAssistant: true });
  };

  const copyMessage = async (content: string, index: number) => {
    await Clipboard.setStringAsync(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex((c) => (c === index ? null : c)), 1500);
  };

  function formatTime(ts?: string) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  // Conversation title: derived client-side from the first user message —
  // no dedicated LLM call for this, keeps it free and instant (Part 7:
  // avoid unnecessary API calls).
  const firstUserMsg = messages.find((m) => m.role === "user")?.content;
  const conversationTitle = firstUserMsg
    ? firstUserMsg.length > 34 ? firstUserMsg.slice(0, 34).trim() + "…" : firstUserMsg
    : null;

  const lastAssistantIndex = [...messages].map((m, i) => ({ m, i })).reverse().find((x) => x.m.role === "assistant")?.i;
  const isStreamingOrSending = sending || streamingIndex !== null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.surface }}
      keyboardVerticalOffset={insets.bottom + 74}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.avatar}><Ionicons name="sparkles" size={16} color={colors.brandPrimary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[type.h3]} numberOfLines={1}>{conversationTitle || "Finn"}</Text>
          <Text style={type.small}>{conversationTitle ? "Finn — AI financial assistant" : "Your AI financial assistant"}</Text>
        </View>
      </View>

      {insights.length > 0 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm }}
          style={{ maxHeight: 130, flexGrow: 0 }}
          testID="finn-insights"
        >
          {insights.slice(0, 4).map((ins) => (
            <Pressable
              key={ins.id}
              onPress={() => send(`${ins.title}: ${ins.body} — explain more.`)}
              style={styles.finnInsight}
              testID={`finn-ins-${ins.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Insight: ${ins.title}. ${ins.body}`}
              accessibilityHint="Ask Finn to explain this insight in more detail"
            >
              <Ionicons name={ins.icon} size={14} color={colors.brandPrimary} />
              <Text style={styles.finnInsightTitle} numberOfLines={1}>{ins.title}</Text>
              <Text style={styles.finnInsightBody} numberOfLines={2}>{ins.body}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ScrollView
        ref={scroller}
        contentContainerStyle={{
          padding: spacing.lg,
          paddingBottom: messages.length > 0 && suggestions.length > 0 ? 250 : 200,
          gap: spacing.md,
        }}
        onContentSizeChange={() => { if (streamingIndex === null) scroller.current?.scrollToEnd({ animated: true }); }}
      >
        {historyState === "loading" && (
          <View style={styles.hero} testID="ai-history-loading">
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        )}
        {historyState === "error" && messages.length === 0 && (
          <View style={styles.hero} testID="ai-history-error">
            <Ionicons name="cloud-offline-outline" size={28} color={colors.onSurfaceTertiary} />
            <Text style={[type.body, { marginTop: spacing.sm, textAlign: "center" }]}>
              Couldn&apos;t load your conversation history.
            </Text>
            <Pressable testID="ai-history-retry" onPress={loadHistory} style={styles.promptChip} accessibilityRole="button" accessibilityLabel="Retry loading conversation history">
              <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 13 }}>Retry</Text>
            </Pressable>
          </View>
        )}
        {historyState === "success" && messages.length === 0 && (
          <View style={styles.hero} testID="ai-empty">
            <View style={styles.heroBadge}>
              <Ionicons name="sparkles" size={22} color={colors.brandPrimary} />
            </View>
            <Text style={[type.h2, { textAlign: "center", marginTop: spacing.md }]} accessibilityRole="header">
              {"Hi, I'm Finn 👋"}
            </Text>
            <Text style={[type.bodyMuted, { textAlign: "center", marginTop: spacing.xs }]}>
              Ask me about transfers, rates, spending or savings.
            </Text>
            <View style={styles.chips}>
              {suggestions.map((p) => (
                <Pressable
                  key={p} onPress={() => send(p)} style={styles.promptChip} testID={`prompt-${p.slice(0,10)}`}
                  accessibilityRole="button" accessibilityLabel={`Ask: ${p}`}
                >
                  <Text style={{ color: colors.onSurface, fontFamily: font.text, fontSize: 13 }}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {messages.map((m, i) => (
          <Animated.View
            key={i}
            style={[
              styles.bubble,
              m.role === "user" ? styles.userBubble : styles.aiBubble,
              { opacity: getFade(i), transform: [{ translateY: getFade(i).interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
            ]}
            testID={`msg-${i}`}
          >
            {m.role === "assistant" ? (
              <Markdown style={mdStyles} onLinkPress={isSafeLink}>{displayedContent(m, i)}</Markdown>
            ) : (
              <Text style={[type.body, { color: colors.onSurface }]} accessibilityLabel={`You said: ${m.content}`}>{m.content}</Text>
            )}

            <View style={styles.msgFooter}>
              {!!m.ts && <Text style={styles.timestamp}>{formatTime(m.ts)}</Text>}

              {m.role === "assistant" && m.source !== "network_error" && (
                <View style={{ flexDirection: "row", gap: spacing.md }}>
                  <Pressable
                    testID={`copy-${i}`} onPress={() => copyMessage(m.content, i)} hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={copiedIndex === i ? "Copied to clipboard" : "Copy message"}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Ionicons name={copiedIndex === i ? "checkmark" : "copy-outline"} size={13} color={colors.onSurfaceTertiary} />
                      {copiedIndex === i && <Text style={styles.footerActionText}>Copied</Text>}
                    </View>
                  </Pressable>
                  {i === lastAssistantIndex && !isStreamingOrSending && (
                    <Pressable
                      testID={`regenerate-${i}`} onPress={regenerate} hitSlop={8}
                      accessibilityRole="button" accessibilityLabel="Regenerate response"
                    >
                      <Ionicons name="refresh-outline" size={13} color={colors.onSurfaceTertiary} />
                    </Pressable>
                  )}
                </View>
              )}
            </View>

            {m.role === "assistant" && m.source === "network_error" && (
              <Pressable testID="ai-retry" onPress={retry} style={styles.retryRow} accessibilityRole="button" accessibilityLabel="Retry sending message">
                <Ionicons name="refresh" size={13} color={colors.brandPrimary} />
                <Text style={{ color: colors.brandPrimary, fontFamily: font.textMedium, fontSize: 12 }}>Retry</Text>
              </Pressable>
            )}
            {m.role === "assistant" && (m.source === "rule_based" || m.source === "rate_limited") && (
              <View style={styles.sourceBadge} accessibilityLabel="This answer was generated from your account data without AI">
                <Ionicons name="flash-outline" size={11} color={colors.onSurfaceTertiary} />
                <Text style={styles.sourceBadgeText}>Answered from your account data</Text>
              </View>
            )}
          </Animated.View>
        ))}
        {sending && streamingIndex === null && (
          <View style={[styles.bubble, styles.aiBubble, { flexDirection: "row", gap: 8 }]} testID="ai-thinking" accessibilityLiveRegion="polite" accessibilityLabel="Finn is thinking">
            <ActivityIndicator size="small" color={colors.brandPrimary} />
            <Text style={type.bodyMuted}>Finn is thinking…</Text>
          </View>
        )}
      </ScrollView>

      {isStreamingOrSending && (
        <Pressable
          testID="ai-stop" onPress={stopStreaming} style={[styles.stopBtn, { bottom: insets.bottom + 148 }]}
          accessibilityRole="button" accessibilityLabel="Stop generating response"
        >
          <Ionicons name="stop" size={13} color={colors.onSurface} />
          <Text style={styles.stopBtnText}>Stop</Text>
        </Pressable>
      )}

      {!isStreamingOrSending && messages.length > 0 && suggestions.length > 0 && (
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm }}
          style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 132, flexGrow: 0 }}
          testID="suggestion-strip"
          accessibilityLabel="Suggested follow-up questions"
        >
          {suggestions.map((p) => (
            <Pressable
              key={p}
              onPress={() => send(p)}
              disabled={sending}
              style={styles.suggestionPill}
              testID={`suggestion-${p.slice(0, 10)}`}
              accessibilityRole="button"
              accessibilityLabel={`Ask: ${p}`}
            >
              <Text style={styles.suggestionPillText} numberOfLines={1}>{p}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={[styles.inputBar, { paddingBottom: insets.bottom + 82 }]}>
        <TextInput
          testID="ai-input"
          value={input} onChangeText={setInput}
          placeholder="Ask Finn anything…" placeholderTextColor={colors.onSurfaceTertiary}
          style={styles.input}
          onSubmitEditing={() => send(input)}
          returnKeyType="send"
          accessibilityLabel="Message input"
          accessibilityHint="Type a question for Finn"
        />
        <Pressable
          testID="ai-send"
          onPress={() => send(input)}
          disabled={!input.trim() || sending}
          style={[styles.sendBtn, (!input.trim() || sending) && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !input.trim() || sending }}
        >
          <Ionicons name="arrow-up" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const mdStyles = StyleSheet.create({
  body: { color: colors.onSurface, fontFamily: font.text, fontSize: 15, lineHeight: 21 },
  heading1: { color: colors.onSurface, fontFamily: font.textBold, fontSize: 19, marginTop: 4, marginBottom: 6 },
  heading2: { color: colors.onSurface, fontFamily: font.textBold, fontSize: 17, marginTop: 4, marginBottom: 4 },
  heading3: { color: colors.onSurface, fontFamily: font.textBold, fontSize: 15, marginTop: 4, marginBottom: 4 },
  strong: { fontFamily: font.textBold, color: colors.onSurface },
  em: { fontStyle: "italic" },
  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { flexDirection: "row", marginBottom: 3 },
  code_inline: {
    backgroundColor: colors.surfaceTertiary, color: colors.brandPrimary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13, paddingHorizontal: 4, borderRadius: 4,
  },
  code_block: {
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 13,
  },
  fence: {
    backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.sm,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }), fontSize: 13,
  },
  link: { color: colors.brandPrimary, textDecorationLine: "underline" },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginVertical: 6 },
  th: { padding: 6, backgroundColor: colors.surfaceTertiary, fontFamily: font.textBold, color: colors.onSurface },
  td: { padding: 6, borderColor: colors.border },
  hr: { backgroundColor: colors.border, height: 1, marginVertical: 8 },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 40, height: 40, borderRadius: radius.pill,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.brandSecondary,
  },
  hero: { alignItems: "center", paddingVertical: spacing.xxl },
  heroBadge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.brandSecondary,
  },
  chips: { marginTop: spacing.xl, gap: spacing.sm, width: "100%" },
  promptChip: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, borderRadius: radius.md,
  },
  bubble: { maxWidth: "85%", padding: spacing.md, borderRadius: radius.lg },
  userBubble: { alignSelf: "flex-end", backgroundColor: colors.brandSecondary },
  aiBubble: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  msgFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: spacing.sm },
  timestamp: { fontSize: 10, color: colors.onSurfaceTertiary, fontFamily: font.text },
  footerActionText: { fontSize: 10, color: colors.onSurfaceTertiary, fontFamily: font.textMedium },
  stopBtn: {
    position: "absolute", left: 0, right: 0, width: 90, marginHorizontal: "auto",
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingVertical: 8, alignSelf: "center",
  },
  stopBtnText: { color: colors.onSurface, fontFamily: font.textMedium, fontSize: 12 },
  inputBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  input: {
    flex: 1, backgroundColor: colors.surfaceTertiary, color: colors.onSurface,
    paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border,
    fontFamily: font.text, fontSize: 15,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brandPrimary,
    alignItems: "center", justifyContent: "center",
  },
  finnInsight: {
    width: 190, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md,
    padding: spacing.sm, borderWidth: 1, borderColor: colors.brandSecondary + "88",
  },
  finnInsightTitle: { color: colors.onSurface, fontFamily: font.textBold, fontSize: 12, marginTop: 4 },
  finnInsightBody: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: 11, lineHeight: 14, marginTop: 2 },
  retryRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  sourceBadge: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.xs, opacity: 0.7 },
  sourceBadgeText: { color: colors.onSurfaceTertiary, fontSize: 10, fontFamily: font.text },
  suggestionPill: {
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 8, maxWidth: 220,
  },
  suggestionPillText: { color: colors.onSurfaceSecondary, fontFamily: font.text, fontSize: 12 },
});
