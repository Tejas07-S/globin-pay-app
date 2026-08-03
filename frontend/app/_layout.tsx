import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState, useRef } from "react";
import { AppState, LogBox, View, Text, Pressable } from "react-native";
import { useFonts } from "expo-font";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/auth";
import { colors, spacing, radius, type, font } from "@/src/theme";
import { isPinEnabled, biometricPrompt } from "@/src/pin";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

const FONT_URLS = {
  SpaceGrotesk_500Medium:
    "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-500-normal.ttf",
  SpaceGrotesk_700Bold:
    "https://cdn.jsdelivr.net/fontsource/fonts/space-grotesk@latest/latin-700-normal.ttf",
  Geist_400Regular:
    "https://cdn.jsdelivr.net/fontsource/fonts/geist@latest/latin-400-normal.ttf",
  Geist_500Medium:
    "https://cdn.jsdelivr.net/fontsource/fonts/geist@latest/latin-500-normal.ttf",
  Geist_600SemiBold:
    "https://cdn.jsdelivr.net/fontsource/fonts/geist@latest/latin-600-normal.ttf",
};

function Gate() {
  const { user, ready } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [locked, setLocked] = useState(false);
  const lastActive = useRef<number>(Date.now());

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === "(auth)";
    const inOnboarding = segments[0] === "onboarding";
    if (!user && !inAuth) { router.replace("/(auth)/login"); return; }
    if (user && !user.onboarding_completed && !inOnboarding) { router.replace("/onboarding"); return; }
    if (user && user.onboarding_completed && (inAuth || inOnboarding)) { router.replace("/(tabs)/wallet"); return; }
  }, [user, ready, segments]);

  // Lock when app comes back from background if PIN enabled
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (s) => {
      if (s === "active") {
        const enabled = await isPinEnabled();
        if (enabled && Date.now() - lastActive.current > 15000 && user) {
          setLocked(true);
        }
        lastActive.current = Date.now();
      } else {
        lastActive.current = Date.now();
      }
    });
    return () => sub.remove();
  }, [user]);

  const unlock = async () => {
    const ok = await biometricPrompt();
    if (ok) setLocked(false);
  };

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
      {locked && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl }} testID="pin-lock-overlay">
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: colors.brandTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.brandSecondary }}>
            <Ionicons name="lock-closed" size={44} color={colors.brandPrimary} />
          </View>
          <Text style={[type.h1, { marginTop: spacing.lg }]}>Locked</Text>
          <Text style={[type.bodyMuted, { textAlign: "center", marginTop: spacing.xs }]}>
            Use biometrics to unlock GLOBiN pay.
          </Text>
          <Pressable
            testID="unlock-btn"
            onPress={unlock}
            style={{ backgroundColor: colors.brandPrimary, paddingHorizontal: 36, paddingVertical: 14, borderRadius: radius.md, marginTop: spacing.xl }}
          >
            <Text style={{ color: colors.onBrandPrimary, fontFamily: font.textBold, fontSize: 15 }}>Unlock</Text>
          </Pressable>
        </View>
      )}
    </>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsErr] = useIconFonts();
  const [fontsLoaded, fontsErr] = useFonts(FONT_URLS);

  useEffect(() => {
    if ((iconsLoaded || iconsErr) && (fontsLoaded || fontsErr)) {
      SplashScreen.hideAsync();
    }
  }, [iconsLoaded, iconsErr, fontsLoaded, fontsErr]);

  if (!(iconsLoaded || iconsErr) || !(fontsLoaded || fontsErr)) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <AuthProvider>
          <View style={{ flex: 1, backgroundColor: colors.surface }}>
            <Gate />
          </View>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
