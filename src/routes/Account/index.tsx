import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./Account.module.css";
import { useAuthStore } from "@app/stores/AuthStore";
import { showGoldHistory } from "@app/dialogs/dialogUtil";
import RuneBuilder from "./RuneBuilder";
import RuneVault from "./RuneVault";
import { useTranslation } from "react-i18next";

type Tab = "vault" | "builder";

function Account() {
    const { t } = useTranslation("account");
    const user = useAuthStore(s => s.user);
    const gold = useAuthStore(s => s.gold);
    const fetchGold = useAuthStore(s => s.fetchGold);
    const navigate = useNavigate();
    const [tab, setTab] = useState<Tab>("builder");
    const [vaultRefresh, setVaultRefresh] = useState(0);
    const [vaultNotify, setVaultNotify] = useState(false);

    useEffect(() => {
        if (!user) {
            navigate("/");
        }
    }, [user, navigate]);

    const handleGoldChanged = () => {
        fetchGold();
        setVaultRefresh(k => k + 1);
    };

    const handleRuneCreated = () => {
        handleGoldChanged();
        if (tab !== "vault") setVaultNotify(true);
    };

    const switchToVault = () => {
        setTab("vault");
        setVaultNotify(false);
    };

    if (!user) return null;

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <h1 className={styles.heading}>{t("my_account")}</h1>
                {gold != null && (
                    <div className={styles.goldBadge} onClick={showGoldHistory} role="button" tabIndex={0}>
                        <GoldIcon />
                        {gold.toLocaleString()}
                    </div>
                )}
            </div>

            <div className={styles.tabs}>
                <button
                    className={`${styles.tab} ${tab === "builder" ? styles.tabActive : ""}`}
                    onClick={() => setTab("builder")}
                >
                    {t("rune_builder")}
                </button>
                <button
                    className={`${styles.tab} ${tab === "vault" ? styles.tabActive : ""}`}
                    onClick={switchToVault}
                >
                    {t("rune_vault")}
                    {vaultNotify && <span className={styles.notifyDot} />}
                </button>
            </div>

            <div className={styles.tabContent}>
                {tab === "builder" && (
                    <RuneBuilder onGoldChanged={handleRuneCreated} />
                )}
                {tab === "vault" && (
                    <RuneVault onGoldChanged={handleGoldChanged} refreshKey={vaultRefresh} />
                )}
            </div>
        </div>
    );
}

const GoldIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16, flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10" fill="#FFD700" />
        <circle cx="12" cy="12" r="8" fill="#FFC107" />
        <circle cx="12" cy="12" r="7.5" stroke="#B8860B" strokeWidth="0.5" fill="none" />
        <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#8B6914" fontFamily="serif">$</text>
    </svg>
);

export default Account;
