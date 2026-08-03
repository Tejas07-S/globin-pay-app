import { StyleSheet } from "react-native";

export const colors = {
  surface: "#0A0A0A",
  onSurface: "#FAFAFA",
  surfaceSecondary: "#141414",
  onSurfaceSecondary: "#A1A1AA",
  surfaceTertiary: "#1C1C1E",
  onSurfaceTertiary: "#71717A",
  surfaceInverse: "#FAFAFA",
  onSurfaceInverse: "#0A0A0A",
  brand: "#059669",
  brandPrimary: "#10B981",
  onBrandPrimary: "#022C22",
  brandSecondary: "#047857",
  onBrandSecondary: "#D1FAE5",
  brandTertiary: "#022C22",
  onBrandTertiary: "#34D399",
  success: "#10B981",
  onSuccess: "#022C22",
  warning: "#F59E0B",
  onWarning: "#451A03",
  error: "#EF4444",
  onError: "#450A0A",
  info: "#3B82F6",
  onInfo: "#EFF6FF",
  border: "#27272A",
  borderStrong: "#3F3F46",
  divider: "#27272A",
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };

export const font = {
  display: "SpaceGrotesk_700Bold",
  displayMedium: "SpaceGrotesk_500Medium",
  text: "Geist_400Regular",
  textMedium: "Geist_500Medium",
  textBold: "Geist_600SemiBold",
};

export const type = StyleSheet.create({
  display: { fontFamily: font.display, color: colors.onSurface },
  h1: { fontFamily: font.display, fontSize: 32, color: colors.onSurface, letterSpacing: -0.5 },
  h2: { fontFamily: font.display, fontSize: 24, color: colors.onSurface, letterSpacing: -0.3 },
  h3: { fontFamily: font.displayMedium, fontSize: 20, color: colors.onSurface },
  body: { fontFamily: font.text, fontSize: 14, color: colors.onSurface },
  bodyMuted: { fontFamily: font.text, fontSize: 14, color: colors.onSurfaceSecondary },
  small: { fontFamily: font.text, fontSize: 12, color: colors.onSurfaceSecondary },
  label: { fontFamily: font.textMedium, fontSize: 13, color: colors.onSurfaceSecondary, letterSpacing: 0.3 },
  number: { fontFamily: font.display, color: colors.onSurface },
});

export const flag: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", INR: "🇮🇳", JPY: "🇯🇵",
  AED: "🇦🇪", AUD: "🇦🇺", CAD: "🇨🇦", SGD: "🇸🇬", CHF: "🇨🇭", CNY: "🇨🇳",
};

export const currencySymbol: Record<string, string> = {
  USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥",
  AED: "د.إ", AUD: "A$", CAD: "C$", SGD: "S$", CHF: "Fr", CNY: "¥",
};

export function formatMoney(amount: number, currency: string) {
  const sym = currencySymbol[currency] ?? "";
  const abs = Math.abs(amount);
  const s = abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}${sym}${s}`;
}
