import { useChangelog } from "@app/hooks/useChangelog";
import { ReleaseChannels } from "@app/hooks/useS2Release";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./ChangelogPage.module.css";
import { BackIcon, ChangelogIcon } from "@app/assets/Icons";
import { useTranslation } from "react-i18next";

const channelNameKeys: Record<string, string> = {
    stable: "community_edition",
    nightly: "beta_test_client",
    legacy: "legacy_client",
};

function ChangelogPage() {
    const { t } = useTranslation();
    const { t: tLaunch } = useTranslation("launch");
    const { channel } = useParams<{ channel: ReleaseChannels }>();
    const navigate = useNavigate();

    const validChannel = (channel === "stable" || channel === "nightly" || channel === "legacy")
        ? channel
        : "stable";

    const { data: changelog, error, isLoading } = useChangelog(validChannel);

    return <>
        <div className={styles.page}>
            <div className={styles.header}>
                <div onClick={() => navigate(-1)} className={styles.header_back}>
                    <BackIcon />
                    {t("return")}
                </div>
                <div className={styles.header_info}>
                    <span className={styles.channel_badge}>{tLaunch(channelNameKeys[validChannel] ?? validChannel)}</span>
                    <div className={styles.title}>
                        <ChangelogIcon />
                        {t("changelog")}
                    </div>
                </div>
            </div>
            <div className={styles.content}>
                {isLoading && (
                    <div className={styles.loading}>{t("loading_changelog")}</div>
                )}
                {error && (
                    <div className={styles.error}>
                        {t("failed_load_changelog", { error: error instanceof Error ? error.message : String(error) })}
                    </div>
                )}
                {changelog && (
                    <div className={styles.changelog_text}>{changelog}</div>
                )}
            </div>
        </div>
    </>;
}

export default ChangelogPage;
