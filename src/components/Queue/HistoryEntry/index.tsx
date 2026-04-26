import styles from "./HistoryEntry.module.css";
import { HistoryEntry as HistoryEntryData } from "@app/stores/DownloadHistoryStore";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import { InformationIcon } from "@app/assets/Icons";
import TooltipWrapper from "@app/components/TooltipWrapper";
import { useTranslation } from "react-i18next";
import i18n from "@app/i18n";

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
    "latest": StableS2Icon,
    "beta": NightlyS2Icon,
};

const channelNames: Record<string, string> = {
    "stable": "community_edition",
    "nightly": "beta_test_client",
    "legacy": "legacy_client",
    "latest": "community_edition",
    "beta": "beta_test_client",
    // Backward compat: old history entries stored English display names
    "Community Edition": "community_edition",
    "Beta Test Client": "beta_test_client",
    "Legacy Client": "legacy_client",
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
        case "replay":
            return styles.badge_replay;
    }
}

function getBadgeLabel(entry: HistoryEntryData, t: (key: string) => string): string {
    switch (entry.type) {
        case "install":
            return t("installed_badge");
        case "update":
            return t("updated_badge");
        case "repair":
            return (entry.repairedFiles?.length ?? 0) > 0 ? t("repaired_badge") : t("verified_badge");
        case "uninstall":
            return t("uninstalled_badge");
        case "replay":
            return t("replays_badge");
    }
}

function getDetail(entry: HistoryEntryData, t: (key: string, opts?: Record<string, unknown>) => string): string {
    switch (entry.type) {
        case "install":
            return entry.version ? `v${entry.version}` : t("new_install");
        case "update":
            if (entry.previousVersion && entry.version) {
                return `v${entry.previousVersion} \u2192 v${entry.version}`;
            }
            return entry.version ? t("updated_to_version", { version: entry.version }) : t("updated_badge");
        case "repair": {
            const count = entry.repairedFiles?.length ?? 0;
            const prefix = entry.version ? `v${entry.version} \u2014 ` : "";
            return count > 0
                ? `${prefix}${t("files_repaired", { count })}`
                : `${prefix}${t("all_files_verified")}`;
        }
        case "uninstall":
            return entry.version ? t("version_removed", { version: entry.version }) : t("uninstalled_badge");
        case "replay":
            return entry.mapName ?? t("replays_badge");
    }
}

function formatTimestamp(iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("just_now");
    if (diffMins < 60) return t("minutes_ago", { count: diffMins });
    if (diffHours < 24) return t("hours_ago", { count: diffHours });
    if (diffDays < 7) return t("days_ago", { count: diffDays });

    return date.toLocaleDateString(i18n.language, {
        month: "short",
        day: "numeric",
        year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
    });
}

const HistoryEntry: React.FC<Props> = ({ entry }: Props) => {
    const { t } = useTranslation();
    const { t: tLaunch } = useTranslation("launch");
    const icon = channelIcons[entry.channel] || StableS2Icon;
    const hasRepairedFiles = entry.type === "repair" && entry.repairedFiles && entry.repairedFiles.length > 0;
    const channelKey = channelNames[entry.channel];
    const channelLabel = channelKey ? tLaunch(channelKey) : entry.channel;

    const title = entry.type === "replay" && entry.matchId != null
        ? `${channelLabel} — ${tLaunch("match_id_label", { id: entry.matchId })}`
        : entry.modName
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
                        {getDetail(entry, t)}
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
                        <span className={styles.badge_mod}>{t("mod_badge")}</span>
                    )}
                    <span className={getBadgeClass(entry)}>
                        {getBadgeLabel(entry, t)}
                    </span>
                </div>
                <span className={styles.timestamp}>
                    {formatTimestamp(entry.timestamp, t)}
                </span>
            </div>
        </div>
    );
};

export default HistoryEntry;
