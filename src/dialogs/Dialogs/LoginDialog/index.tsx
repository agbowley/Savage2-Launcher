import React from "react";
import Button, { ButtonColor } from "@app/components/Button";
import { closeDialog } from "../..";
import { useAuthStore } from "@app/stores/AuthStore";
import styles from "./LoginDialog.module.css";
import { open } from "@tauri-apps/api/shell";
import type { BanInfo } from "@app/types/auth";

interface LoginDialogState {
    email: string;
    password: string;
    loading: boolean;
    error: string | null;
    banInfo: BanInfo | null;
    needsVerification: boolean;
    verificationEmail: string;
    resendLoading: boolean;
    resendSuccess: boolean;
}

export class LoginDialog extends React.Component<Record<string, unknown>, LoginDialogState> {
    constructor(props: Record<string, unknown>) {
        super(props);
        this.state = {
            email: "",
            password: "",
            loading: false,
            error: null,
            banInfo: null,
            needsVerification: false,
            verificationEmail: "",
            resendLoading: false,
            resendSuccess: false,
        };
    }

    handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const { email, password } = this.state;

        if (!email || !password) {
            this.setState({ error: "Please enter your email and password." });
            return;
        }

        this.setState({ loading: true, error: null, banInfo: null });

        try {
            await useAuthStore.getState().login(email, password);
            closeDialog("success");
        } catch (err: unknown) {
            const e = err as { status?: number; data?: BanInfo & { code?: string } };

            if (e.status === 401) {
                this.setState({ error: "Invalid email or password.", loading: false });
            } else if (e.status === 400 && e.data?.code === "ACCOUNT_BANNED") {
                this.setState({ banInfo: e.data, loading: false });
            } else if (e.status === 400 && e.data?.code === "EMAIL_NOT_VERIFIED") {
                this.setState({
                    needsVerification: true,
                    verificationEmail: email,
                    loading: false,
                });
            } else {
                this.setState({ error: "Something went wrong. Please try again.", loading: false });
            }
        }
    };

    handleResendVerification = async () => {
        this.setState({ resendLoading: true, resendSuccess: false });
        try {
            await useAuthStore.getState().resendVerification(this.state.verificationEmail);
            this.setState({ resendSuccess: true, resendLoading: false });
        } catch {
            this.setState({ resendLoading: false });
        }
    };

    handleForgotPassword = () => {
        open("https://savage2.net/forgot-password");
    };

    handleCreateAccount = () => {
        closeDialog("register");
    };

    render() {
        const { email, password, loading, error, banInfo, needsVerification, resendLoading, resendSuccess } = this.state;

        return <>
            <div className={styles.form}>
                <div style={{ textAlign: "center", color: "#fff", fontSize: "18px", fontWeight: 700 }}>
                    Sign In
                </div>

                {banInfo && (
                    <div className={styles.banInfo}>
                        <p><strong>Your account has been banned.</strong></p>
                        <p>Reason: {banInfo.banReason}</p>
                        {banInfo.bannedUntil && (
                            <p>Until: {new Date(banInfo.bannedUntil).toLocaleDateString()}</p>
                        )}
                    </div>
                )}

                {error && <div className={styles.error}>{error}</div>}

                {needsVerification ? (
                    <div className={styles.verifyNotice}>
                        <p>Your email address has not been verified. Please check your inbox for a verification email.</p>
                        {resendSuccess ? (
                            <p style={{ color: "var(--green)" }}>Verification email sent!</p>
                        ) : (
                            <button
                                className={styles.link}
                                onClick={this.handleResendVerification}
                                disabled={resendLoading}
                            >
                                {resendLoading ? "Sending..." : "Resend verification email"}
                            </button>
                        )}
                    </div>
                ) : (
                    <form onSubmit={this.handleSubmit}>
                        <div className={styles.form}>
                            <div className={styles.field}>
                                <label>Email</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => this.setState({ email: e.target.value, error: null })}
                                    placeholder="you@example.com"
                                    autoFocus
                                    disabled={loading}
                                />
                            </div>

                            <div className={styles.field}>
                                <label>Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => this.setState({ password: e.target.value, error: null })}
                                    placeholder="Your password"
                                    disabled={loading}
                                />
                            </div>

                            <Button
                                color={ButtonColor.YELLOW}
                                disabled={loading || !email || !password}
                                onClick={this.handleSubmit}
                            >
                                {loading ? "Signing in..." : "Sign In"}
                            </Button>

                            <div className={styles.links}>
                                <button type="button" className={styles.link} onClick={this.handleForgotPassword}>
                                    Forgot password?
                                </button>
                                <button type="button" className={styles.link} onClick={this.handleCreateAccount}>
                                    Create account
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>

            <div className={styles.buttons}>
                <Button color={ButtonColor.GRAY} compact onClick={() => closeDialog()}>
                    Cancel
                </Button>
            </div>
        </>;
    }
}
