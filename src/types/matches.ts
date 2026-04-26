export type MatchSortBy = "createdAt" | "id";
export type MatchOutcome = "win" | "loss";

export interface MatchResponse {
    id: number;
    winner: number | null;
    duration: string;
    map: string;
    createdAt: string;
}

export interface GetAllMatchesResponse {
    matches: MatchResponse[];
    totalCount: number;
}

export interface GetMatchesParams {
    page: number;
    pageSize: number;
    sortBy: MatchSortBy;
    isAscending: boolean;
    filter?: string;
    matchId?: number;
    maps?: string[];
    players?: string[];
}

interface MatchParticipant {
    username: string;
    accountId: number;
    matchId: number;
    teamId: number;
}

interface MatchTeam {
    id: number;
    race: string;
}

export interface MatchStatsResponse {
    commanders: MatchParticipant[];
    teams: MatchTeam[];
    actionPlayers: MatchParticipant[];
}

export interface MatchUserSummary {
    played: boolean;
    outcome: MatchOutcome | null;
}

export interface LocalReplayStatus {
    matchId: number;
    exists: boolean;
    filename: string | null;
    path: string | null;
    size: number | null;
}