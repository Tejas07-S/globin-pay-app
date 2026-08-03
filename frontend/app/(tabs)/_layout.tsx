import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { View, StyleSheet, Platform } from "react-native";
import { BlurView } from "expo-blur";
import { colors, font } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.onSurfaceTertiary,
        tabBarStyle: {
          position: "absolute",
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          backgroundColor: Platform.OS === "android" ? colors.surfaceSecondary : "transparent",
          elevation: 0, height: 74, paddingTop: 8, paddingBottom: 18,
        },
        tabBarBackground: () =>
          Platform.OS === "ios" ? (
            <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSecondary }]} />
          ),
        tabBarLabelStyle: { fontFamily: font.textMedium, fontSize: 11, letterSpacing: 0.2 },
      }}
    >
      <Tabs.Screen name="wallet" options={{ title: "Home",  tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="rates"  options={{ title: "Rates", tabBarIcon: ({ color, size }) => <Ionicons name="trending-up-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="ai"     options={{ title: "Finn AI",tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="more"   options={{ title: "More",  tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }} />
      {/* Legacy 'send' tab hidden — the new 5-step flow lives at /send-abroad */}
      <Tabs.Screen name="send"   options={{ href: null }} />
    </Tabs>
  );
}
