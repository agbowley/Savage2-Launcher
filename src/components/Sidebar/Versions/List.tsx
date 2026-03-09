import S2Version from "./S2";
import styles from "./Versions.module.css";
import VersionSeparator from "./Separator";
import SubSection from "./SubSection";
import { useTranslation } from "react-i18next";

const VersionsList: React.FC = () => {
    const { t } = useTranslation("sidebar");
    return (
        <div className={styles.list}>
            <VersionSeparator name={t("game_clients")} />
            <S2Version channel="stable" />
            <VersionSeparator name={t("other_clients")} />
            <SubSection name={t("testing")}>
                <S2Version channel="nightly" />
            </SubSection>
            <SubSection name={t("legacy")} collapsible defaultExpanded={false}>
                <S2Version channel="legacy" />
            </SubSection>
        </div>
    );
};

export default VersionsList;
