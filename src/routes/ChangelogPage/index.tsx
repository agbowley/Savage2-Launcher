import { useChangelog } from "@app/hooks/useChangelog";
import { ReleaseChannels, useS2Release } from "@app/hooks/useS2Release";
import { useNavigate, useParams } from "react-router-dom";
import styles from "./ChangelogPage.module.css";
import { BackIcon, ChangelogIcon } from "@app/assets/Icons";

function ChangelogPage() {
    const { channel } = useParams<{ channel: ReleaseChannels }>();
    const navigate = useNavigate();

    const validChannel = (channel === "stable" || channel === "nightly" || channel === "legacy")
        ? channel
        : "stable";

    const { data: releaseData } = useS2Release(validChannel);
    const { data: changelog, error, isLoading } = useChangelog(validChannel);

    return <>
        <div className={styles.page}>
            <div className={styles.header}>
                <div onClick={() => navigate(-1)} className={styles.header_back}>
                    <BackIcon />
                    RETURN
                </div>
                <div className={styles.header_info}>
                    <span className={styles.channel_badge}>{releaseData?.name}</span>
                    <div className={styles.title}>
                        <ChangelogIcon />
                        Changelog
                    </div>
                </div>
            </div>
            <div className={styles.content}>
                {isLoading && (
                    <div className={styles.loading}>Loading changelog...</div>
                )}
                {error && (
                    <div className={styles.error}>
                        Failed to load changelog: {error instanceof Error ? error.message : String(error)}
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
