import { millisToDisplayLength } from "@app/utils/timeFormat";
import { TimeIcon } from "@app/assets/Icons";
import styles from "./SongEntry.module.css";
import { useTranslation } from "react-i18next";

interface Props {
    title: string,
    artist: string,
    length: number,
    newSong: boolean,
}

const SongEntry: React.FC<Props> = ({ title, artist, length, newSong }: Props) => {
    const { t } = useTranslation();
    return <div className={styles.song}>
        <div className={styles.track_container}>
            <span className={styles.track_title}>{title}</span>
            <span className={styles.track_artist}>{artist}</span>
            {newSong &&
                <div className={styles.new_badge}>{t("new_badge")}</div>
            }
        </div>
        <div className={styles.extra_container}>
            <TimeIcon className={styles.icon} />
            <span className={styles.extra_length}>{millisToDisplayLength(length)}</span>
        </div>
    </div>;
};

export default SongEntry;