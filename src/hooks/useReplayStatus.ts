import { invoke } from "@tauri-apps/api/tauri";
import { useQuery } from "@tanstack/react-query";
import type { LocalReplayStatus } from "@app/types/matches";

export const useReplayStatus = (matchIds: number[]) => {
    const sortedIds = [...matchIds].sort((a, b) => a - b);

    return useQuery({
        queryKey: ["replay-status", sortedIds],
        queryFn: async (): Promise<LocalReplayStatus[]> =>
            invoke("get_local_replay_status", { matchIds: sortedIds }),
        enabled: sortedIds.length > 0,
        staleTime: 10_000,
    });
};