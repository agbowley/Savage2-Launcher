import { matchesBaseURL } from "@app/utils/consts";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import { useQuery } from "@tanstack/react-query";
import type { MatchResponse, MatchStatsResponse, MatchUserSummary } from "@app/types/matches";

function getMatchUserSummary(match: MatchResponse, stats: MatchStatsResponse, normalizedUsername: string): MatchUserSummary {
    const participant = [...stats.commanders, ...stats.actionPlayers].find(
        (player) => player.username.trim().toLowerCase() === normalizedUsername,
    );

    if (!participant) {
        return { played: false, outcome: null };
    }

    const team = stats.teams.find((entry) => entry.id === participant.teamId);
    const playerRace = team?.race ? Number(team.race) : null;

    if (playerRace == null || match.winner == null) {
        return { played: true, outcome: null };
    }

    return {
        played: true,
        outcome: playerRace === match.winner ? "win" : "loss",
    };
}

export const useMatchUserOutcomes = (matches: MatchResponse[], username?: string | null) => {
    const matchIds = matches.map((match) => match.id);

    return useQuery({
        queryKey: ["MatchUserOutcomes", username ?? null, matchIds],
        enabled: Boolean(username) && matches.length > 0,
        queryFn: async (): Promise<Record<number, MatchUserSummary>> => {
            const normalizedUsername = username!.trim().toLowerCase();
            const results = await Promise.allSettled(
                matches.map(async (match) => {
                    const stats = await tauriFetchJson<MatchStatsResponse>(`${matchesBaseURL}/stats/${match.id}`);
                    return [match.id, getMatchUserSummary(match, stats, normalizedUsername)] as const;
                }),
            );

            return results.reduce<Record<number, MatchUserSummary>>((accumulator, result) => {
                if (result.status === "fulfilled") {
                    const [matchId, summary] = result.value;
                    accumulator[matchId] = summary;
                }

                return accumulator;
            }, {});
        },
        staleTime: 30_000,
    });
};