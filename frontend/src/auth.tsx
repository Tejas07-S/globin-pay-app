import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { api, setToken as saveToken, getToken } from "./api";

export type User = {
  id: string;
  email: string;
  full_name: string;
  kyc_status: "pending" | "verified" | "rejected";
  balances: Record<string, number>;
  is_admin?: boolean;
  premium_active?: boolean;
  cashback_usd?: number;
  referral_code?: string;
  picture?: string;
  country?: string | null;
  preferred_currency?: string | null;
  account_type?: "personal" | "business" | "student" | null;
  bank_type?: "checking" | "savings" | "business" | "digital" | null;
  onboarding_completed?: boolean;
};

type Ctx = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthCtx = createContext<Ctx | null>(null);

async function processWebSessionId(): Promise<User | null> {
  if (Platform.OS !== "web" || typeof window === "undefined") return null;
  const href = window.location.href;
  const m = href.match(/[?&#]session_id=([^&#]+)/);
  if (!m) return null;
  const sid = decodeURIComponent(m[1]);
  try {
    const r = await api<{ token: string; user: User }>("/auth/google", {
      method: "POST", body: { session_id: sid }, auth: false,
    });
    await saveToken(r.token);
    // Clean URL
    if (window.history?.replaceState) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    return r.user;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      // 1) Process ?session_id from Google web redirect if present
      const webUser = await processWebSessionId();
      if (webUser) {
        setUser(webUser);
        setReady(true);
        return;
      }
      // 2) Existing token
      const t = await getToken();
      if (t) {
        try {
          const me = await api<User>("/auth/me");
          setUser(me);
        } catch {
          await saveToken(null);
        }
      }
      setReady(true);
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>("/auth/login", {
      method: "POST", body: { email, password }, auth: false,
    });
    await saveToken(r.token);
    setUser(r.user);
  };

  const register = async (email: string, password: string, full_name: string) => {
    const r = await api<{ token: string; user: User }>("/auth/register", {
      method: "POST", body: { email, password, full_name }, auth: false,
    });
    await saveToken(r.token);
    setUser(r.user);
  };

  const logout = async () => {
    await saveToken(null);
    setUser(null);
  };

  const refresh = async () => {
    const me = await api<User>("/auth/me");
    setUser(me);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout, refresh, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
