import { newsBaseURL } from "@app/utils/consts";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { useQuery } from "@tanstack/react-query";

export interface ArticleData {
    id: number,
    title: string,
    content: string,
    createdAt: string,
    updatedAt: string,
    accountId: number,
    author: string,
}

export interface NewsApiResponse {
    items: ArticleData[],
    totalCount: number,
    page: number,
    pageSize: number,
}

export const useNews = () => {
    return useQuery({
        queryKey: ["NewsIndex"],
        queryFn: async (): Promise<NewsApiResponse> =>
            tauriFetchJson<NewsApiResponse>(`${newsBaseURL}`)
    });
};