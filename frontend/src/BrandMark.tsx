import { Text, StyleSheet, View } from "react-native";
import { colors, font } from "./theme";

/** Renders "GLOB[i]N pay" with the middle `i` accented. */
export function BrandMark({ size = 22, color = colors.onSurface }: { size?: number; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline" }}>
      <Text style={[styles.base, { fontSize: size, color }]}>GLOB</Text>
      <Text style={[styles.i, { fontSize: size, color: colors.brandPrimary }]}>i</Text>
      <Text style={[styles.base, { fontSize: size, color }]}>N</Text>
      <Text style={[styles.pay, { fontSize: size * 0.7, color: colors.onSurfaceSecondary }]}> pay</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { fontFamily: font.display, letterSpacing: 0.5 },
  i: { fontFamily: font.display, letterSpacing: 0.5 },
  pay: { fontFamily: font.textMedium, marginLeft: 2 },
});
