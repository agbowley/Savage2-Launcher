import styles from "./Queue.module.css";
import QueueSection from "@app/components/Queue/QueueSection";
import PayloadProgress from "@app/components/PayloadProgress";
import * as Progress from "@radix-ui/react-progress";
import { useState } from "react";
import { QueueListIcon } from "@app/assets/Icons";
import QueueStore from "@app/tasks/queue";
import { usePayload } from "@app/tasks/payload";
import { useCurrentTask, cancelTask } from "@app/tasks";

function Queue() {
    const [lastWasEmpty, setLastWasEmpty] = useState(false);

    const queue = QueueStore.useQueue();
    const currentTask = useCurrentTask();
    const payload = usePayload(currentTask?.taskUUID);

    function getProgressValue() {
        if (payload?.state === "downloading") {
            return payload.current / payload.total * 100.0;
        } else {
            return 100;
        }
    }

    function getBanner() {
        if (currentTask) {
            if (lastWasEmpty) {
                setLastWasEmpty(false);
            }

            return <div className={styles.banner}>
                <div className={styles.banner_header}>
                    {currentTask?.getQueueEntry(true)}
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
                    <Progress.Root className={styles.progress_bar_root} value={getProgressValue()}>
                        <Progress.Indicator
                            className={styles.progress_bar_indicator}
                            style={{ width: `${getProgressValue()}%` }}
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
                    DOWNLOADS
                </h1>
            </div>;
        }
    }

    return <>
        {getBanner()}
        <div className={styles.main}>
            <QueueSection icon={<QueueListIcon />} title="QUEUE">
                {
                    queue.size > 1 ?
                        Array.from(queue).splice(1).map(downloader =>
                            downloader.getQueueEntry(false, () => cancelTask(downloader))
                        ) :
                        <div className={styles.empty_queue}>There are no downloads in the queue.</div>
                }
            </QueueSection>
        </div>
    </>;
}

export default Queue;