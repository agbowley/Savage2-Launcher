import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/tauri";
import { tauriFetchPost, tauriFetchPostText, tauriFetchAuthJson } from "@app/utils/tauriFetch";
import { authBaseURL } from "@app/utils/consts";
import type {
    AuthUser,
    LoginResponse,
    RefreshTokenResponse,
    CheckExistsResponse,
    DecodedJwt,
    BanInfo,
    MsAuthResponse,
    SavedAccount,
} from "@app/types/auth";

interface AuthState {
    authToken: string | null;
    refreshToken: string | null;
    user: AuthUser | null;
    gold: number | null;
    msCookie: string | null;
    msAccountId: number | null;
    msPassword: string | null;
    savedAccounts: SavedAccount[];

    login: (email: string, password: string) => Promise<void>;
    register: (username: string, email: string, password: string, referralCode?: string) => Promise<void>;
    checkUsernameExists: (username: string) => Promise<boolean>;
    resendVerification: (email: string) => Promise<void>;
    logout: () => void;
    switchAccount: (email: string) => Promise<void>;
    removeAccount: (email: string) => void;
    refreshSession: () => Promise<boolean>;
    restoreSession: () => Promise<void>;
    isLoggedIn: () => boolean;
    getTokenExpiry: () => number | null;
    fetchGold: () => Promise<void>;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function decodeJwtPayload(token: string): DecodedJwt {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT");
    const payload = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(payload);
}

function extractUser(token: string): AuthUser {
    const decoded = decodeJwtPayload(token);
    return {
        email: decoded.email,
        username: decoded.username,
        accountId: decoded.accountId,
    };
}

function scheduleTokenRefresh(get: () => AuthState) {
    if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
    }

    const token = get().authToken;
    if (!token) return;

    try {
        const decoded = decodeJwtPayload(token);
        const expiresAt = decoded.exp * 1000;
        // Refresh 5 minutes before expiry
        const refreshAt = expiresAt - 5 * 60 * 1000;
        const delay = refreshAt - Date.now();

        if (delay <= 0) {
            // Token is already near expiry, refresh now
            get().refreshSession();
            return;
        }

        refreshTimer = setTimeout(() => {
            get().refreshSession();
        }, delay);
    } catch {
        // If we can't decode, don't schedule
    }
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            authToken: null,
            refreshToken: null,
            user: null,
            gold: null,
            msCookie: null,
            msAccountId: null,
            msPassword: null,
            savedAccounts: [],

            login: async (email: string, password: string) => {
                const data = await tauriFetchPost<LoginResponse>(
                    `${authBaseURL}/login`,
                    { email, password },
                );

                const newUser = extractUser(data.token);

                // Encrypt the MS password before storing so it's never at rest in plaintext.
                let encryptedPassword: string | null = null;
                try {
                    encryptedPassword = await invoke<string>("encrypt_string", { plaintext: password });
                } catch (e) {
                    console.warn("Failed to encrypt password, storing as-is:", e);
                    encryptedPassword = password;
                }

                // Park the current account before switching (if logged into a different account)
                const { user: prev, authToken: prevToken, refreshToken: prevRefresh, msPassword: prevPass, msCookie: prevCookie, msAccountId: prevMsId, savedAccounts } = get();
                let newSaved = savedAccounts.filter(a => a.email !== email);
                if (prev && prevToken && prevRefresh && prevPass && prev.email !== email) {
                    newSaved = newSaved.filter(a => a.email !== prev.email);
                    newSaved.push({
                        email: prev.email,
                        username: prev.username,
                        accountId: prev.accountId,
                        authToken: prevToken,
                        refreshToken: prevRefresh,
                        msPassword: prevPass,
                        msCookie: prevCookie,
                        msAccountId: prevMsId,
                    });
                }

                set({ authToken: data.token, refreshToken: data.refreshToken, user: newUser, msPassword: encryptedPassword, savedAccounts: newSaved, gold: null });
                scheduleTokenRefresh(get);
                get().fetchGold();

                // Authenticate with the game master server using the username
                // so the user receives a session cookie for game server connections.
                try {
                    const msAuth = await invoke<MsAuthResponse>("ms_authenticate", {
                        username: newUser.username,
                        password,
                    });
                    set({ msCookie: msAuth.cookie, msAccountId: msAuth.accountId });
                } catch (e) {
                    console.warn("Master server auth failed (non-blocking):", e);
                }
            },

            register: async (username: string, email: string, password: string, referralCode?: string) => {
                await tauriFetchPostText(
                    `${authBaseURL}/register`,
                    { username, email, password, ...(referralCode ? { referralCode } : {}) },
                );
            },

            checkUsernameExists: async (username: string) => {
                const data = await tauriFetchPost<CheckExistsResponse>(
                    `${authBaseURL}/check-exists`,
                    { username },
                );
                return data.usernameExists;
            },

            resendVerification: async (email: string) => {
                await tauriFetchPostText(
                    `${authBaseURL}/resend-verification`,
                    { email },
                );
            },

            logout: () => {
                if (refreshTimer) {
                    clearTimeout(refreshTimer);
                    refreshTimer = null;
                }
                set({ authToken: null, refreshToken: null, user: null, gold: null, msCookie: null, msAccountId: null, msPassword: null });
            },

            switchAccount: async (email: string) => {
                const { authToken, refreshToken, user, msPassword, msCookie, msAccountId, savedAccounts } = get();
                const idx = savedAccounts.findIndex(a => a.email === email);
                if (idx === -1) return;

                const target = savedAccounts[idx];
                const updated = savedAccounts.filter((_, i) => i !== idx);

                // Park current account
                if (user && authToken && refreshToken && msPassword) {
                    updated.push({
                        email: user.email,
                        username: user.username,
                        accountId: user.accountId,
                        authToken,
                        refreshToken,
                        msPassword,
                        msCookie,
                        msAccountId,
                    });
                }

                if (refreshTimer) {
                    clearTimeout(refreshTimer);
                    refreshTimer = null;
                }

                set({
                    authToken: target.authToken,
                    refreshToken: target.refreshToken,
                    user: { email: target.email, username: target.username, accountId: target.accountId },
                    msPassword: target.msPassword,
                    msCookie: target.msCookie,
                    msAccountId: target.msAccountId,
                    savedAccounts: updated,
                    gold: null,
                });

                await get().restoreSession();
            },

            removeAccount: (email: string) => {
                set({ savedAccounts: get().savedAccounts.filter(a => a.email !== email) });
            },

            refreshSession: async () => {
                const currentRefreshToken = get().refreshToken;
                if (!currentRefreshToken) return false;

                try {
                    const data = await tauriFetchPost<RefreshTokenResponse>(
                        `${authBaseURL}/refresh-token`,
                        { refreshToken: currentRefreshToken },
                    );

                    const user = extractUser(data.token);
                    set({ authToken: data.token, refreshToken: data.refreshToken, user });
                    scheduleTokenRefresh(get);
                    return true;
                } catch (e: unknown) {
                    const err = e as { status?: number; data?: BanInfo };
                    if (err.status === 401 || err.status === 400) {
                        // Token revoked/expired or account banned — clear silently
                        get().logout();
                    }
                    return false;
                }
            },

            restoreSession: async () => {
                const { refreshToken, authToken } = get();
                if (!refreshToken) return;

                // Check if current JWT is still valid (not expired)
                if (authToken) {
                    try {
                        const decoded = decodeJwtPayload(authToken);
                        const expiresAt = decoded.exp * 1000;
                        if (expiresAt > Date.now()) {
                            // JWT still valid, just schedule the next refresh
                            scheduleTokenRefresh(get);
                            get().fetchGold();

                            // Re-authenticate with the master server if we have
                            // persisted credentials so the cookie stays fresh.
                            const { msPassword, user } = get();
                            if (msPassword && user) {
                                try {
                                    const msAuth = await invoke<MsAuthResponse>("ms_authenticate", {
                                        username: user.username,
                                        password: msPassword,
                                    });
                                    set({ msCookie: msAuth.cookie, msAccountId: msAuth.accountId });
                                } catch {
                                    // Non-blocking — the user can still try connecting later
                                }
                            }
                            return;
                        }
                    } catch {
                        // JWT decode failed, try to refresh
                    }
                }

                // JWT expired or missing, attempt refresh
                const refreshed = await get().refreshSession();

                // After successful refresh, re-authenticate with master server
                if (refreshed) {
                    const { msPassword, user } = get();
                    if (msPassword && user) {
                        try {
                            const msAuth = await invoke<MsAuthResponse>("ms_authenticate", {
                                username: user.username,
                                password: msPassword,
                            });
                            set({ msCookie: msAuth.cookie, msAccountId: msAuth.accountId });
                        } catch {
                            // Non-blocking
                        }
                    }
                }
            },

            isLoggedIn: () => {
                return get().user !== null && get().authToken !== null;
            },

            getTokenExpiry: () => {
                const token = get().authToken;
                if (!token) return null;
                try {
                    return decodeJwtPayload(token).exp;
                } catch {
                    return null;
                }
            },

            fetchGold: async () => {
                const token = get().authToken;
                if (!token) return;
                try {
                    const amount = await tauriFetchAuthJson<number>("https://savage2.net/api/items/gold", token);
                    set({ gold: amount });
                } catch { /* gold unavailable */ }
            },
        }),
        {
            name: "auth-store",
            partialize: (state) => ({
                authToken: state.authToken,
                refreshToken: state.refreshToken,
                user: state.user,
                msCookie: state.msCookie,
                msAccountId: state.msAccountId,
                msPassword: state.msPassword,
                savedAccounts: state.savedAccounts,
            }),
        },
    ),
);
