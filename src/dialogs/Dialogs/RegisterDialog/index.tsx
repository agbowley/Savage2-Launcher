import React from "react";
import Button, { ButtonColor } from "@app/components/Button";
import { closeDialog } from "../..";
import { useAuthStore } from "@app/stores/AuthStore";
import styles from "./RegisterDialog.module.css";

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
            this.setState({ error: "Username must be 1-25 characters." });
            return;
        }
        if (!USERNAME_REGEX.test(username)) {
            this.setState({ error: "Username can only contain letters, numbers, hyphens, and underscores." });
            return;
        }
        if (usernameAvailable === false) {
            this.setState({ error: "This username is already taken." });
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
            this.setState({ error: "Please enter your email address." });
            return;
        }

        if (!PASSWORD_REGEX.test(password)) {
            this.setState({ error: "Password does not meet the requirements." });
            return;
        }

        if (password !== confirmPassword) {
            this.setState({ error: "Passwords do not match." });
            return;
        }

        this.setState({ loading: true, error: null });

        try {
            await useAuthStore.getState().register(username, email, password, referralCode || undefined);
            this.setState({ step: "verify", loading: false });
        } catch (err: unknown) {
            const e = err as { status?: number; data?: string };
            if (e.status === 409) {
                this.setState({ error: "Username or email is already taken.", loading: false });
            } else {
                this.setState({ error: "Registration failed. Please try again.", loading: false });
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
                    <label>Username</label>
                    <input
                        type="text"
                        value={username}
                        onChange={e => this.handleUsernameChange(e.target.value)}
                        placeholder="Choose a username"
                        maxLength={25}
                        autoFocus
                    />
                    <div className={styles.fieldHint}>
                        1-25 characters. Letters, numbers, hyphens, underscores only.
                    </div>
                    {username && !validFormat && (
                        <div className={`${styles.fieldStatus} ${styles.taken}`}>
                            Invalid characters
                        </div>
                    )}
                    {checkingUsername && (
                        <div className={styles.fieldStatus} style={{ color: "rgba(255,255,255,0.4)" }}>
                            Checking...
                        </div>
                    )}
                    {usernameAvailable === true && (
                        <div className={`${styles.fieldStatus} ${styles.available}`}>
                            Username is available!
                        </div>
                    )}
                    {usernameAvailable === false && (
                        <div className={`${styles.fieldStatus} ${styles.taken}`}>
                            Username is already taken
                        </div>
                    )}
                </div>

                <Button
                    color={ButtonColor.YELLOW}
                    disabled={!username || !validFormat || usernameAvailable === false || checkingUsername}
                    onClick={this.handleUsernameNext}
                >
                    Next
                </Button>

                <div className={styles.backLink}>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Already have an account? </span>
                    <button type="button" className={styles.link} onClick={this.handleBackToLogin}>
                        Sign in
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
                            placeholder="Create a password"
                            disabled={loading}
                        />
                        <ul className={styles.validationList}>
                            <li className={pv.length ? styles.met : styles.unmet}>
                                {pv.length ? "\u2713" : "\u2022"} At least 8 characters
                            </li>
                            <li className={pv.uppercase ? styles.met : styles.unmet}>
                                {pv.uppercase ? "\u2713" : "\u2022"} One uppercase letter
                            </li>
                            <li className={pv.digit ? styles.met : styles.unmet}>
                                {pv.digit ? "\u2713" : "\u2022"} One number
                            </li>
                            <li className={pv.special ? styles.met : styles.unmet}>
                                {pv.special ? "\u2713" : "\u2022"} One special character
                            </li>
                        </ul>
                    </div>

                    <div className={styles.field}>
                        <label>Confirm Password</label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => this.setState({ confirmPassword: e.target.value, error: null })}
                            placeholder="Confirm your password"
                            disabled={loading}
                        />
                    </div>

                    <div className={styles.field}>
                        <label>Referral Code <span style={{ opacity: 0.5 }}>(optional)</span></label>
                        <input
                            type="text"
                            value={referralCode}
                            onChange={e => this.setState({ referralCode: e.target.value })}
                            placeholder="Friend's username"
                            disabled={loading}
                        />
                    </div>

                    <Button
                        color={ButtonColor.YELLOW}
                        disabled={loading || !email || !PASSWORD_REGEX.test(password) || password !== confirmPassword}
                        onClick={this.handleRegister}
                    >
                        {loading ? "Creating account..." : "Create Account"}
                    </Button>

                    <div className={styles.backLink}>
                        <button
                            type="button"
                            className={styles.link}
                            onClick={() => this.setState({ step: "username", error: null })}
                        >
                            Back
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
                    <p>Account created! We&apos;ve sent a verification email to <strong>{this.state.email}</strong>.</p>
                    <p>Please check your inbox and click the verification link to activate your account, then sign in.</p>
                </div>

                {resendSuccess ? (
                    <p style={{ color: "var(--green)", textAlign: "center", fontSize: "13px" }}>
                        Verification email resent!
                    </p>
                ) : (
                    <div style={{ textAlign: "center" }}>
                        <button
                            className={styles.link}
                            onClick={this.handleResendVerification}
                            disabled={resendLoading}
                            style={{ fontSize: "13px" }}
                        >
                            {resendLoading ? "Sending..." : "Resend verification email"}
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
                    Create Account
                </div>

                {this.renderStepIndicator()}

                {step === "username" && this.renderUsernameStep()}
                {step === "credentials" && this.renderCredentialsStep()}
                {step === "verify" && this.renderVerifyStep()}
            </div>

            <div className={styles.buttons}>
                <Button color={ButtonColor.GRAY} compact onClick={() => closeDialog()}>
                    {step === "verify" ? "Done" : "Cancel"}
                </Button>
            </div>
        </>;
    }
}
