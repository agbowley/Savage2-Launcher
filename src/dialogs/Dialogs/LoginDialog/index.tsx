import React from "react";
import Button, { ButtonColor } from "@app/components/Button";
import { closeDialog } from "../..";
import { useAuthStore } from "@app/stores/AuthStore";
import styles from "./LoginDialog.module.css";
import { open } from "@tauri-apps/api/shell";
import type { BanInfo } from "@app/types/auth";
import i18n from "@app/i18n";

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
            this.setState({ error: i18n.t("enter_email_password", { ns: "dialogs" }) });
            return;
        }

        this.setState({ loading: true, error: null, banInfo: null });

        try {
            await useAuthStore.getState().login(email, password);
            closeDialog("success");
        } catch (err: unknown) {
            const e = err as { status?: number; data?: BanInfo & { code?: string } };

            if (e.status === 401) {
                this.setState({ error: i18n.t("invalid_credentials", { ns: "dialogs" }), loading: false });
            } else if (e.status === 400 && e.data?.code === "ACCOUNT_BANNED") {
                this.setState({ banInfo: e.data, loading: false });
            } else if (e.status === 400 && e.data?.code === "EMAIL_NOT_VERIFIED") {
                this.setState({
                    needsVerification: true,
                    verificationEmail: email,
                    loading: false,
                });
            } else {
                this.setState({ error: i18n.t("something_wrong", { ns: "dialogs" }), loading: false });
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
                    {i18n.t("sign_in_heading", { ns: "dialogs" })}
                </div>

                {banInfo && (
                    <div className={styles.banInfo}>
                        <p><strong>{i18n.t("banned_heading", { ns: "dialogs" })}</strong></p>
                        <p>{i18n.t("ban_reason", { ns: "dialogs", reason: banInfo.banReason })}</p>
                        {banInfo.bannedUntil && (
                            <p>{i18n.t("ban_until", { ns: "dialogs", date: new Date(banInfo.bannedUntil).toLocaleDateString() })}</p>
                        )}
                    </div>
                )}

                {error && <div className={styles.error}>{error}</div>}

                {needsVerification ? (
                    <div className={styles.verifyNotice}>
                        <p>{i18n.t("email_not_verified", { ns: "dialogs" })}</p>
                        {resendSuccess ? (
                            <p style={{ color: "var(--green)" }}>{i18n.t("verification_sent", { ns: "dialogs" })}</p>
                        ) : (
                            <button
                                className={styles.link}
                                onClick={this.handleResendVerification}
                                disabled={resendLoading}
                            >
                                {resendLoading ? i18n.t("sending", { ns: "dialogs" }) : i18n.t("resend_verification", { ns: "dialogs" })}
                            </button>
                        )}
                    </div>
                ) : (
                    <form onSubmit={this.handleSubmit}>
                        <div className={styles.form}>
                            <div className={styles.field}>
                                <label>{i18n.t("email_label", { ns: "dialogs" })}</label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => this.setState({ email: e.target.value, error: null })}
                                    placeholder={i18n.t("email_placeholder", { ns: "dialogs" })}
                                    autoFocus
                                    disabled={loading}
                                />
                            </div>

                            <div className={styles.field}>
                                <label>{i18n.t("password_label", { ns: "dialogs" })}</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => this.setState({ password: e.target.value, error: null })}
                                    placeholder={i18n.t("password_placeholder", { ns: "dialogs" })}
                                    disabled={loading}
                                />
                            </div>

                            <Button
                                color={ButtonColor.YELLOW}
                                disabled={loading || !email || !password}
                                onClick={this.handleSubmit}
                            >
                                {loading ? i18n.t("signing_in", { ns: "dialogs" }) : i18n.t("sign_in_heading", { ns: "dialogs" })}
                            </Button>

                            <div className={styles.links}>
                                <button type="button" className={styles.link} onClick={this.handleForgotPassword}>
                                    {i18n.t("forgot_password", { ns: "dialogs" })}
                                </button>
                                <button type="button" className={styles.link} onClick={this.handleCreateAccount}>
                                    {i18n.t("create_account_link", { ns: "dialogs" })}
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>

            <div className={styles.buttons}>
                <Button color={ButtonColor.GRAY} compact onClick={() => closeDialog()}>
                    {i18n.t("cancel", { ns: "common" })}
                </Button>
            </div>
        </>;
    }
}
