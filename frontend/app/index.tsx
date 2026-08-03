import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/auth";
import { colors } from "@/src/theme";

export default function Index() {
  const router = useRouter();
  const { user, ready } = useAuth();
  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace("/(auth)/login"); return; }
    if (!user.onboarding_completed) { router.replace("/onboarding"); return; }
    router.replace("/(tabs)/wallet");
  }, [ready, user]);
  return <View testID="index-loader" style={{ flex: 1, backgroundColor: colors.surface }} />;
}
