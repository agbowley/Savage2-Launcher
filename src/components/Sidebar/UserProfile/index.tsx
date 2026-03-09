import styles from "./UserProfile.module.css";
import { useAuthStore } from "@app/stores/AuthStore";
import Button, { ButtonColor } from "@app/components/Button";
import { showLoginDialog } from "@app/dialogs/dialogUtil";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { useEffect, useState } from "react";
import TooltipWrapper from "@app/components/TooltipWrapper";
import { useTranslation } from "react-i18next";

const LogoutIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

const GoldIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" className={styles.goldIcon}>
        <circle cx="12" cy="12" r="10" fill="#FFD700" />
        <circle cx="12" cy="12" r="8" fill="#FFC107" />
        <circle cx="12" cy="12" r="7.5" stroke="#B8860B" strokeWidth="0.5" fill="none" />
        <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#8B6914" fontFamily="serif">$</text>
    </svg>
);

const AchievementIcon = () => (
    <svg viewBox="0 0 24 24" className={styles.achievementIcon}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" fill="#9C27B0" />
    </svg>
);

function calcLevel(exp: number) {
    return Math.floor(Math.cbrt(exp) / 3) + 1;
}

function calcLevelProgress(exp: number) {
    const level = calcLevel(exp);
    const minExp = Math.pow((level - 1) * 3, 3);
    const maxExp = Math.pow(level * 3, 3);
    return {
        level,
        progress: ((exp - minExp) / (maxExp - minExp)) * 100,
        currentExp: exp,
        maxExp,
    };
}

const RING_SIZE = 42;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const UserProfile: React.FC = () => {
    const { t } = useTranslation("sidebar");
    const user = useAuthStore(s => s.user);
    const logout = useAuthStore(s => s.logout);
    const gold = useAuthStore(s => s.gold);
    const [levelInfo, setLevelInfo] = useState<{ level: number; progress: number; currentExp: number; maxExp: number } | null>(null);
    const [achievementPoints, setAchievementPoints] = useState<number | null>(null);

    useEffect(() => {
        if (!user) {
            setLevelInfo(null);
            setAchievementPoints(null);
            return;
        }

        tauriFetchJson<{ exp: number | null; achievementPoints: number | null }>(`https://savage2.net/api/stats/${encodeURIComponent(user.username)}`)
            .then(data => {
                if (data.exp != null) {
                    setLevelInfo(calcLevelProgress(data.exp));
                }
                if (data.achievementPoints != null) {
                    setAchievementPoints(data.achievementPoints);
                }
            })
            .catch(() => { /* stats unavailable */ });
    }, [user]);

    if (!user) {
        return (
            <div className={`${styles.userProfile} ${styles.signedOut}`}>
                <Button
                    color={ButtonColor.YELLOW}
                    className={styles.signInButton}
                    onClick={showLoginDialog}
                    height={38}
                >
                    {t("sign_in")}
                </Button>
            </div>
        );
    }

    const initial = user.username.charAt(0);
    const dashOffset = levelInfo
        ? RING_CIRCUMFERENCE - (levelInfo.progress / 100) * RING_CIRCUMFERENCE
        : RING_CIRCUMFERENCE;

    const avatarWithRing = (
        <div className={styles.avatarWrapper}>
            <svg className={styles.levelRing} width={RING_SIZE} height={RING_SIZE}>
                <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.08)"
                    strokeWidth={RING_STROKE}
                />
                <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_RADIUS}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={RING_STROKE}
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={dashOffset}
                    transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
                />
            </svg>
            <div className={styles.avatar}>{initial}</div>
        </div>
    );

    return (
        <div className={styles.userProfile}>
            {levelInfo ? (
                <TooltipWrapper text={t("level_tooltip", { level: levelInfo.level, currentExp: levelInfo.currentExp.toLocaleString(), maxExp: levelInfo.maxExp.toLocaleString() })}>
                    {avatarWithRing}
                </TooltipWrapper>
            ) : (
                avatarWithRing
            )}
            <div className={styles.userInfo}>
                <div className={styles.username}>{user.username}</div>
                <div className={styles.subtitle}>
                    {levelInfo && <span>{t("level", { level: levelInfo.level })}</span>}
                    {gold != null && (
                        <span className={styles.gold}>
                            <GoldIcon />
                            {gold.toLocaleString()}
                        </span>
                    )}
                    {achievementPoints != null && (
                        <span className={styles.achievement}>
                            <AchievementIcon />
                            {achievementPoints.toLocaleString()}
                        </span>
                    )}
                    {!levelInfo && gold == null && achievementPoints == null && <span>{t("signed_in")}</span>}
                </div>
            </div>
            <button className={styles.logoutButton} onClick={logout} title={t("sign_out")}>
                <LogoutIcon />
            </button>
        </div>
    );
};

export default UserProfile;
