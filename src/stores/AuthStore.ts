import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tauriFetchPost, tauriFetchPostText, tauriFetchAuthJson } from "@app/utils/tauriFetch";
import { authBaseURL } from "@app/utils/consts";
import type {
    AuthUser,
    LoginResponse,
    RefreshTokenResponse,
    CheckExistsResponse,
    DecodedJwt,
    BanInfo,
} from "@app/types/auth";

interface AuthState {
    authToken: string | null;
    refreshToken: string | null;
    user: AuthUser | null;
    gold: number | null;

    login: (email: string, password: string) => Promise<void>;
    register: (username: string, email: string, password: string, referralCode?: string) => Promise<void>;
    checkUsernameExists: (username: string) => Promise<boolean>;
    resendVerification: (email: string) => Promise<void>;
    logout: () => void;
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

            login: async (email: string, password: string) => {
                const data = await tauriFetchPost<LoginResponse>(
                    `${authBaseURL}/login`,
                    { email, password },
                );

                const user = extractUser(data.token);
                set({ authToken: data.token, refreshToken: data.refreshToken, user });
                scheduleTokenRefresh(get);
                // Fetch gold after login
                get().fetchGold();
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
                set({ authToken: null, refreshToken: null, user: null, gold: null });
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
                            return;
                        }
                    } catch {
                        // JWT decode failed, try to refresh
                    }
                }

                // JWT expired or missing, attempt refresh
                await get().refreshSession();
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
            }),
        },
    ),
);
