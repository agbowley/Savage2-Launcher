import S2Version from "./S2";
import styles from "./Versions.module.css";
import VersionSeparator from "./Separator";
import SubSection from "./SubSection";

const VersionsList: React.FC = () => {
    return (
        <div className={styles.list}>
            <VersionSeparator name="Game Clients" />
            <S2Version channel="stable" />
            <VersionSeparator name="Other Clients" />
            <SubSection name="Testing">
                <S2Version channel="nightly" />
            </SubSection>
            <SubSection name="Legacy" collapsible defaultExpanded={false}>
                <S2Version channel="legacy" />
            </SubSection>
        </div>
    );
};

export default VersionsList;
