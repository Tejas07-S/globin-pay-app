import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LA from "expo-local-authentication";
import { Platform } from "react-native";

const PIN_KEY = "gp_pin_enabled";

export async function isPinEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(PIN_KEY)) === "1";
}
export async function setPinEnabled(v: boolean) {
  await AsyncStorage.setItem(PIN_KEY, v ? "1" : "0");
}

export async function biometricAvailable(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const hw = await LA.hasHardwareAsync();
    const enrolled = await LA.isEnrolledAsync();
    return hw && enrolled;
  } catch { return false; }
}

export async function biometricPrompt(reason = "Unlock GlobalPay AI"): Promise<boolean> {
  if (Platform.OS === "web") return true; // no-op on web
  try {
    const r = await LA.authenticateAsync({ promptMessage: reason, disableDeviceFallback: false, fallbackLabel: "Enter passcode" });
    return r.success;
  } catch { return false; }
}
