import { useQuery } from "@tanstack/react-query";

export interface AuthorData {
    displayName: string,
    avatar?: string,
    role?: string,
}

export const useNewsAuthorSettings = (authorName: string) => {
    return {
        queryKey: ["NewsAuthor", authorName],
        queryFn: async (): Promise<AuthorData> => {
            return {
                displayName: authorName,
            };
        }
    };
};

export const useNewsAuthor = (authorName: string) => {
    return useQuery(useNewsAuthorSettings(authorName));
};