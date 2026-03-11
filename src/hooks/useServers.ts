import { invoke } from "@tauri-apps/api/tauri";
import { useQuery } from "@tanstack/react-query";

export interface ServerEntry {
    id: string;
    name: string;
    ip: string;
    port: number;
    players: number;
    maxPlayers: number;
    official: boolean;
    minLevel: number;
    maxLevel: number;
    inGame: boolean;
    gameTime: string;
    map: string;
    nextMap: string;
    location: string;
    minPlayers: number;
    version: string;
    passworded: boolean;
    ping: number;
    online: boolean;
}

export const useServers = (latestVersion: string | null) => {
    return useQuery({
        queryKey: ["servers", latestVersion],
        queryFn: async (): Promise<ServerEntry[]> => {
            const all = await invoke<ServerEntry[]>("fetch_servers");
            if (!latestVersion) return all;
            return all.filter((s) => !s.version || s.version === latestVersion);
        },
        refetchInterval: 5_000,
        staleTime: 30_000,
        gcTime: Infinity,
    });
};
