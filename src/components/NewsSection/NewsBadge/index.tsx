import styles from "./NewsBadge.module.css";
import { useTranslation } from "react-i18next";

interface BadgeDataObject {
    [k: string]: {
        css: string,
        key: string
    }
}

const BADGE_DATA: BadgeDataObject = {
    "update": {
        css: styles.blue,
        key: "update_badge"
    },
    "announcement": {
        css: styles.green,
        key: "announcement_badge"
    },
    "release": {
        css: styles.pink,
        key: "release_badge"
    }
};

interface Props {
    badgeType: string;
}

const NewsBadge: React.FC<Props> = ({ badgeType }: Props) => {
    const { t } = useTranslation();
    let cssClass = "green";
    let text = badgeType;
    if (badgeType in BADGE_DATA) {
        const badgeData = BADGE_DATA[badgeType];
        cssClass = badgeData.css;
        text = t(badgeData.key);
    }

    return <div className={[styles.badge, cssClass].join(" ")}>{text}</div>;
};

export default NewsBadge;