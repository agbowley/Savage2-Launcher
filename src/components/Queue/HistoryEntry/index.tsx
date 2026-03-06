import styles from "./HistoryEntry.module.css";
import { HistoryEntry as HistoryEntryData } from "@app/stores/DownloadHistoryStore";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import { InformationIcon } from "@app/assets/Icons";
import TooltipWrapper from "@app/components/TooltipWrapper";

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

const channelNames: Record<string, string> = {
    "stable": "Community Edition",
    "nightly": "Beta Test Client",
    "legacy": "Legacy Client",
};

function getBadgeClass(entry: HistoryEntryData): string {
    switch (entry.type) {
        case "install":
            return styles.badge_install;
        case "update":
            return styles.badge_update;
        case "repair":
            return (entry.repairedFiles?.length ?? 0) > 0 ? styles.badge_repair : styles.badge_verify;
        case "uninstall":
            return styles.badge_uninstall;
    }
}

function getBadgeLabel(entry: HistoryEntryData): string {
    switch (entry.type) {
        case "install":
            return "Installed";
        case "update":
            return "Updated";
        case "repair":
            return (entry.repairedFiles?.length ?? 0) > 0 ? "Repaired" : "Verified";
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
        case "repair": {
            const count = entry.repairedFiles?.length ?? 0;
            const prefix = entry.version ? `v${entry.version} — ` : "";
            return count > 0
                ? `${prefix}${count} file${count !== 1 ? "s" : ""} repaired`
                : `${prefix}All files verified and up-to-date`;
        }
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
    const hasRepairedFiles = entry.type === "repair" && entry.repairedFiles && entry.repairedFiles.length > 0;
    const channelLabel = channelNames[entry.channel] ?? entry.channel;

    const title = entry.modName
        ? `${channelLabel} — ${entry.modName}`
        : `${entry.game} — ${channelLabel}`;

    return (
        <div className={styles.item}>
            <div className={styles.main}>
                <div className={styles.icon}>
                    <img src={icon} />
                </div>
                <div className={styles.info}>
                    <span className={styles.info_header}>
                        {title}
                    </span>
                    <span className={styles.info_detail}>
                        {getDetail(entry)}
                        {hasRepairedFiles && (
                            <TooltipWrapper text={entry.repairedFiles!.join("\n")}>
                                <InformationIcon className={styles.info_icon} width={12} height={12} />
                            </TooltipWrapper>
                        )}
                    </span>
                </div>
            </div>
            <div className={styles.meta}>
                <div className={styles.badges}>
                    {entry.modName && (
                        <span className={styles.badge_mod}>Mod</span>
                    )}
                    <span className={getBadgeClass(entry)}>
                        {getBadgeLabel(entry)}
                    </span>
                </div>
                <span className={styles.timestamp}>
                    {formatTimestamp(entry.timestamp)}
                </span>
            </div>
        </div>
    );
};

export default HistoryEntry;
