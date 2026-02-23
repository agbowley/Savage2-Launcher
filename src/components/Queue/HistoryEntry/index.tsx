import styles from "./HistoryEntry.module.css";
import { HistoryEntry as HistoryEntryData, HistoryEntryType } from "@app/stores/DownloadHistoryStore";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";

interface Props {
    entry: HistoryEntryData;
}

const channelIcons: Record<string, string> = {
    "Community Edition": StableS2Icon,
    "Beta Test Client": NightlyS2Icon,
    "Legacy Client": LegacyS2Icon,
    "stable": StableS2Icon,
    "nightly": NightlyS2Icon,
    "legacy": LegacyS2Icon,
};

function getBadgeClass(type: HistoryEntryType): string {
    switch (type) {
        case "install":
            return styles.badge_install;
        case "update":
            return styles.badge_update;
        case "repair":
            return styles.badge_repair;
        case "uninstall":
            return styles.badge_uninstall;
    }
}

function getBadgeLabel(type: HistoryEntryType): string {
    switch (type) {
        case "install":
            return "Installed";
        case "update":
            return "Updated";
        case "repair":
            return "Repaired";
        case "uninstall":
            return "Uninstalled";
    }
}

function getDetail(entry: HistoryEntryData): string {
    switch (entry.type) {
        case "install":
            return entry.version ? `v${entry.version}` : "New install";
        case "update":
            if (entry.previousVersion && entry.version) {
                return `v${entry.previousVersion} → v${entry.version}`;
            }
            return entry.version ? `Updated to v${entry.version}` : "Updated";
        case "repair":
            return entry.version ? `v${entry.version} — files repaired` : "Files repaired";
        case "uninstall":
            return entry.version ? `v${entry.version} removed` : "Uninstalled";
    }
}

function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
}

const HistoryEntry: React.FC<Props> = ({ entry }: Props) => {
    const icon = channelIcons[entry.channel] || StableS2Icon;

    return (
        <div className={styles.item}>
            <div className={styles.main}>
                <div className={styles.icon}>
                    <img src={icon} />
                </div>
                <div className={styles.info}>
                    <span className={styles.info_header}>
                        {entry.game} — {entry.channel}
                    </span>
                    <span className={styles.info_detail}>
                        {getDetail(entry)}
                    </span>
                </div>
            </div>
            <div className={styles.meta}>
                <span className={getBadgeClass(entry.type)}>
                    {getBadgeLabel(entry.type)}
                </span>
                <span className={styles.timestamp}>
                    {formatTimestamp(entry.timestamp)}
                </span>
            </div>
        </div>
    );
};

export default HistoryEntry;
