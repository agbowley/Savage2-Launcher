import styles from "./NewsEntry.module.css";
import NewsBadge from "../NewsBadge";
import { ArticleData } from "@app/hooks/useNews";
import { Link } from "react-router-dom";
import LauncherIcon from "@app/assets/SourceIcons/Official.png";
import { TimeIcon } from "@app/assets/Icons";
import { intlFormatDistance } from "date-fns";
import { useNewsAuthorSettings } from "@app/hooks/useNewsAuthor";
import { useQueries } from "@tanstack/react-query";
import { getNewsBanner } from "@app/assets/NewsBanners";

interface Props {
    article: ArticleData;
}

const NewsEntry: React.FC<Props> = ({ article }: Props) => {

    const authors = useQueries({
        queries: [useNewsAuthorSettings(article.author)]
    });

    const banner = getNewsBanner(article.id);

    return <Link to={`/news/${article.id}`} key={article.id} style={{ width: "100%" }}>
        <div className={styles.container}>
            <img src={banner.url} className={styles.banner_image} alt="" />
            <div className={styles.main}>
                <div className={styles.top_container}>
                    <div className={styles.top}>
                        <NewsBadge badgeType="update" />
                        {
                            article.createdAt ? (
                                <div className={styles.releaseDate}>
                                    <TimeIcon height={15} />
                                    {intlFormatDistance(new Date(article.createdAt), new Date())}
                                </div>
                            ) : ""
                        }
                    </div>
                </div>
                <div className={styles.bottom_container}>
                    <span className={styles.title}>{article.title}</span>
                    <div className={styles.byline}>
                        <img
                            height={20}
                            alt="Savage 2"
                            src={LauncherIcon}
                            style={{ borderRadius: "50%" }}
                        />
                        <div>
                            by: <span className={styles.author}>{
                                authors
                                    .map(({data}) => data?.displayName)
                                    .filter(authorName => authorName)
                                    .join(", ")
                            }</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Link>;
};

export default NewsEntry;