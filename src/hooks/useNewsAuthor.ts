import { newsBaseURL } from "@app/utils/consts";
import { useQuery } from "@tanstack/react-query";
import adminData from "../assets/Authors/Admin.json";
const authors: Record<string, AuthorData> = {
    "Admin": adminData as AuthorData
};

export interface AuthorData {
    displayName: string,
    avatar?: string,
    role?: string,
}

export const useNewsAuthorSettings = (authorId: string) => { 
    // const authorData: AuthorData = adminData as AuthorData;

    return {
        queryKey: ["NewsAuthor", authorId],
        queryFn: async (): Promise<AuthorData> => {
            return authors[authorId];
        }
    };
    // return {
    //     queryKey: ["NewsAuthor", authorId],
    //     queryFn: async (): Promise<AuthorData> => await fetch(
    //         `${newsBaseURL}/authors/${authorId}.json`)
    //         .then(res => res.json())
    // };
};

export const useNewsAuthor = (authorId: string) => {
    return useQuery(useNewsAuthorSettings(authorId));
};