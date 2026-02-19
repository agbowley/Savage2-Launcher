import styles from "./Versions.module.css";

type Props = {
    name: string,
}

const VersionSeparator: React.FC<Props> = ({name}: Props) => {
    return <div className={styles.separator}>
        <span className={styles.name}>{name}</span>
    </div>;
};

export default VersionSeparator;