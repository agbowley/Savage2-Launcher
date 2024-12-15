import { newsBaseURL } from "@app/utils/consts";
import { useQuery } from "@tanstack/react-query";

export interface Article {
    type: string,
    title: string,
    banner?: string,
    authors: string[],
    release?: string,
    video?: string
}

export const useNewsArticle = (md: string) => {
    return useQuery({
        queryKey: ["NewsArticle", md],
        gcTime: 60 * 60 * 1000,
        queryFn: async () => await fetch(
            `${newsBaseURL}/content/${md}`)
            .then(res => res.text())
    });
};