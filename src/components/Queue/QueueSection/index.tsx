import styles from "./QueueSection.module.css";

type Props = React.PropsWithChildren<{
    icon?: React.ReactNode;
    title: string;
    rightContent?: React.ReactNode;
}>;

const QueueSection: React.FC<Props> = ({ icon, children, title, rightContent }: Props) => {
    return <div className={styles.container}>
        <div className={styles.title}>
            <span className={styles.title_left}>
                <span className={styles.icon}>{icon}</span> {title}
            </span>
            {rightContent && <span className={styles.title_right}>{rightContent}</span>}
        </div>
        <div className={styles.list}>
            {children}
        </div>
    </div>;
};

export default QueueSection;