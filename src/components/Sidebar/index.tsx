import styles from "./Sidebar.module.css";
import { DiscordIcon, QueueIcon, GitlabIcon, UpdateIcon, WarningIcon } from "@app/assets/Icons";
import SidebarMenuButton from "./SidebarMenuButton";
import { NavLink } from "react-router-dom";
import VersionsList from "./Versions/List";
import UserProfile from "./UserProfile";
import { useAuthStore } from "@app/stores/AuthStore";
import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useLauncherUpdater } from "@app/hooks/useLauncherUpdater";
import TooltipWrapper from "@app/components/TooltipWrapper";
import QueueStore from "@app/tasks/queue";
import Spinner from "@app/components/Spinner";

const DEV_CLICK_THRESHOLD = 12;

const Sidebar: React.FC = () => {
    const [launcherVersion, setLauncherVersion] = useState("");
    const queue = QueueStore.useQueue();
    const { updateVersion, isUpdating, startUpdate } = useLauncherUpdater();
    const clickCount = useRef(0);
    const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [mockUpdateVersion, setMockUpdateVersion] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            setLauncherVersion(await getVersion());
        })();
    }, []);

    // Effective update version: real update takes precedence, then dev mock
    const effectiveUpdateVersion = updateVersion ?? mockUpdateVersion;
    const hasUpdate = effectiveUpdateVersion !== null;

    const handleVersionClick = async () => {
        // If there's a real or mock update available, clicking starts the update
        if (hasUpdate && !isUpdating) {
            const isMock = !updateVersion && !!mockUpdateVersion;
            await startUpdate(isMock);
            return;
        }

        // Dev-mode easter egg: 12 clicks triggers mock update indicator
        if (!import.meta.env.DEV) return;

        clickCount.current += 1;
        if (clickTimer.current) clearTimeout(clickTimer.current);
        clickTimer.current = setTimeout(() => { clickCount.current = 0; }, 3000);

        if (clickCount.current < DEV_CLICK_THRESHOLD) return;
        clickCount.current = 0;
        setMockUpdateVersion(`${launcherVersion}-mock`);
    };

    const versionContent = (
        <div
            className={`${styles.credits} ${hasUpdate ? styles.credits_update : ""}`}
            onClick={handleVersionClick}
        >
            {isUpdating
                ? <><Spinner size={10} /> Updating...</>
                : <>v{launcherVersion}{hasUpdate && <WarningIcon />}</>
            }
        </div>
    );

    return <div className={styles.sidebar}>
        <VersionsList />

        <div className={styles.bottomSection}>
            <div className={styles.downloads}>
                <NavLink to="/queue">
                    <SidebarMenuButton icon={<QueueIcon />}>
                        Downloads {queue.size <= 0 ? "" : `(${queue.size})`}
                    </SidebarMenuButton>
                </NavLink>
            </div>

            {useAuthStore(s => s.user) ? (
                <NavLink to="/account" style={{ textDecoration: "none" }}>
                    <UserProfile />
                </NavLink>
            ) : (
                <UserProfile />
            )}

            <div className={styles.footer}>
                {hasUpdate ? (
                    <TooltipWrapper text={`Update available: ${effectiveUpdateVersion}\nClick to update`}>
                        {versionContent}
                    </TooltipWrapper>
                ) : versionContent}

                <div className={styles.socials}>
                    {hasUpdate && !isUpdating && (
                        <TooltipWrapper text={`Download update ${effectiveUpdateVersion}`} className={styles.updateLink} onClick={handleVersionClick}>
                            <UpdateIcon />
                        </TooltipWrapper>
                    )}
                    <a href="https://discord.gg/gtXahvDjZE" target="_blank" className={styles.link} rel="noreferrer"><DiscordIcon /></a>
                    <a href="https://gitlab.com/TalesofNewerth" target="_blank" className={styles.link} rel="noreferrer"><GitlabIcon /></a>
                </div>
            </div>
        </div>
    </div>;
};

export default Sidebar;
