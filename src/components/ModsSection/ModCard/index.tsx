import styles from "./ModCard.module.css";
import { repositoryBaseURL } from "@app/utils/consts";
import { CheckmarkIcon, DownloadIcon, DriveIcon } from "@app/assets/Icons";
import { getNewsBanner } from "@app/assets/NewsBanners";
import type { ModListItem } from "@app/types/mods";
import { useNavigate } from "react-router-dom";
import CachedImage from "@app/components/CachedImage";

interface Props {
    mod: ModListItem;
    isInstalled?: boolean;
    isEnabled?: boolean;
    isTool?: boolean;
    isPending?: boolean;
    channel: string;
    onInstall?: (mod: ModListItem) => void;
    onUninstall?: (mod: ModListItem) => void;
    onToggleEnabled?: (mod: ModListItem) => void;
    onOpenFolder?: (mod: ModListItem) => void;
}

const ModCard: React.FC<Props> = ({
    mod: modItem,
    isInstalled,
    isEnabled,
    isTool,
    isPending,
    channel,
    onInstall,
    onUninstall,
    onToggleEnabled,
    onOpenFolder,
}: Props) => {
    const navigate = useNavigate();

    const imageUrl = modItem.primaryImageUrl
        ? `${repositoryBaseURL}${modItem.primaryImageUrl}`
        : null;

    // When no explicit image, use a deterministic banner based on mod id
    const fallbackBanner = getNewsBanner(modItem.id);

    return (
        <div
            className={styles.card}
            onClick={() => navigate(`/mods/${modItem.id}?channel=${channel}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    navigate(`/mods/${modItem.id}?channel=${channel}`);
                }
            }}
        >
            {modItem.isPinned && <span className={styles.pinned_badge}>Pinned</span>}

            {isInstalled && (
                <span className={styles.installed_indicator}>
                    <CheckmarkIcon />
                </span>
            )}

            <div className={styles.thumbnail}>
                <CachedImage
                    cachedSrc={imageUrl}
                    fallbackSrc={fallbackBanner.url}
                    alt={modItem.name}
                />
            </div>

            <div className={styles.body}>
                <div className={styles.name_row}>
                    <span className={styles.name} title={modItem.name}>{modItem.name}</span>
                    {/* Quick actions — aligned right on the name row */}
                    <div className={styles.card_actions} onClick={(e) => e.stopPropagation()}>
                        {isInstalled && (
                            isTool ? (
                                <button
                                    className={`${styles.card_action_btn} ${styles.card_folder_btn}`}
                                    onClick={() => onOpenFolder?.(modItem)}
                                    title="Open mod folder"
                                >
                                    <DriveIcon /> Folder
                                </button>
                            ) : (
                                <button
                                    className={`${styles.card_action_btn} ${isEnabled ? styles.card_enabled_btn : styles.card_disabled_btn}`}
                                    onClick={() => onToggleEnabled?.(modItem)}
                                    title={isEnabled ? "Disable mod" : "Enable mod"}
                                >
                                    {isEnabled ? "Enabled" : "Disabled"}
                                </button>
                            )
                        )}
                        {isInstalled ? (
                            <button
                                className={`${styles.card_action_btn} ${styles.card_uninstall_btn}`}
                                onClick={() => onUninstall?.(modItem)}
                                title="Remove mod"
                            >
                                Remove
                            </button>
                        ) : (
                            <button
                                className={`${styles.card_action_btn} ${styles.card_install_btn}`}
                                onClick={() => onInstall?.(modItem)}
                                title="Install mod"
                                disabled={isPending}
                            >
                                {isPending ? "..." : "Install"}
                            </button>
                        )}
                    </div>
                </div>
                <span className={styles.author}>by {modItem.author}</span>

                <div className={styles.meta}>
                    <span className={styles.downloads}>
                        <DownloadIcon />
                        {modItem.totalDownloads}
                    </span>
                    <span className={styles.version}>v{modItem.latestVersion}</span>
                </div>

                {modItem.tags.length > 0 && (
                    <div className={styles.tags}>
                        {modItem.tags.map((tag) => (
                            <span
                                key={tag.id}
                                className={styles.tag}
                                style={{
                                    background: `${tag.color}20`,
                                    color: tag.color === "#ffffff" ? "rgba(255,255,255,0.8)" : tag.color,
                                }}
                            >
                                {tag.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ModCard;
