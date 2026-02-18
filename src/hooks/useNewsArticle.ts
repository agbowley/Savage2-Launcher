import { newsBaseURL } from "@app/utils/consts";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { useQuery } from "@tanstack/react-query";
import { ArticleData, NewsApiResponse } from "./useNews";

export const useNewsArticle = (id: number) => {
    return useQuery({
        queryKey: ["NewsArticle", id],
        gcTime: 60 * 60 * 1000,
        queryFn: async (): Promise<ArticleData> => {
            const data = await tauriFetchJson<NewsApiResponse>(`${newsBaseURL}`);
            const article = data.items.find((item: ArticleData) => item.id === id);
            if (!article) throw new Error(`Article ${id} not found`);
            return article;
        }
    });
};