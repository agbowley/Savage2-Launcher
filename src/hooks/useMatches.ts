import { matchesBaseURL, playersBaseURL } from "@app/utils/consts";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { useQuery } from "@tanstack/react-query";
import type { GetAllMatchesResponse, GetMatchesParams, MatchResponse, MatchSortBy, MatchStatsResponse } from "@app/types/matches";

const ALL_MATCHES_PAGE_SIZE = 100;

interface UseMatchesOptions {
    page: number;
    pageSize?: number;
    sortBy?: MatchSortBy;
    isAscending?: boolean;
    playerUsername?: string | null;
    myGamesOnly?: boolean;
    matchId?: number | null;
    selectedMaps?: string[];
    selectedPlayers?: string[];
}

interface UseMatchMapsOptions {
    playerUsername?: string | null;
    myGamesOnly?: boolean;
    matchId?: number | null;
    selectedPlayers?: string[];
}

function normalizeFilters(values: string[]): string[] {
    const distinctValues = new Map<string, string>();

    for (const value of values) {
        const trimmedValue = value.trim();
        if (!trimmedValue) {
            continue;
        }

        const key = trimmedValue.toLowerCase();
        if (!distinctValues.has(key)) {
            distinctValues.set(key, trimmedValue);
        }
    }

    return [...distinctValues.values()].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
}

function appendListParams(params: URLSearchParams, key: string, values?: string[]) {
    for (const value of values ?? []) {
        params.append(key, value);
    }
}

function isNotFoundError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith("HTTP 404:");
}

function matchPassesMapFilter(match: MatchResponse, maps: string[]): boolean {
    if (maps.length === 0) {
        return true;
    }

    const normalizedMap = match.map.trim().toLowerCase();
    return maps.some((mapName) => mapName.trim().toLowerCase() === normalizedMap);
}

function matchContainsAllPlayers(stats: MatchStatsResponse, players: string[]): boolean {
    const participants = new Set(
        [...stats.commanders, ...stats.actionPlayers]
            .map((player) => player.username.trim().toLowerCase()),
    );

    return players.every((playerName) => participants.has(playerName.trim().toLowerCase()));
}

async function fetchMatchById(matchId: number): Promise<MatchResponse | null> {
    try {
        return await tauriFetchJson<MatchResponse>(`${matchesBaseURL}/${matchId}`);
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }

        throw error;
    }
}

async function fetchMatchStats(matchId: number): Promise<MatchStatsResponse | null> {
    try {
        return await tauriFetchJson<MatchStatsResponse>(`${matchesBaseURL}/stats/${matchId}`);
    } catch (error) {
        if (isNotFoundError(error)) {
            return null;
        }

        throw error;
    }
}

async function fetchExactMatch({ filter, matchId, maps, players }: Pick<GetMatchesParams, "filter" | "matchId" | "maps" | "players">): Promise<GetAllMatchesResponse> {
    if (matchId == null) {
        return { matches: [], totalCount: 0 };
    }

    const match = await fetchMatchById(matchId);
    if (!match || !matchPassesMapFilter(match, maps ?? [])) {
        return { matches: [], totalCount: 0 };
    }

    const requiredPlayers = normalizeFilters([
        ...(players ?? []),
        ...(filter ? [filter] : []),
    ]);

    if (requiredPlayers.length > 0) {
        const stats = await fetchMatchStats(matchId);
        if (!stats || !matchContainsAllPlayers(stats, requiredPlayers)) {
            return { matches: [], totalCount: 0 };
        }
    }

    return {
        matches: [match],
        totalCount: 1,
    };
}

async function fetchMatchesPage({ page, pageSize, sortBy, isAscending, filter, matchId, maps, players }: GetMatchesParams): Promise<GetAllMatchesResponse> {
    const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortBy,
        isAscending: String(isAscending),
    });

    if (filter?.trim()) {
        params.set("filter", filter.trim());
    }

    if (matchId != null) {
        params.set("matchId", String(matchId));
    }

    appendListParams(params, "maps", maps);
    appendListParams(params, "players", players);

    return tauriFetchJson<GetAllMatchesResponse>(`${matchesBaseURL}?${params.toString()}`);
}

async function fetchAllMatches(options: Omit<GetMatchesParams, "page">): Promise<MatchResponse[]> {
    const firstPage = await fetchMatchesPage({ ...options, page: 1 });
    if (firstPage.totalCount <= firstPage.matches.length) {
        return firstPage.matches;
    }

    const totalPages = Math.ceil(firstPage.totalCount / options.pageSize);
    const remainingPages: GetAllMatchesResponse[] = [];

    for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
        remainingPages.push(await fetchMatchesPage({ ...options, page: currentPage }));
    }
    return [
        ...firstPage.matches,
        ...remainingPages.flatMap((response) => response.matches),
    ];
}

export const useMatches = ({
    page,
    pageSize = 25,
    sortBy = "createdAt",
    isAscending = false,
    playerUsername,
    myGamesOnly = false,
    matchId,
    selectedMaps = [],
    selectedPlayers = [],
}: UseMatchesOptions) => {
    const normalizedMaps = normalizeFilters(selectedMaps);
    const normalizedPlayers = normalizeFilters(selectedPlayers);
    const filter = myGamesOnly && playerUsername ? playerUsername : undefined;

    return useQuery({
        queryKey: ["MatchesList", page, pageSize, sortBy, isAscending, filter ?? null, matchId ?? null, normalizedMaps, normalizedPlayers],
        placeholderData: (previousData) => previousData,
        queryFn: async (): Promise<GetAllMatchesResponse> => {
            if (matchId != null) {
                return fetchExactMatch({
                    filter,
                    matchId,
                    maps: normalizedMaps,
                    players: normalizedPlayers,
                });
            }

            return fetchMatchesPage({
                page,
                pageSize,
                sortBy,
                isAscending,
                filter,
                matchId: undefined,
                maps: normalizedMaps,
                players: normalizedPlayers,
            });
        },
        staleTime: 30_000,
    });
};

export const useMatchMaps = ({ playerUsername, myGamesOnly = false, matchId, selectedPlayers = [] }: UseMatchMapsOptions) => {
    const normalizedPlayers = normalizeFilters(selectedPlayers);
    const filter = myGamesOnly && playerUsername ? playerUsername : undefined;

    return useQuery({
        queryKey: ["MatchesMaps", filter ?? null, matchId ?? null, normalizedPlayers],
        placeholderData: (previousData) => previousData,
        queryFn: async (): Promise<string[]> => {
            if (matchId != null) {
                const exactMatchResult = await fetchExactMatch({
                    filter,
                    matchId,
                    players: normalizedPlayers,
                });

                return normalizeFilters(exactMatchResult.matches.map((match) => match.map));
            }

            const allMatches = await fetchAllMatches({
                pageSize: ALL_MATCHES_PAGE_SIZE,
                sortBy: "id",
                isAscending: false,
                filter,
                matchId: undefined,
                players: normalizedPlayers,
            });

            return normalizeFilters(allMatches.map((match) => match.map));
        },
        staleTime: 300_000,
    });
};

export const useMatchPlayerSearch = (query: string) => {
    const normalizedQuery = query.trim();

    return useQuery({
        queryKey: ["MatchPlayerSearch", normalizedQuery],
        enabled: normalizedQuery.length >= 2,
        queryFn: async (): Promise<string[]> => {
            const params = new URLSearchParams({ query: normalizedQuery });
            const usernames = await tauriFetchJson<string[]>(`${playersBaseURL}/search?${params.toString()}`);
            return normalizeFilters(usernames).slice(0, 20);
        },
        staleTime: 30_000,
    });
};