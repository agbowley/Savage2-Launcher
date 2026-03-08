import React from "react";
import { closeDialog } from "..";
import styles from "./GoldHistoryDialog.module.css";
import { useAuthStore } from "@app/stores/AuthStore";
import { tauriFetchJson } from "@app/utils/tauriFetch";
import Spinner from "@app/components/Spinner";

interface GoldTransaction {
    id: number;
    totalAmount: number;
    baseAmount: number;
    boostAmount: number;
    sourceType: number;
    sourceName: string;
    eventName: string | null;
    eventMultiplier: number | null;
    createdAt: string;
}

interface ProfileGoldLog {
    goldLog: {
        transactions: GoldTransaction[];
        totalCount: number;
        page: number;
        pageSize: number;
    };
}

const SOURCE_LABELS: Record<number, string> = {
    1: "Match",
    2: "Achievement",
    3: "Daily Quest",
    4: "Weekly Reward",
    5: "Referral",
    6: "Admin",
};

const SOURCE_STYLES: Record<number, string> = {
    1: styles.sourceMatch,
    2: styles.sourceAchievement,
    3: styles.sourceDailyQuest,
    4: styles.sourceWeeklyReward,
    5: styles.sourceReferral,
    6: styles.sourceAdmin,
};

function formatDate(iso: string): string {
    const d = new Date(iso);
    const day = d.getDate().toString().padStart(2, "0");
    const mon = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    const hrs = d.getHours().toString().padStart(2, "0");
    const min = d.getMinutes().toString().padStart(2, "0");
    return `${day}/${mon}/${year} ${hrs}:${min}`;
}

interface State {
    transactions: GoldTransaction[];
    loading: boolean;
    page: number;
    totalCount: number;
    pageSize: number;
    pageCache: Map<number, { transactions: GoldTransaction[]; totalCount: number }>;
}

export class GoldHistoryDialog extends React.Component<Record<string, unknown>, State> {
    state: State = {
        transactions: [],
        loading: true,
        page: 1,
        totalCount: 0,
        pageSize: 15,
        pageCache: new Map(),
    };

    componentDidMount() {
        this.fetchHistory(1);
    }

    fetchHistory = async (page: number) => {
        const cached = this.state.pageCache.get(page);
        if (cached) {
            this.setState({ transactions: cached.transactions, totalCount: cached.totalCount, page });
        }
        this.setState({ loading: true, page });
        try {
            const user = useAuthStore.getState().user;
            if (!user) return;
            const data = await tauriFetchJson<ProfileGoldLog>(
                `https://savage2.net/api/players/${encodeURIComponent(user.username)}/profile?goldLogPage=${page}&goldLogPageSize=${this.state.pageSize}`
            );
            const entry = { transactions: data.goldLog.transactions, totalCount: data.goldLog.totalCount };
            this.setState(prev => {
                const cache = new Map(prev.pageCache);
                cache.set(page, entry);
                return {
                    transactions: entry.transactions,
                    totalCount: entry.totalCount,
                    page: data.goldLog.page,
                    pageCache: cache,
                };
            });
        } catch {
            if (!cached) this.setState({ transactions: [] });
        } finally {
            this.setState({ loading: false });
        }
    };

    render() {
        const { transactions, loading, page, totalCount, pageSize } = this.state;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        const hasData = transactions.length > 0;
        const initialLoad = loading && !hasData;

        return (
            <div className={styles.container}>
                <div className={styles.titleRow}>
                    <span className={styles.title}>Gold History</span>
                    <button className={styles.closeBtn} onClick={() => closeDialog()}>&#10005;</button>
                </div>

                {initialLoad ? (
                    <div className={styles.loading}><Spinner size={20} /></div>
                ) : !hasData ? (
                    <div className={styles.empty}>No transactions found</div>
                ) : (
                    <>
                        <div className={`${styles.tableWrap} ${loading ? styles.tableLoading : ""}`}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Amount</th>
                                        <th>Source</th>
                                        <th>Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {transactions.map(tx => (
                                        <tr key={tx.id}>
                                            <td>
                                                <span className={tx.totalAmount >= 0 ? styles.positive : styles.negative}>
                                                    {tx.totalAmount >= 0 ? "+" : ""}{tx.totalAmount}
                                                </span>
                                                {tx.boostAmount > 0 && (
                                                    <span className={styles.boost}>(+{tx.boostAmount} bonus)</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className={styles.sourceCell}>
                                                    <span className={`${styles.sourceTag} ${SOURCE_STYLES[tx.sourceType] ?? ""}`}>
                                                        {SOURCE_LABELS[tx.sourceType] ?? "Other"}
                                                    </span>
                                                    {(tx.sourceName || tx.eventName) && (
                                                        <span className={styles.sourceName}>{tx.sourceName || tx.eventName}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>{formatDate(tx.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {totalPages > 1 && (
                            <div className={styles.pagination}>
                                <button
                                    className={styles.pageBtn}
                                    disabled={page <= 1 || loading}
                                    onClick={() => this.fetchHistory(page - 1)}
                                >
                                    Prev
                                </button>
                                <span>Page {page} / {totalPages}</span>
                                <button
                                    className={styles.pageBtn}
                                    disabled={page >= totalPages || loading}
                                    onClick={() => this.fetchHistory(page + 1)}
                                >
                                    Next
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }
}
