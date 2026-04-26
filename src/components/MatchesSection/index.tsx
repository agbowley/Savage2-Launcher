import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/api/shell";
import { invoke } from "@tauri-apps/api/tauri";
import Spinner from "@app/components/Spinner";
import { useMatchMaps, useMatchPlayerSearch, useMatches } from "@app/hooks/useMatches";
import { useReplayStatus } from "@app/hooks/useReplayStatus";
import { addTask, cancelTask } from "@app/tasks";
import QueueStore from "@app/tasks/queue";
import { ReplayDownloadTask } from "@app/tasks/Processors/Replay";
import { usePayload } from "@app/tasks/payload";
import { queryClient } from "@app/query";
import { showErrorDialog } from "@app/dialogs/dialogUtil";
import { CloseIcon, PlayIcon, QueueIcon, TimeIcon, TrashIcon } from "@app/assets/Icons";
import { useAuthStore } from "@app/stores/AuthStore";
import { useDownloadHistory } from "@app/stores/DownloadHistoryStore";
import type { MatchResponse, LocalReplayStatus, MatchSortBy, MatchUserSummary } from "@app/types/matches";
import type { S2Version } from "@app/hooks/useS2Version";
import type { ReleaseChannels } from "@app/hooks/useS2Release";
import { useTranslation } from "react-i18next";
import { useMatchUserOutcomes } from "../../hooks/useMatchUserOutcomes";
import styles from "./MatchesSection.module.css";

interface Props {
    channel: ReleaseChannels;
    version: S2Version;
}

const PAGE_SIZE = 25;

function profileFromChannel(channel: ReleaseChannels): string {
    switch (channel) {
        case "stable":
            return "latest";
        case "nightly":
            return "beta";
        case "legacy":
            return "legacy";
    }
}

function getPreferredDateLocales(locale: string): string[] {
    const normalizedLocale = locale.trim().toLowerCase();
    const locales: string[] = [];

    if (typeof navigator !== "undefined") {
        for (const navigatorLocale of navigator.languages ?? [navigator.language]) {
            const normalizedNavigatorLocale = navigatorLocale.trim().toLowerCase();
            if (
                normalizedNavigatorLocale === normalizedLocale
                || normalizedNavigatorLocale.startsWith(`${normalizedLocale}-`)
            ) {
                locales.push(navigatorLocale);
            }
        }
    }

    locales.push(locale);

    return [...new Set(locales)];
}

function formatGameTime(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(getPreferredDateLocales(locale), {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(new Date(iso));
}

function formatDateTime(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(getPreferredDateLocales(locale), {
        dateStyle: "medium",
        timeStyle: "short",
        hourCycle: "h23",
    }).format(new Date(iso));
}

function formatDuration(duration: string): string {
    return duration.startsWith("00:") ? duration.slice(3) : duration;
}

function formatMatchDate(iso: string, locale: string): string {
    return new Intl.DateTimeFormat(getPreferredDateLocales(locale), {
        dateStyle: "short",
    }).format(new Date(iso));
}

function winnerLabel(winner: number | null, t: (key: string) => string): string {
    if (winner === 1) return t("matches_winner_humans");
    if (winner === 2) return t("matches_winner_beasts");
    return t("matches_winner_unknown");
}

function winnerClass(winner: number | null): string {
    if (winner === 1) return styles.winner_humans;
    if (winner === 2) return styles.winner_beasts;
    return styles.winner_unknown;
}

function getStatusButtonSizeClass(label: string): string {
    if (label.length >= 13) {
        return styles.status_action_button_tight;
    }

    if (label.length >= 11) {
        return styles.status_action_button_compact;
    }

    return "";
}

interface MatchRowProps {
    match: MatchResponse;
    locale: string;
    userMatchSummary?: MatchUserSummary;
    replayStatus?: LocalReplayStatus;
    replayTask?: ReplayDownloadTask;
    onOpenMatchPage: (matchId: number) => Promise<void>;
    onDownload: (match: MatchResponse) => void;
    onCancelTask: (task: ReplayDownloadTask) => void;
    onDelete: (status: LocalReplayStatus) => Promise<void>;
    onWatch: (status: LocalReplayStatus) => Promise<void>;
}

const MatchRow: React.FC<MatchRowProps> = ({
    match,
    locale,
    userMatchSummary,
    replayStatus,
    replayTask,
    onOpenMatchPage,
    onDownload,
    onCancelTask,
    onDelete,
    onWatch,
}: MatchRowProps) => {
    const { t } = useTranslation("launch");
    const { t: tCommon } = useTranslation("common");
    const payload = usePayload(replayTask?.taskUUID);
    const isPending = payload?.state === "pending";
    const isStarted = !!replayTask?.startedAt;
    const isQueued = !!replayTask && !isStarted;
    const isDownloading = isStarted && payload?.state === "downloading";
    const isBusy = !!replayTask;
    const isCancelableBusy = isQueued || isPending;
    const matchDate = formatMatchDate(match.createdAt, locale);
    const matchDateTime = formatDateTime(match.createdAt, locale);
    const rowClassName = userMatchSummary?.outcome === "win"
        ? styles.match_row_win
        : userMatchSummary?.outcome === "loss"
            ? styles.match_row_loss
            : "";

    let replayButtonLabel = t("download_replay");
    if (isPending) {
        replayButtonLabel = t("pending_status");
    } else if (isDownloading) {
        replayButtonLabel = t("downloading");
    } else if (isQueued || isBusy) {
        replayButtonLabel = t("queued");
    }
    const statusButtonSizeClass = getStatusButtonSizeClass(replayButtonLabel);

    return (
        <tr className={rowClassName}>
            <td>
                <button className={styles.link_button} onClick={() => { void onOpenMatchPage(match.id); }}>
                    {match.id}
                </button>
            </td>
            <td>
                <span className={`${styles.winner_badge} ${winnerClass(match.winner)}`}>
                    {winnerLabel(match.winner, t)}
                </span>
            </td>
            <td className={styles.date_cell} title={matchDateTime}>
                <span className={styles.date_primary}>{matchDate}</span>
                <span className={styles.date_secondary}>{formatGameTime(match.createdAt, locale)}</span>
            </td>
            <td>{formatDuration(match.duration)}</td>
            <td className={styles.map_cell} title={match.map}>{match.map}</td>
            <td className={styles.action_cell}>
                {isBusy ? (
                    <button
                        className={[
                            styles.action_button,
                            styles.status_action_button,
                            statusButtonSizeClass,
                            isPending ? styles.pending_button : styles.queued_button,
                        ].join(" ")}
                        disabled={!isCancelableBusy}
                        onClick={() => {
                            if (replayTask && isCancelableBusy) {
                                onCancelTask(replayTask);
                            }
                        }}
                        title={isCancelableBusy ? tCommon("cancel") : undefined}
                    >
                        {isDownloading ? (
                            <Spinner size={10} className={styles.status_action_spinner} />
                        ) : isPending ? (
                            <TimeIcon width={10} height={10} />
                        ) : isQueued ? (
                            <QueueIcon width={10} height={10} />
                        ) : null}
                        <span className={styles.status_action_label}>{replayButtonLabel}</span>
                    </button>
                ) : replayStatus?.exists ? (
                    <div className={styles.replay_actions}>
                        <button
                            className={`${styles.action_button} ${styles.watch_action_button}`}
                            onClick={() => { void onWatch(replayStatus); }}
                            title={t("watch_replay")}
                        >
                            <PlayIcon width={10} height={10} />
                            <span>{t("watch_replay")}</span>
                        </button>
                        <button
                            className={styles.delete_action_button}
                            onClick={() => { void onDelete(replayStatus); }}
                            title={tCommon("remove")}
                        >
                            <TrashIcon width={10} height={10} />
                            <span>{tCommon("remove")}</span>
                        </button>
                    </div>
                ) : (
                    <button
                        className={`${styles.action_button} ${styles.download_action_button}`}
                        onClick={() => onDownload(match)}
                    >
                        {t("download_replay")}
                    </button>
                )}
            </td>
        </tr>
    );
};

const MatchesSection: React.FC<Props> = ({ channel, version }: Props) => {
    const { t, i18n } = useTranslation("launch");
    const { t: tCommon } = useTranslation("common");
    const { t: tDialogs } = useTranslation("dialogs");
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState<MatchSortBy>("createdAt");
    const [isAscending, setIsAscending] = useState(false);
    const [matchIdInput, setMatchIdInput] = useState("");
    const [debouncedMatchIdInput, setDebouncedMatchIdInput] = useState("");
    const [selectedMaps, setSelectedMaps] = useState<string[]>([]);
    const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
    const [playerSearch, setPlayerSearch] = useState("");
    const [myGamesOnly, setMyGamesOnly] = useState(false);
    const [showTip, setShowTip] = useState(
        () => !localStorage.getItem("matches_browse_tip_dismissed"),
    );
    const matchIdInputRef = useRef<HTMLInputElement>(null);
    const profile = profileFromChannel(channel);
    const user = useAuthStore((store) => store.user);
    const username = user?.username ?? null;
    const deferredPlayerSearch = useDeferredValue(playerSearch);
    const trimmedMatchId = debouncedMatchIdInput.trim();
    const matchId = trimmedMatchId ? Number.parseInt(trimmedMatchId, 10) : null;
    const { data, isLoading, isError, error } = useMatches({
        page,
        pageSize: PAGE_SIZE,
        sortBy,
        isAscending,
        playerUsername: username,
        myGamesOnly,
        matchId,
        selectedMaps,
        selectedPlayers,
    });
    const { data: mapOptions = [], isLoading: areMapsLoading } = useMatchMaps({
        playerUsername: username,
        myGamesOnly,
        matchId,
        selectedPlayers,
    });
    const { data: playerSearchResults = [], isLoading: arePlayersLoading } = useMatchPlayerSearch(deferredPlayerSearch);
    const visibleMatches = data?.matches ?? [];
    const { data: matchUserOutcomes } = useMatchUserOutcomes(visibleMatches, username);
    const matchIds = useMemo(() => data?.matches.map((match) => match.id) ?? [], [data?.matches]);
    const { data: replayStatuses } = useReplayStatus(matchIds);
    const queue = QueueStore.useQueue();
    const selectedMapsSet = useMemo(() => new Set(selectedMaps), [selectedMaps]);
    const selectedPlayersSet = useMemo(() => new Set(selectedPlayers), [selectedPlayers]);
    const availableMapOptions = useMemo(() => [...new Set([...mapOptions, ...selectedMaps])]
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })), [mapOptions, selectedMaps]);
    const availablePlayerOptions = useMemo(() => [...new Set([...playerSearchResults, ...selectedPlayers])]
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" })), [playerSearchResults, selectedPlayers]);
    const mapFilterSummary = selectedMaps.length === 0
        ? t("matches_map_filter_all")
        : selectedMaps.length === 1
            ? selectedMaps[0]
            : t("matches_map_filter_selected", { count: selectedMaps.length });
    const playerFilterSummary = selectedPlayers.length === 0
        ? t("matches_player_filter_all")
        : selectedPlayers.length === 1
            ? selectedPlayers[0]
            : t("matches_player_filter_selected", { count: selectedPlayers.length });
    const isPlayerSearchActive = deferredPlayerSearch.trim().length >= 2;

    const dismissTip = () => {
        setShowTip(false);
        localStorage.setItem("matches_browse_tip_dismissed", "1");
    };

    useEffect(() => {
        if (!user && myGamesOnly) {
            setMyGamesOnly(false);
            setPage(1);
        }
    }, [myGamesOnly, user]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            setDebouncedMatchIdInput(matchIdInput);
        }, 350);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [matchIdInput]);

    const replayStatusById = useMemo(() => {
        const map = new Map<number, LocalReplayStatus>();
        for (const status of replayStatuses ?? []) {
            map.set(status.matchId, status);
        }
        return map;
    }, [replayStatuses]);

    const replayTasksById = useMemo(() => {
        const map = new Map<number, ReplayDownloadTask>();
        for (const task of queue) {
            if (task.taskTag !== "replay" || task.profile !== profile) continue;
            const replayTask = task as ReplayDownloadTask;
            map.set(replayTask.matchId, replayTask);
        }
        return map;
    }, [profile, queue]);

    const totalPages = Math.max(1, Math.ceil((data?.totalCount ?? 0) / PAGE_SIZE));

    const toggleMap = (mapName: string) => {
        setSelectedMaps((current) => {
            const next = new Set(current);
            if (next.has(mapName)) {
                next.delete(mapName);
            } else {
                next.add(mapName);
            }

            return [...next].sort((left, right) => left.localeCompare(right));
        });
        setPage(1);
    };

    const clearSelectedMaps = () => {
        setSelectedMaps([]);
        setPage(1);
    };

    const togglePlayer = (playerName: string) => {
        setSelectedPlayers((current) => {
            const next = new Set(current);
            if (next.has(playerName)) {
                next.delete(playerName);
            } else {
                next.add(playerName);
            }

            return [...next].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
        });
        setPage(1);
    };

    const clearSelectedPlayers = () => {
        setSelectedPlayers([]);
        setPlayerSearch("");
        setPage(1);
    };

    const handleMatchIdChange = (value: string) => {
        setMatchIdInput(value.replace(/\D+/g, ""));
        setPage(1);
    };

    const clearMatchId = () => {
        setMatchIdInput("");
        setDebouncedMatchIdInput("");
        setPage(1);
        matchIdInputRef.current?.focus();
    };

    const handleToggleMyGames = (checked: boolean) => {
        setMyGamesOnly(checked);
        setPage(1);
    };

    const handleToggleMatchSort = () => {
        setPage(1);
        if (sortBy === "id") {
            setIsAscending((current) => !current);
            return;
        }

        setSortBy("id");
        setIsAscending(false);
    };

    const openMatchPage = async (matchId: number) => {
        await open(`https://savage2.net/matches/${matchId}`);
    };

    const handleDownload = (match: MatchResponse) => {
        if (replayTasksById.has(match.id)) return;

        const task = new ReplayDownloadTask(
            profile,
            match.id,
            match.map,
            match.createdAt,
            () => {
                useDownloadHistory.getState().addEntry({
                    game: "Savage 2",
                    channel,
                    type: "replay",
                    version: null,
                    previousVersion: null,
                    matchId: match.id,
                    mapName: match.map,
                });
                queryClient.invalidateQueries({ queryKey: ["replay-status"] });
            },
        );

        task.onCancel = () => {
            queryClient.invalidateQueries({ queryKey: ["replay-status"] });
        };

        addTask(task);
    };

    const handleCancelReplayTask = (task: ReplayDownloadTask) => {
        void cancelTask(task);
    };

    const handleWatch = async (status: LocalReplayStatus) => {
        if (!status.filename) return;
        await version.watchReplay(status.filename);
    };

    const handleDelete = async (status: LocalReplayStatus) => {
        if (!status.filename) return;

        try {
            await invoke("delete_local_replay", { filename: status.filename });
            await queryClient.invalidateQueries({ queryKey: ["replay-status"] });
        } catch (error) {
            showErrorDialog(error as string);
            console.error(error);
        }
    };

    if (isLoading && !data) {
        return (
            <div className={styles.center_message}>
                <Spinner size={24} />
                {t("matches_loading")}
            </div>
        );
    }

    if (isError && !data) {
        return (
            <div className={styles.center_message}>
                <span className={styles.error_text}>
                    {t("matches_error", { error: (error as Error)?.message ?? String(error) })}
                </span>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {showTip && (
                <div className={styles.tip_banner}>
                    <p>{t("matches_browse_tip")}</p>
                    <button className={styles.tip_dismiss} onClick={dismissTip}>
                        {t("feature_tip_dismiss")}
                    </button>
                </div>
            )}
            <div className={styles.filter_bar}>
                <div className={styles.match_id_input_wrapper}>
                    <input
                        ref={matchIdInputRef}
                        className={styles.match_id_input}
                        type="text"
                        inputMode="numeric"
                        placeholder={t("matches_match_id_placeholder")}
                        value={matchIdInput}
                        onChange={(event) => handleMatchIdChange(event.target.value)}
                    />
                    {matchIdInput.length > 0 && (
                        <button
                            type="button"
                            className={styles.match_id_clear_button}
                            onClick={clearMatchId}
                            aria-label={t("matches_match_id_clear")}
                            title={t("matches_match_id_clear")}
                        >
                            <CloseIcon width={10} height={10} />
                        </button>
                    )}
                </div>

                <details className={styles.map_filter_dropdown}>
                    <summary className={styles.filter_dropdown_trigger}>
                        <span className={styles.filter_dropdown_label}>{t("matches_player_filter_label")}</span>
                        <span className={styles.filter_dropdown_value}>{playerFilterSummary}</span>
                    </summary>
                    <div className={styles.filter_dropdown_menu}>
                        <input
                            className={styles.filter_search_input}
                            type="text"
                            placeholder={t("matches_player_filter_search")}
                            value={playerSearch}
                            onChange={(event) => setPlayerSearch(event.target.value)}
                        />
                        <button
                            type="button"
                            className={styles.filter_clear_button}
                            disabled={selectedPlayers.length === 0 && playerSearch.length === 0}
                            onClick={clearSelectedPlayers}
                        >
                            {t("matches_player_filter_all")}
                        </button>
                        <div className={styles.map_filter_options}>
                            {isPlayerSearchActive && arePlayersLoading && availablePlayerOptions.length === 0 ? (
                                <span className={styles.map_filter_hint}>{tCommon("loading")}</span>
                            ) : availablePlayerOptions.length > 0 ? (
                                availablePlayerOptions.map((playerName) => (
                                    <label key={playerName} className={styles.map_filter_option}>
                                        <input
                                            type="checkbox"
                                            checked={selectedPlayersSet.has(playerName)}
                                            onChange={() => togglePlayer(playerName)}
                                        />
                                        <span>{playerName}</span>
                                    </label>
                                ))
                            ) : (
                                <span className={styles.map_filter_hint}>
                                    {isPlayerSearchActive ? t("matches_player_filter_empty") : t("matches_player_filter_prompt")}
                                </span>
                            )}
                        </div>
                    </div>
                </details>

                <details className={styles.map_filter_dropdown}>
                    <summary className={styles.filter_dropdown_trigger}>
                        <span className={styles.filter_dropdown_label}>{t("matches_col_map")}</span>
                        <span className={styles.filter_dropdown_value}>{mapFilterSummary}</span>
                    </summary>
                    <div className={styles.filter_dropdown_menu}>
                        <button
                            type="button"
                            className={styles.filter_clear_button}
                            disabled={selectedMaps.length === 0}
                            onClick={clearSelectedMaps}
                        >
                            {t("matches_map_filter_all")}
                        </button>
                        <div className={styles.map_filter_options}>
                            {areMapsLoading && availableMapOptions.length === 0 ? (
                                <span className={styles.map_filter_hint}>{tCommon("loading")}</span>
                            ) : availableMapOptions.length === 0 ? (
                                <span className={styles.map_filter_hint}>{t("matches_map_filter_empty")}</span>
                            ) : availableMapOptions.map((mapName) => (
                                <label key={mapName} className={styles.map_filter_option}>
                                    <input
                                        type="checkbox"
                                        checked={selectedMapsSet.has(mapName)}
                                        onChange={() => toggleMap(mapName)}
                                    />
                                    <span>{mapName}</span>
                                </label>
                            ))}
                        </div>
                    </div>
                </details>

                <div className={styles.filter_spacer} />

                <label
                    className={`${styles.my_games_toggle} ${!user ? styles.my_games_toggle_disabled : ""}`}
                    title={!user ? t("servers_sign_in_required") : undefined}
                >
                    <input
                        type="checkbox"
                        checked={myGamesOnly}
                        disabled={!user}
                        onChange={(event) => handleToggleMyGames(event.target.checked)}
                    />
                    <span>{t("matches_my_games")}</span>
                </label>
            </div>

            <div className={styles.table_wrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.col_match}>
                                <button className={styles.sort_header_button} onClick={handleToggleMatchSort}>
                                    <span>{t("matches_col_match_id")}</span>
                                    <span className={`${styles.sort_indicator} ${sortBy === "id" ? styles.sort_indicator_active : ""}`}>
                                        {sortBy === "id" ? (isAscending ? "↑" : "↓") : "↕"}
                                    </span>
                                </button>
                            </th>
                            <th className={styles.col_winner}>{t("matches_col_winner")}</th>
                            <th className={styles.col_date}>{t("matches_col_date")}</th>
                            <th className={styles.col_duration}>{t("matches_col_duration")}</th>
                            <th className={styles.col_map}>{t("matches_col_map")}</th>
                            <th className={styles.col_action} aria-label={t("matches_col_replay")}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.matches.map((match) => (
                            <MatchRow
                                key={match.id}
                                match={match}
                                locale={i18n.language}
                                userMatchSummary={matchUserOutcomes?.[match.id]}
                                replayStatus={replayStatusById.get(match.id)}
                                replayTask={replayTasksById.get(match.id)}
                                onOpenMatchPage={openMatchPage}
                                onDownload={handleDownload}
                                onCancelTask={handleCancelReplayTask}
                                onDelete={handleDelete}
                                onWatch={handleWatch}
                            />
                        ))}
                        {(data?.matches.length ?? 0) === 0 && (
                            <tr>
                                <td colSpan={6} className={styles.empty_cell}>
                                    {t("matches_none")}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {totalPages > 1 && (
                <div className={styles.pagination}>
                    <button
                        className={styles.page_button}
                        disabled={page <= 1}
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                        {tDialogs("prev")}
                    </button>
                    <span className={styles.page_indicator}>
                        {tDialogs("page_indicator", { page, totalPages })}
                    </span>
                    <button
                        className={styles.page_button}
                        disabled={page >= totalPages}
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    >
                        {tCommon("next")}
                    </button>
                </div>
            )}
        </div>
    );
};

export default MatchesSection;