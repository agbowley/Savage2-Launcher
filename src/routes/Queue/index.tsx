import styles from "./Queue.module.css";
import QueueSection from "@app/components/Queue/QueueSection";
import PayloadProgress from "@app/components/PayloadProgress";
import HistoryEntryComponent from "@app/components/Queue/HistoryEntry";
import * as Progress from "@radix-ui/react-progress";
import { QueueIcon, QueueListIcon, TimeIcon } from "@app/assets/Icons";
import QueueStore from "@app/tasks/queue";
import { calculatePayloadPercentage, usePayload } from "@app/tasks/payload";
import { useCurrentTask, cancelTask } from "@app/tasks";
import { useDownloadHistory } from "@app/stores/DownloadHistoryStore";
import { intlFormatDistance } from "date-fns";
import { useNavigate } from "react-router-dom";
import { ModDownloadTask } from "@app/tasks/Processors/Mod";
import { useTranslation } from "react-i18next";

function Queue() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const queue = QueueStore.useQueue();
    const currentTask = useCurrentTask();
    const payload = usePayload(currentTask?.taskUUID);
    const { entries: historyEntries, clearHistory } = useDownloadHistory();

    function getProgressValue() {
        if (payload?.state !== "downloading") {
            return null;
        }

        const percentage = calculatePayloadPercentage(payload);
        if (percentage == null || !Number.isFinite(percentage) || percentage <= 0) {
            return null;
        }

        return Math.min(percentage, 99.9);
    }

    function getProgressWidth() {
        if (payload?.state !== "downloading") {
            return undefined;
        }

        const percentage = calculatePayloadPercentage(payload);
        if (percentage == null || !Number.isFinite(percentage)) {
            return undefined;
        }

        return `${Math.min(Math.max(percentage, 0), 100)}%`;
    }

    const progressValue = getProgressValue();
    const progressWidth = getProgressWidth();
    const isIndeterminate = currentTask != null && progressValue === null;

    return <div className={styles.page}>
        <div className={styles.header}>
            <h1 className={styles.heading}>
                <QueueIcon /> {t("downloads")}
            </h1>
        </div>

        {currentTask && (
            <div className={styles.download_section}>
                <div className={styles.download_header}>
                    <div
                        className={styles.banner_entry_link}
                        onClick={() => {
                            const tag = currentTask.taskTag;
                            const profile = currentTask.profile;
                            if (tag === "Savage 2") {
                                const channel = profile === "latest" ? "stable"
                                    : profile === "beta" ? "nightly" : profile;
                                navigate(`/s2/${channel}`);
                            } else if (tag === "replay") {
                                const channel = profile === "latest" ? "stable"
                                    : profile === "beta" ? "nightly" : profile;
                                navigate(`/s2/${channel}`, { state: { activeTab: "matches" } });
                            } else if (tag === "mod") {
                                const modTask = currentTask as ModDownloadTask;
                                navigate(`/mods/${modTask.modSlug}`);
                            }
                        }}
                    >
                        {currentTask?.getQueueEntry(true)}
                    </div>
                    <button
                        className={styles.cancel_button}
                        onClick={() => cancelTask(currentTask)}
                        title={t("cancel_download", { ns: "mods" })}
                    >
                        {t("cancel")}
                    </button>
                </div>
                <div className={styles.progress_container}>
                    <div className={styles.progress_info}>
                        <PayloadProgress payload={payload} fullMode />
                    </div>
                    <Progress.Root className={styles.progress_bar_root} value={progressValue}>
                        <Progress.Indicator
                            className={`${styles.progress_bar_indicator} ${isIndeterminate ? styles.progress_bar_indeterminate : ""}`}
                            style={progressWidth ? { width: progressWidth } : undefined}
                        />
                    </Progress.Root>
                </div>
            </div>
        )}

        <div className={styles.content}>
            {queue.size > 1 && (
                <QueueSection icon={<QueueListIcon />} title={t("queued_actions")}>
                    {Array.from(queue).splice(1).map(downloader =>
                        <div key={downloader.taskUUID}>
                            {downloader.getQueueEntry(false, () => cancelTask(downloader))}
                        </div>
                    )}
                </QueueSection>
            )}
            <QueueSection
                icon={<TimeIcon />}
                title={t("history")}
                rightContent={historyEntries.length > 0
                    ? intlFormatDistance(new Date(historyEntries[0].timestamp), new Date())
                    : undefined
                }
            >
                {historyEntries.length > 0 ? <>
                    {historyEntries.map(entry =>
                        <HistoryEntryComponent key={entry.id} entry={entry} />
                    )}
                    <button className={styles.clear_history} onClick={clearHistory}>
                        {t("clear_history")}
                    </button>
                </> :
                    <div className={styles.empty_queue}>{t("no_download_history")}</div>
                }
            </QueueSection>
        </div>
    </div>;
}

export default Queue;