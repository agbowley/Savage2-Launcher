import React from "react";
import Button, { ButtonColor } from "@app/components/Button";
import { closeDialog } from "../..";
import { useAuthStore } from "@app/stores/AuthStore";
import styles from "./RegisterDialog.module.css";
import i18n from "@app/i18n";

type Step = "username" | "credentials" | "verify";

interface RegisterDialogState {
    step: Step;
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    referralCode: string;
    loading: boolean;
    error: string | null;
    usernameAvailable: boolean | null;
    checkingUsername: boolean;
    resendLoading: boolean;
    resendSuccess: boolean;
}

const USERNAME_REGEX = /^[a-zA-Z0-9\-_]+$/;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export class RegisterDialog extends React.Component<Record<string, unknown>, RegisterDialogState> {
    private usernameTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(props: Record<string, unknown>) {
        super(props);
        this.state = {
            step: "username",
            username: "",
            email: "",
            password: "",
            confirmPassword: "",
            referralCode: "",
            loading: false,
            error: null,
            usernameAvailable: null,
            checkingUsername: false,
            resendLoading: false,
            resendSuccess: false,
        };
    }

    componentWillUnmount() {
        if (this.usernameTimer) clearTimeout(this.usernameTimer);
    }

    handleUsernameChange = (value: string) => {
        this.setState({ username: value, usernameAvailable: null, error: null });

        if (this.usernameTimer) clearTimeout(this.usernameTimer);

        if (!value || value.length < 1) return;

        if (!USERNAME_REGEX.test(value)) {
            return;
        }

        this.usernameTimer = setTimeout(async () => {
            this.setState({ checkingUsername: true });
            try {
                const exists = await useAuthStore.getState().checkUsernameExists(value);
                // Only update if the username hasn't changed since we started checking
                if (this.state.username === value) {
                    this.setState({ usernameAvailable: !exists, checkingUsername: false });
                }
            } catch {
                this.setState({ checkingUsername: false });
            }
        }, 500);
    };

    handleUsernameNext = () => {
        const { username, usernameAvailable } = this.state;

        if (!username || username.length < 1 || username.length > 25) {
            this.setState({ error: i18n.t("username_length_error", { ns: "dialogs" }) });
            return;
        }
        if (!USERNAME_REGEX.test(username)) {
            this.setState({ error: i18n.t("username_chars_error", { ns: "dialogs" }) });
            return;
        }
        if (usernameAvailable === false) {
            this.setState({ error: i18n.t("username_taken_error", { ns: "dialogs" }) });
            return;
        }

        this.setState({ step: "credentials", error: null });
    };

    getPasswordValidation() {
        const { password } = this.state;
        return {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            digit: /\d/.test(password),
            special: /[^A-Za-z0-9]/.test(password),
        };
    }

    handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        const { username, email, password, confirmPassword, referralCode } = this.state;

        if (!email) {
            this.setState({ error: i18n.t("enter_email_error", { ns: "dialogs" }) });
            return;
        }

        if (!PASSWORD_REGEX.test(password)) {
            this.setState({ error: i18n.t("password_requirements_error", { ns: "dialogs" }) });
            return;
        }

        if (password !== confirmPassword) {
            this.setState({ error: i18n.t("passwords_no_match", { ns: "dialogs" }) });
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            await useAuthStore.getState().register(username, email, password, referralCode || undefined);
            this.setState({ step: "verify", loading: false });
        } catch (err: unknown) {
            const e = err as { status?: number; data?: string };
            if (e.status === 409) {
                this.setState({ error: i18n.t("username_email_taken", { ns: "dialogs" }), loading: false });
            } else {
                this.setState({ error: i18n.t("registration_failed", { ns: "dialogs" }), loading: false });
            }
        }
    };

    handleResendVerification = async () => {
        this.setState({ resendLoading: true, resendSuccess: false });
        try {
            await useAuthStore.getState().resendVerification(this.state.email);
            this.setState({ resendSuccess: true, resendLoading: false });
        } catch {
            this.setState({ resendLoading: false });
        }
    };

    handleBackToLogin = () => {
        closeDialog("login");
    };

    renderStepIndicator() {
        const steps: Step[] = ["username", "credentials", "verify"];
        const currentIndex = steps.indexOf(this.state.step);

        return (
            <div className={styles.steps}>
                {steps.map((s, i) => (
                    <div
                        key={s}
                        className={`${styles.step} ${i <= currentIndex ? styles.active : ""}`}
                    />
                ))}
            </div>
        );
    }

    renderUsernameStep() {
        const { username, usernameAvailable, checkingUsername, error } = this.state;
        const validFormat = !username || USERNAME_REGEX.test(username);

        return (
            <div className={styles.form}>
                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.field}>
                    <label>{i18n.t("username_label", { ns: "dialogs" })}</label>
                    <input
                        type="text"
                        value={username}
                        onChange={e => this.handleUsernameChange(e.target.value)}
                        placeholder={i18n.t("choose_username", { ns: "dialogs" })}
                        maxLength={25}
                        autoFocus
                    />
                    <div className={styles.fieldHint}>
                        {i18n.t("username_hint", { ns: "dialogs" })}
                    </div>
                    {username && !validFormat && (
                        <div className={`${styles.fieldStatus} ${styles.taken}`}>
                            {i18n.t("invalid_chars", { ns: "dialogs" })}
                        </div>
                    )}
                    {checkingUsername && (
                        <div className={styles.fieldStatus} style={{ color: "rgba(255,255,255,0.4)" }}>
                            {i18n.t("checking_username", { ns: "dialogs" })}
                        </div>
                    )}
                    {usernameAvailable === true && (
                        <div className={`${styles.fieldStatus} ${styles.available}`}>
                            {i18n.t("username_available", { ns: "dialogs" })}
                        </div>
                    )}
                    {usernameAvailable === false && (
                        <div className={`${styles.fieldStatus} ${styles.taken}`}>
                            {i18n.t("username_already_taken", { ns: "dialogs" })}
                        </div>
                    )}
                </div>

                <Button
                    color={ButtonColor.YELLOW}
                    disabled={!username || !validFormat || usernameAvailable === false || checkingUsername}
                    onClick={this.handleUsernameNext}
                >
                    {i18n.t("next", { ns: "common" })}
                </Button>

                <div className={styles.backLink}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>{i18n.t("already_have_account", { ns: "dialogs" })} </span>
                    <button type="button" className={styles.link} onClick={this.handleBackToLogin}>
                        {i18n.t("sign_in_link", { ns: "dialogs" })}
                    </button>
                </div>
            </div>
        );
    }

    renderCredentialsStep() {
        const { email, password, confirmPassword, referralCode, loading, error } = this.state;
        const pv = this.getPasswordValidation();

        return (
            <form onSubmit={this.handleRegister}>
                <div className={styles.form}>
                    {error && <div className={styles.error}>{error}</div>}

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
                            placeholder={i18n.t("create_password_placeholder", { ns: "dialogs" })}
                            disabled={loading}
                        />
                        <ul className={styles.validationList}>
                            <li className={pv.length ? styles.met : styles.unmet}>
                                {pv.length ? "\u2713" : "\u2022"} {i18n.t("pw_8_chars", { ns: "dialogs" })}
                            </li>
                            <li className={pv.uppercase ? styles.met : styles.unmet}>
                                {pv.uppercase ? "\u2713" : "\u2022"} {i18n.t("pw_uppercase", { ns: "dialogs" })}
                            </li>
                            <li className={pv.digit ? styles.met : styles.unmet}>
                                {pv.digit ? "\u2713" : "\u2022"} {i18n.t("pw_number", { ns: "dialogs" })}
                            </li>
                            <li className={pv.special ? styles.met : styles.unmet}>
                                {pv.special ? "\u2713" : "\u2022"} {i18n.t("pw_special", { ns: "dialogs" })}
                            </li>
                        </ul>
                    </div>

                    <div className={styles.field}>
                        <label>{i18n.t("confirm_password_label", { ns: "dialogs" })}</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => this.setState({ confirmPassword: e.target.value, error: null })}
                            placeholder={i18n.t("confirm_password_placeholder", { ns: "dialogs" })}
                            disabled={loading}
                        />
                    </div>

                    <div className={styles.field}>
                        <label>{i18n.t("referral_label", { ns: "dialogs" })} <span style={{ opacity: 0.5 }}>{i18n.t("optional", { ns: "dialogs" })}</span></label>
                        <input
                            type="text"
                            value={referralCode}
                            onChange={e => this.setState({ referralCode: e.target.value })}
                            placeholder={i18n.t("referral_placeholder", { ns: "dialogs" })}
                            disabled={loading}
                        />
                    </div>

                    <Button
                        color={ButtonColor.YELLOW}
                        disabled={loading || !email || !PASSWORD_REGEX.test(password) || password !== confirmPassword}
                        onClick={this.handleRegister}
                    >
                        {loading ? i18n.t("creating_account", { ns: "dialogs" }) : i18n.t("create_account_heading", { ns: "dialogs" })}
                    </Button>

                    <div className={styles.backLink}>
                        <button
                            type="button"
                            className={styles.link}
                            onClick={() => this.setState({ step: "username", error: null })}
                        >
                            {i18n.t("back", { ns: "common" })}
                        </button>
                    </div>
                </div>
            </form>
        );
    }

    renderVerifyStep() {
        const { resendLoading, resendSuccess } = this.state;

        return (
            <div className={styles.form}>
                <div className={styles.successMessage}>
                    <p dangerouslySetInnerHTML={{ __html: i18n.t("account_created", { ns: "dialogs", email: this.state.email }) }} />
                    <p>{i18n.t("account_created_hint", { ns: "dialogs" })}</p>
                </div>

                {resendSuccess ? (
                    <p style={{ color: "var(--green)", textAlign: "center", fontSize: "13px" }}>
                        {i18n.t("verification_resent", { ns: "dialogs" })}
                    </p>
                ) : (
                    <div style={{ textAlign: "center" }}>
                        <button
                            className={styles.link}
                            onClick={this.handleResendVerification}
                            disabled={resendLoading}
                            style={{ fontSize: "13px" }}
                        >
                            {resendLoading ? i18n.t("sending", { ns: "dialogs" }) : i18n.t("resend_verification", { ns: "dialogs" })}
                        </button>
                    </div>
                )}
            </div>
        );
    }

    render() {
        const { step } = this.state;

        return <>
            <div className={styles.form}>
                <div style={{ textAlign: "center", color: "#fff", fontSize: "18px", fontWeight: 700 }}>
                    {i18n.t("create_account_heading", { ns: "dialogs" })}
                </div>

                {this.renderStepIndicator()}

                {step === "username" && this.renderUsernameStep()}
                {step === "credentials" && this.renderCredentialsStep()}
                {step === "verify" && this.renderVerifyStep()}
            </div>

            <div className={styles.buttons}>
                <Button color={ButtonColor.GRAY} compact onClick={() => closeDialog()}>
                    {step === "verify" ? i18n.t("done", { ns: "common" }) : i18n.t("cancel", { ns: "common" })}
                </Button>
            </div>
        </>;
    }
}
