import { useState } from "react";
import styles from "./Versions.module.css";

type Props = {
    name: string;
    collapsible?: boolean;
    defaultExpanded?: boolean;
    children: React.ReactNode;
};

const SubSection: React.FC<Props> = ({ name, collapsible = false, defaultExpanded = true, children }: Props) => {
    const [expanded, setExpanded] = useState(defaultExpanded);

    return (
        <div className={styles.subsection}>
            <div
                className={`${styles.subsection_header} ${collapsible ? styles.clickable : ""}`}
                onClick={collapsible ? () => setExpanded(prev => !prev) : undefined}
            >
                <span className={styles.subsection_name}>{name}</span>
                {collapsible && (
                    <svg
                        className={`${styles.chevron} ${expanded ? styles.chevron_expanded : ""}`}
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        fill="none"
                    >
                        <path d="M4 5L6 7L8 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </div>
            {(!collapsible || expanded) && (
                <div className={styles.subsection_content}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default SubSection;
