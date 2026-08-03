// TODO: real Google sign-in isn't wired up yet. To enable it:
//   1. Create OAuth 2.0 credentials in your own Google Cloud Console project
//   2. Swap this implementation for `expo-auth-session/providers/google`,
//      which gets an id_token directly from Google (no third-party proxy)
//   3. POST that id_token to your backend's /api/auth/google, which verifies
//      it server-side (see the TODO in backend/extras.py)
// Until then this returns a clear "not configured" result rather than
// silently depending on any third-party auth relay.

export type GoogleResult = { ok: true; token: string; user: any } | { ok: false; reason: string };

export async function signInWithGoogle(): Promise<GoogleResult> {
  return { ok: false, reason: "Google sign-in isn't configured yet — use email & password." };
}

export function extractSessionId(url: string): string | null {
  try {
    const m1 = url.match(/[?&]session_id=([^&#]+)/);
    if (m1) return decodeURIComponent(m1[1]);
    const m2 = url.match(/#.*?session_id=([^&]+)/);
    if (m2) return decodeURIComponent(m2[1]);
  } catch {}
  return null;
}
