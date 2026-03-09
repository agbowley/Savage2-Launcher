import { DiscordIcon } from "@app/assets/Icons";
import styles from "./Home.module.css";
import NewsSection from "@app/components/NewsSection";
import { useTranslation } from "react-i18next";

function Home() {
    const { t } = useTranslation();

    return <>
        <div className={styles.banner}>
            {/* <img src="/src/assets/SourceIcons/Official.png" height={100} /> */}
            <h1><b>{t("news")}</b></h1>
            {/* <p>Here you can download and install YARG, and the official YARG setlist!</p>
            <p>If you encounter any bugs, please report it to us in our Discord.</p> */}
        </div>
        <div className={styles.content}>
            <div className={styles.content_inner}>
                <NewsSection />
                <div className={styles.sidebar}>
                    <a className={styles.discord_box} href="https://discord.gg/gtXahvDjZE" target="_blank" rel="noreferrer">
                        <DiscordIcon width={19.2} height={15} color="white" style={{ transform: "translateY(4px)" }} />
                        {t("join_discord")}
                    </a>
                </div>
            </div>
        </div>
    </>;
}

export default Home;