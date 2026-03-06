import { repositoryBaseURL } from "@app/utils/consts";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { useQuery } from "@tanstack/react-query";
import type { ModListResponse, ModSortBy } from "@app/types/mods";

const MODS_BASE_URL = `${repositoryBaseURL}/api/mods`;

export interface UseModsOptions {
    page?: number;
    pageSize?: number;
    sortBy?: ModSortBy;
    sortDesc?: boolean;
    tagIds?: number[];
    search?: string;
}

export const useMods = (options: UseModsOptions = {}) => {
    const {
        page = 1,
        pageSize = 12,
        sortBy = "downloads",
        sortDesc = true,
        tagIds,
        search,
    } = options;

    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        sortDesc: String(sortDesc),
    });

    if (tagIds && tagIds.length > 0) {
        for (const id of tagIds) {
            params.append("tagIds", String(id));
        }
    }
    if (search) params.set("search", search);

    // Sort tagIds for stable query key
    const sortedTagIds = tagIds ? [...tagIds].sort() : [];

    return useQuery({
        queryKey: ["ModsList", page, pageSize, sortBy, sortDesc, sortedTagIds, search],
        queryFn: async (): Promise<ModListResponse> =>
            tauriFetchJson<ModListResponse>(`${MODS_BASE_URL}?${params.toString()}`),
        staleTime: 5 * 60 * 1000,
    });
};
