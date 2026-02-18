// import { NewsIcon } from "@app/assets/Icons";
import styles from "./NewsSection.module.css";
import NewsEntry from "./NewsEntry";
import { useNews } from "@app/hooks/useNews";
import { useState } from "react";

interface Props {
    startingEntries?: number
}

const NewsSection: React.FC<Props> = ({ startingEntries }: Props) => {
    const { data, error, isLoading, isSuccess } = useNews();
    const [displayCount, setDisplayCount] = useState(startingEntries ? startingEntries : 4);

    if (isLoading) return "Loading...";

    if (error) return `An error has occurred: ${error}`;

    if (isSuccess) {
        return <div className={styles.container}>
            {
                data.items.slice(0, displayCount).map(article => <NewsEntry article={article} key={article.id} />)
            }
            {data.items.length > displayCount && (
                <div className={styles.load_more} onClick={() => setDisplayCount(displayCount + 4)}>
                    Load More...
                </div>
            )}
            {/* <div className={styles.load_more} onClick={() => setDisplayCount(displayCount + 4)}>Load more...</div> */}
        </div>;
    }
};

export default NewsSection;