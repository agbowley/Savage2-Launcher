import { repositoryBaseURL } from "@app/utils/consts";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { useQuery } from "@tanstack/react-query";
import type { ModDetail } from "@app/types/mods";

const MODS_BASE_URL = `${repositoryBaseURL}/api/mods`;

export const useModDetail = (modId: number | null) => {
    return useQuery({
        queryKey: ["ModDetail", modId],
        queryFn: async (): Promise<ModDetail> =>
            tauriFetchJson<ModDetail>(`${MODS_BASE_URL}/${modId}`),
        enabled: modId !== null,
        staleTime: 5 * 60 * 1000,
    });
};
