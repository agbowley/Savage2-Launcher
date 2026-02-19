import styles from "./Sidebar.module.css";
import { DiscordIcon, QueueIcon, GitlabIcon } from "@app/assets/Icons";
import SidebarMenuButton from "./SidebarMenuButton";
import { NavLink } from "react-router-dom";
import VersionsList from "./Versions/List";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import QueueStore from "@app/tasks/queue";

const Sidebar: React.FC = () => {
    const [launcherVersion, setLauncherVersion] = useState("");
    const queue = QueueStore.useQueue();

    useEffect(() => {
        (async () => {
            setLauncherVersion(await getVersion());
        })();
    }, []);

    return <div className={styles.sidebar}>
        <VersionsList />

        <div className={styles.downloads}>
            <NavLink to="/queue">
                <SidebarMenuButton icon={<QueueIcon />}>
                    Downloads {queue.size <= 0 ? "" : `(${queue.size})`}
                </SidebarMenuButton>
            </NavLink>
        </div>

        <div className={styles.footer}>
            <div className={styles.credits}>v{launcherVersion}</div>
            <div className={styles.socials}>
                <a href="https://discord.gg/gtXahvDjZE" target="_blank" className={styles.link} rel="noreferrer"><DiscordIcon /></a>
                <a href="https://gitlab.com/TalesofNewerth" target="_blank" className={styles.link} rel="noreferrer"><GitlabIcon /></a>
            </div>
        </div>
    </div>;
};

export default Sidebar;
