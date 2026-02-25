import styles from "./Queue.module.css";
import QueueSection from "@app/components/Queue/QueueSection";
import PayloadProgress from "@app/components/PayloadProgress";
import HistoryEntryComponent from "@app/components/Queue/HistoryEntry";
import * as Progress from "@radix-ui/react-progress";
import { useState } from "react";
import { QueueIcon, QueueListIcon, TimeIcon } from "@app/assets/Icons";
import QueueStore from "@app/tasks/queue";
import { usePayload } from "@app/tasks/payload";
import { useCurrentTask, cancelTask } from "@app/tasks";
import { useDownloadHistory } from "@app/stores/DownloadHistoryStore";
import { intlFormatDistance } from "date-fns";
import { useNavigate } from "react-router-dom";

function Queue() {
    const [lastWasEmpty, setLastWasEmpty] = useState(false);
    const navigate = useNavigate();

    const queue = QueueStore.useQueue();
    const currentTask = useCurrentTask();
    const payload = usePayload(currentTask?.taskUUID);
    const { entries: historyEntries, clearHistory } = useDownloadHistory();

    function getProgressValue() {
        if (payload?.state === "downloading") {
            return payload.current / payload.total * 100.0;
        } else {
            return null;
        }
    }

    const progressValue = getProgressValue();
    const isIndeterminate = currentTask != null && progressValue === null;

    function getBanner() {
        if (currentTask) {
            if (lastWasEmpty) {
                setLastWasEmpty(false);
            }

            return <div className={styles.banner}>
                <div className={styles.banner_header}>
                    <div
                        className={styles.banner_entry_link}
                        onClick={() => {
                            const tag = currentTask.taskTag;
                            const profile = currentTask.profile;
                            if (tag === "Savage 2") {
                                navigate(`/s2/${profile}`);
                            }
                        }}
                    >
                        {currentTask?.getQueueEntry(true)}
                    </div>
                    <button
                        className={styles.cancel_button}
                        onClick={() => cancelTask(currentTask)}
                        title="Cancel download"
                    >
                        Cancel
                    </button>
                </div>
                <div className={styles.progress_container}>
                    <div className={styles.progress_info}>
                        <PayloadProgress payload={payload} fullMode />
                    </div>
                    <Progress.Root className={styles.progress_bar_root} value={progressValue}>
                        <Progress.Indicator
                            className={`${styles.progress_bar_indicator} ${isIndeterminate ? styles.progress_bar_indeterminate : ""}`}
                            style={progressValue !== null ? { width: `${progressValue}%` } : undefined}
                        />
                    </Progress.Root>
                </div>
            </div>;
        } else {
            // Make sure to update the start time when it becomes empty
            if (!lastWasEmpty) {
                setLastWasEmpty(true);
            }

            return <div className={styles.empty_banner}>
                <h1 className={styles.empty_banner_header}>
                    <QueueIcon /> DOWNLOADS
                </h1>
            </div>;
        }
    }

    return <>
        {getBanner()}
        <div className={styles.main}>
            {queue.size > 1 && (
                <QueueSection icon={<QueueListIcon />} title="QUEUED ACTIONS">
                    {Array.from(queue).splice(1).map(downloader =>
                        downloader.getQueueEntry(false, () => cancelTask(downloader))
                    )}
                </QueueSection>
            )}
            <QueueSection
                icon={<TimeIcon />}
                title="HISTORY"
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
                        Clear History
                    </button>
                </> :
                    <div className={styles.empty_queue}>No download history yet.</div>
                }
            </QueueSection>
        </div>
    </>;
}

export default Queue;