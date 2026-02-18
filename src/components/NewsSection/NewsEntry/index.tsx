import styles from "./NewsEntry.module.css";
import NewsBadge from "../NewsBadge";
import { ArticleData } from "@app/hooks/useNews";
import { Link } from "react-router-dom";
import { Img } from "react-image";
import UnknownUserIcon from "@app/assets/Icons/UnknownUser.svg";
import { TimeIcon } from "@app/assets/Icons";
import { intlFormatDistance } from "date-fns";
import { useNewsAuthorSettings } from "@app/hooks/useNewsAuthor";
import { useQueries } from "@tanstack/react-query";

interface Props {
    article: ArticleData;
}

const NewsEntry: React.FC<Props> = ({ article }: Props) => {

    const authors = useQueries({
        queries: [useNewsAuthorSettings(article.author)]
    });

    return <Link to={`/news/${article.id}`} key={article.id} style={{ width: "100%" }}>
        <div className={styles.container}>
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
                    {article.title}
                </div>
                <div className={styles.bottom_container}>
                    {
                        authors
                            .filter(({data}) => data)
                            .map(({data}) => (<Img
                                key={`${data?.displayName}`}
                                height={24}
                                alt={`${data?.displayName}'s avatar`}
                                src={[UnknownUserIcon]}
                                style={{ borderRadius: "50%" }}
                            />))
                    }
                    <div>
                        By: <span className={styles.author}>{
                            authors
                                .map(({data}) => data?.displayName)
                                .filter(authorName => authorName)
                                .join(", ")
                        }</span>
                    </div>
                </div>
            </div>
        </div>
    </Link>;
};

export default NewsEntry;