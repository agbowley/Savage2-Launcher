import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/tauri";
import { useServers, type ServerEntry } from "@app/hooks/useServers";
import { useServerFavourites } from "@app/stores/ServerFavouritesStore";
import { useAuthStore } from "@app/stores/AuthStore";
import { showLoginDialog } from "@app/dialogs/dialogUtil";
import Spinner from "../Spinner";
import TooltipWrapper from "../TooltipWrapper";
import LauncherIcon from "@app/assets/SourceIcons/Official.png";
import { PlayIcon } from "@app/assets/Icons";
import styles from "./ServerBrowser.module.css";
import type { MsAuthResponse } from "@app/types/auth";

const FastForwardIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
        <path d="M13 6v12l8.5-6L13 6zM3 6v12l8.5-6L3 6z" />
    </svg>
);

type SortKey = "name" | "map" | "players" | "ping" | "location" | "official";

// eslint-disable-next-line react/prop-types
const MarqueeCell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const wrapperRef = useRef<HTMLSpanElement>(null);
    const [overflows, setOverflows] = useState(false);

    const checkOverflow = useCallback(() => {
        const el = wrapperRef.current;
        if (el) setOverflows(el.scrollWidth > el.clientWidth);
    }, []);

    return (
        <span
            ref={wrapperRef}
            className={`${styles.marquee_wrapper}${overflows ? ` ${styles.marquee_overflows}` : ""}`}
            onMouseEnter={checkOverflow}
        >
            <span className={styles.marquee_text}>{children}</span>
        </span>
    );
};

interface Props {
    latestVersion: string | null;
    onConnect?: (address: string) => void;
}

/** Pick the best server to quick-connect to.
 *  Priority: favourited servers first, then by highest player count.
 *  Tiebreaker: prefer official servers, then lower ping brackets (<100, <200, any).
 *  If all servers are empty, fall back to favourited → lowest ping, then any → lowest ping. */
function pickQuickConnectServer(
    servers: ServerEntry[],
    favourites: string[],
): ServerEntry | null {
    const online = servers.filter((s) => s.online && !s.passworded);
    if (online.length === 0) return null;

    const bestInBracket = (pool: ServerEntry[]): ServerEntry | null => {
        for (const maxPing of [100, 200, Infinity]) {
            const bracket = pool.filter((s) => s.ping < maxPing);
            if (bracket.length > 0) {
                return bracket.reduce((a, b) => {
                    if (b.players !== a.players) return b.players > a.players ? b : a;
                    if (b.official !== a.official) return b.official ? b : a;
                    return a;
                });
            }
        }
        return null;
    };

    const lowestPing = (pool: ServerEntry[]): ServerEntry | null => {
        if (pool.length === 0) return null;
        return pool.reduce((a, b) => (a.ping < b.ping ? a : b));
    };

    // Populated servers (at least 1 player)
    const populated = online.filter((s) => s.players > 0);

    if (populated.length > 0) {
        // Try favourited populated servers first
        const favPool = populated.filter((s) => favourites.includes(s.id));
        if (favPool.length > 0) {
            const pick = bestInBracket(favPool);
            if (pick) return pick;
        }
        // Fall back to all populated servers
        const pick = bestInBracket(populated);
        if (pick) return pick;
    }

    // All servers are empty — pick by lowest ping, favourites first
    const favEmpty = online.filter((s) => favourites.includes(s.id));
    if (favEmpty.length > 0) {
        return lowestPing(favEmpty);
    }
    return lowestPing(online);
}

// eslint-disable-next-line react/prop-types
const ServerBrowser: React.FC<Props> = ({ latestVersion, onConnect }) => {
    const { t } = useTranslation("launch");
    const { data: servers, isLoading, isError, error } = useServers(latestVersion);
    const { favourites, toggleFavourite } = useServerFavourites();
    const isLoggedIn = useAuthStore((s) => s.user !== null && s.authToken !== null);

    const [search, setSearch] = useState("");
    const [hideEmpty, setHideEmpty] = useState(false);
    const [sortKey, setSortKey] = useState<SortKey>("ping");
    const [sortDesc, setSortDesc] = useState(false);
    const [detailServer, setDetailServer] = useState<ServerEntry | null>(null);

    const hasMsCredentials = useAuthStore((s) => s.msPassword !== null);

    const handleQuickConnect = useCallback(async () => {
        if (!servers || !onConnect) return;
        if (!isLoggedIn || !hasMsCredentials) {
            await showLoginDialog();
            return;
        }

        // Pre-validate MS credentials; if they're stale, prompt re-login
        const { user, msPassword } = useAuthStore.getState();
        if (!user || !msPassword) {
            await showLoginDialog();
            return;
        }
        try {
            const msAuth = await invoke<MsAuthResponse>("ms_authenticate", {
                username: user.username,
                password: msPassword,
            });
            useAuthStore.setState({ msCookie: msAuth.cookie, msAccountId: msAuth.accountId });
        } catch {
            await showLoginDialog();
            return;
        }

        const target = pickQuickConnectServer(servers, favourites);
        if (target) {
            onConnect(`${target.ip}:${target.port}`);
        }
    }, [servers, favourites, onConnect, isLoggedIn, hasMsCredentials]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDesc((d) => !d);
        } else {
            setSortKey(key);
            setSortDesc(key === "players");
        }
    };

    const sortIndicator = (key: SortKey) =>
        sortKey === key ? (
            <span className={styles.sort_indicator}>{sortDesc ? "▼" : "▲"}</span>
        ) : null;

    const filtered = useMemo(() => {
        if (!servers) return [];
        let list = servers;
        if (hideEmpty) {
            list = list.filter((s) => s.players > 0);
        }
        if (search) {
            const q = search.toLowerCase();
            list = list.filter(
                (s) =>
                    s.name.toLowerCase().includes(q) ||
                    s.map.toLowerCase().includes(q) ||
                    s.location.toLowerCase().includes(q),
            );
        }
        const sorted = [...list].sort((a, b) => {
            // Pinned servers always come first
            const aFav = favourites.includes(a.id);
            const bFav = favourites.includes(b.id);
            if (aFav !== bFav) return aFav ? -1 : 1;

            // Official servers come next
            if (a.official !== b.official) return a.official ? -1 : 1;

            let cmp = 0;
            switch (sortKey) {
                case "official":
                    cmp = 0;
                    break;
                case "name":
                    cmp = a.name.localeCompare(b.name);
                    break;
                case "map":
                    cmp = a.map.localeCompare(b.map);
                    break;
                case "players":
                    cmp = a.players - b.players;
                    break;
                case "ping": {
                    const ap = a.online ? a.ping : 99999;
                    const bp = b.online ? b.ping : 99999;
                    cmp = ap - bp;
                    break;
                }
                case "location":
                    cmp = a.location.localeCompare(b.location);
                    break;
            }
            return sortDesc ? -cmp : cmp;
        });
        return sorted;
    }, [servers, search, hideEmpty, sortKey, sortDesc, favourites]);

    const totalPlayers = useMemo(
        () => (servers ?? []).reduce((sum, s) => sum + s.players, 0),
        [servers],
    );

    if (isLoading) {
        return (
            <div className={styles.center_message}>
                <Spinner size={24} />
                {t("servers_loading")}
            </div>
        );
    }

    if (isError) {
        return (
            <div className={styles.center_message}>
                <span className={styles.error_text}>
                    {t("servers_error", { error: (error as Error)?.message ?? String(error) })}
                </span>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.filter_bar}>
                <input
                    className={styles.search_input}
                    type="text"
                    placeholder={t("servers_search")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <TooltipWrapper text={t("servers_quick_connect_tip")}>
                    <button
                        className={styles.quick_connect}
                        onClick={handleQuickConnect}
                    >
                        <FastForwardIcon />
                        {t("servers_quick_connect")}
                    </button>
                </TooltipWrapper>
                <label className={styles.hide_empty_label}>
                    <input
                        type="checkbox"
                        checked={hideEmpty}
                        onChange={(e) => setHideEmpty(e.target.checked)}
                    />
                    {t("servers_hide_empty")}
                </label>
                <span className={styles.player_count}>
                    {t("servers_total_players", { count: totalPlayers })}
                </span>
            </div>

            <div className={styles.table_wrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.col_official} onClick={() => handleSort("official")}>
                                {sortIndicator("official")}
                            </th>
                            <th className={styles.col_name} onClick={() => handleSort("name")}>
                                {t("servers_col_name")}
                                {sortIndicator("name")}
                            </th>
                            <th className={styles.col_map} onClick={() => handleSort("map")}>
                                {t("servers_col_map")}
                                {sortIndicator("map")}
                            </th>
                            <th className={styles.col_players} onClick={() => handleSort("players")}>
                                {t("servers_col_players")}
                                {sortIndicator("players")}
                            </th>
                            <th className={styles.col_ping} onClick={() => handleSort("ping")}>
                                {t("servers_col_ping")}
                                {sortIndicator("ping")}
                            </th>
                            <th className={styles.col_location} onClick={() => handleSort("location")}>
                                {t("servers_col_location")}
                                {sortIndicator("location")}
                            </th>
                            <th className={styles.col_join} />
                            <th className={styles.col_info} />
                            <th className={styles.col_pin} />
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((srv) => (
                            <ServerRow
                                key={srv.id}
                                server={srv}
                                t={t}
                                isPinned={favourites.includes(srv.id)}
                                onTogglePin={toggleFavourite}
                                onShowDetail={setDetailServer}
                                canConnect={!!onConnect && isLoggedIn}
                                onConnect={onConnect}
                            />
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={9} style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.35)" }}>
                                    {t("servers_none")}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {detailServer && (
                <div className={styles.overlay_backdrop} onClick={() => setDetailServer(null)}>
                    <div className={styles.overlay_panel} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.overlay_close} onClick={() => setDetailServer(null)}>×</button>
                        <h3 className={styles.overlay_title}>
                            {detailServer.official && (
                                <img className={styles.official_badge} src={LauncherIcon} alt="Official" />
                            )}
                            {detailServer.name}
                        </h3>
                        <div className={styles.overlay_grid}>
                            <span className={styles.overlay_label}>{t("servers_col_map")}</span>
                            <span>{detailServer.map || "—"}</span>
                            <span className={styles.overlay_label}>{t("servers_detail_next_map")}</span>
                            <span>{detailServer.nextMap || "—"}</span>
                            <span className={styles.overlay_label}>{t("servers_col_players")}</span>
                            <span>{detailServer.players}/{detailServer.maxPlayers} (min: {detailServer.minPlayers})</span>
                            <span className={styles.overlay_label}>{t("servers_col_ping")}</span>
                            <span style={detailServer.online ? { color: pingColor(detailServer.ping) } : undefined}>
                                {detailServer.online ? `${detailServer.ping}ms` : "—"}
                            </span>
                            <span className={styles.overlay_label}>{t("servers_col_location")}</span>
                            <span>{detailServer.location || "—"}</span>
                            <span className={styles.overlay_label}>{t("servers_col_version")}</span>
                            <span>{detailServer.version || "—"}</span>
                            <span className={styles.overlay_label}>{t("servers_detail_game_time")}</span>
                            <span>{detailServer.gameTime || "—"}</span>
                            <span className={styles.overlay_label}>{t("servers_detail_address")}</span>
                            <span>{detailServer.ip}:{detailServer.port}</span>
                            <span className={styles.overlay_label}>{t("servers_detail_level_range")}</span>
                            <span>{detailServer.minLevel}–{detailServer.maxLevel}</span>
                            <span className={styles.overlay_label}>{t("servers_detail_password")}</span>
                            <span>{detailServer.passworded ? "✔" : "✖"}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/** Map ping (ms) to green (<100) → orange (100-180) → red (>180). */
function pingColor(ping: number): string {
    if (ping < 100) return "rgb(74, 222, 128)";
    if (ping <= 180) {
        const ratio = (ping - 100) / 80;
        const g = Math.round(222 - ratio * 92);
        return `rgb(255, ${g}, 50)`;
    }
    return "rgb(255, 80, 50)";
}

interface RowProps {
    server: ServerEntry;
    t: (key: string, opts?: Record<string, unknown>) => string;
    isPinned: boolean;
    onTogglePin: (id: string) => void;
    onShowDetail: (srv: ServerEntry) => void;
    canConnect: boolean;
    onConnect?: (address: string) => void;
}

const ServerRow: React.FC<RowProps> = ({ server: srv, t, isPinned, onTogglePin, onShowDetail, canConnect, onConnect }: RowProps) => {
    return (
        <tr className={isPinned ? styles.row_pinned : undefined}>
            <td className={styles.official_cell}>
                {srv.official && (
                    <TooltipWrapper text={t("servers_official")}>
                        <img className={styles.official_badge} src={LauncherIcon} alt="Official" />
                    </TooltipWrapper>
                )}
            </td>
            <td>
                <div className={styles.name_cell}>
                    {srv.passworded && (
                        <TooltipWrapper text={t("servers_passworded")}>
                            <span className={styles.lock_icon}>🔒</span>
                        </TooltipWrapper>
                    )}
                    <MarqueeCell>{srv.name}</MarqueeCell>
                </div>
            </td>
            <td>
                <MarqueeCell>{srv.map || "—"}</MarqueeCell>
            </td>
            <td>{srv.players}/{srv.maxPlayers}</td>
            <td style={srv.online ? { color: pingColor(srv.ping) } : undefined}>
                {srv.online ? `${srv.ping}ms` : "—"}
            </td>
            <td>
                <MarqueeCell>{srv.location || "—"}</MarqueeCell>
            </td>
            <td className={styles.join_cell}>
                <TooltipWrapper text={canConnect ? t("servers_connect") : t("servers_connect_login")}>
                    <button
                        className={styles.join_button}
                        disabled={!canConnect}
                        onClick={() => onConnect?.(`${srv.ip}:${srv.port}`)}
                    >
                        <PlayIcon width={10} height={10} />
                    </button>
                </TooltipWrapper>
            </td>
            <td className={styles.info_cell}>
                <button
                    className={styles.info_button}
                    onClick={() => onShowDetail(srv)}
                    title={t("servers_detail_title")}
                >
                    ⓘ
                </button>
            </td>
            <td className={styles.pin_cell}>
                <button
                    className={`${styles.pin_button} ${isPinned ? styles.pin_active : ""}`}
                    onClick={() => onTogglePin(srv.id)}
                    title={isPinned ? t("servers_unfavourite") : t("servers_favourite")}
                >
                    📌
                </button>
            </td>
        </tr>
    );
};

export default ServerBrowser;
