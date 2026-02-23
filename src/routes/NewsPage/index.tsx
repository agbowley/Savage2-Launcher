import { useNewsArticle } from "@app/hooks/useNewsArticle";
import { useNavigate, useParams } from "react-router-dom";
import { marked } from "marked";
import SanitizedHTML from "@app/components/SanitizedHTML";
import styles from "./NewsPage.module.css";
import NewsBadge from "@app/components/NewsSection/NewsBadge";
import { CSSProperties } from "react";
import { BackIcon, TimeIcon } from "@app/assets/Icons";
import { intlFormatDistance } from "date-fns";
import { useQueries } from "@tanstack/react-query";
import { useNewsAuthorSettings } from "@app/hooks/useNewsAuthor";
import NewsAuthor from "@app/components/NewsSection/NewsAuthor";
import { getNewsBanner } from "@app/assets/NewsBanners";

function NewsPage() {
    const { id } = useParams();
    if (!id) return <></>;

    const articleId = parseInt(id);
    const { data: article, error } = useNewsArticle(articleId);
    const navigate = useNavigate();

    const authorQueries = article ? [useNewsAuthorSettings(article.author)] : [];
    const authors = useQueries({
        queries: authorQueries.length > 0 ? authorQueries : [useNewsAuthorSettings("")]
    });

    if (error) return `An error has occurred: ${error}`;
    if (!article) return "Loading...";

    const content = article.content;
    const banner = getNewsBanner(article.id);

    return <>
        <div className={styles.page} style={{ "--bannerURL": `url(${banner.url})`, "--bannerColor": banner.color } as CSSProperties}>
            <div className={styles.header}>
            <div onClick={() => navigate(-1)} className={styles.header_back}>
                <BackIcon />
                    RETURN
            </div>
            <div className={styles.header_info}>
                <NewsBadge badgeType="update" />
                <div className={styles.title}>{article.title}</div>
            </div>
        </div >
        <div className={styles.content}>
            <div className={styles.info}>
                <div className={styles.authors}>
                    {
                        authors
                            .filter(query => query.data)
                            .map(({data}) => {
                                if(!data) return; 
                                return <NewsAuthor key={data?.displayName} author={data} />;
                            })
                    }
                </div>
                {
                    article.createdAt ? (
                        <div className={styles.releaseDate}>
                            <TimeIcon />
                            {intlFormatDistance(new Date(article.createdAt), new Date())}
                        </div>
                    ) : ""
                }
            </div>

            <SanitizedHTML 
                dirtyHTML={ marked.parse(content, {async: false}) as string } 
            />
            </div>
        </div>
    </>;
}

export default NewsPage;