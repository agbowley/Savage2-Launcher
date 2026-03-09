import { ReleaseChannels, useS2Release } from "@app/hooks/useS2Release";
import { S2States, useS2Version } from "@app/hooks/useS2Version";
import BaseVersion from "./Base";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import { Link, useLocation } from "react-router-dom";
import { useCurrentTask } from "@app/tasks";
import { useTranslation } from "react-i18next";

interface Props {
    channel: ReleaseChannels;
}

const S2Version: React.FC<Props> = ({ channel }: Props) => {
    const { t } = useTranslation("launch");
    const { data: releaseData } = useS2Release(channel);
    const { state, installedVersion, latestVersion, task, play, download } = useS2Version(releaseData, channel);
    const currentTask = useCurrentTask();

    function getChannelIcon() {
        switch (channel) {
            case "stable":
                return StableS2Icon;
            case "nightly":
                return NightlyS2Icon;
            case "legacy":
                return LegacyS2Icon;
        }
    }

    function getChannelDisplayName() {
        switch (channel) {
            case "stable":
                return t("community_edition");
            case "nightly":
                return t("beta_test_client");
            case "legacy":
                return t("legacy_client");
        }
    }

    function getProgramName() {
        switch (channel) {
            case "stable":
                return "Savage 2: CE";
            case "nightly":
                return "Savage 2: CE - Beta";
            case "legacy":
                return "Savage 2 - A Tortured Soul";
        }
    }

    function getStatus(): "installed" | "not-installed" | "update-available" | "downloading" | "queued" | undefined {
        // Queued: task exists but isn't the active/first task
        const isQueued = task != null && currentTask != null && task !== currentTask;
        if (isQueued) return "queued";

        switch (state) {
            case S2States.AVAILABLE:
            case S2States.PLAYING:
                return "installed";
            case S2States.DOWNLOADING:
            case S2States.UPDATING:
            case S2States.LOADING:
            case S2States.REPAIRING:
            case S2States.UNINSTALLING:
                return "downloading";
            case S2States.UPDATE_AVAILABLE:
                return "update-available";
            case S2States.NEW_UPDATE:
                return "not-installed";
            default:
                return undefined;
        }
    }

    const location = useLocation();

    /** Determine if this S2 channel should appear active in the sidebar. */
    function isActiveRoute(): boolean {
        const path = location.pathname.toLowerCase();
        // Direct S2 route
        if (path === `/s2/${channel}`) return true;
        // Home page is the stable channel
        if (path === "/" && channel === "stable") return true;
        // Mod detail page for this channel
        if (path.startsWith("/mods/")) {
            const params = new URLSearchParams(location.search);
            return (params.get("channel") ?? "stable") === channel;
        }
        // Changelog page for this channel
        if (path === `/changelog/${channel}`) return true;
        return false;
    }

    /** Handle double-click: trigger the default action (launch/install/update). */
    function handleDoubleClick(e: React.MouseEvent) {
        e.preventDefault();
        switch (state) {
            case S2States.AVAILABLE:
            case S2States.PLAYING:
                play();
                break;
            case S2States.NEW_UPDATE:
            case S2States.UPDATE_AVAILABLE:
                download();
                break;
            // Already busy — do nothing
            default:
                break;
        }
    }

    return (
        <Link to={"/S2/" + channel} aria-current={isActiveRoute() ? "page" : undefined} onDoubleClick={handleDoubleClick}>
            <BaseVersion
                icon={<img src={getChannelIcon()} alt="Savage 2" />}
                programName={getProgramName()}
                versionChannel={getChannelDisplayName()}
                version={installedVersion ?? latestVersion ?? undefined}
                status={getStatus()}
            />
        </Link>
    );
};

export default S2Version;
