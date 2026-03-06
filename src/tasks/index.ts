import { useStore } from "zustand";
import { IBaseTask, TaskTag } from "./Processors/base";
import QueueStore from "./queue";
import { showErrorDialog } from "@app/dialogs/dialogUtil";
import { invoke } from "@tauri-apps/api/tauri";
import { createPayload, removePayload } from "./payload";

const CANCELLED = "CANCELLED";

const addTask = (task: IBaseTask) => {
    QueueStore.add(task);

    if(QueueStore.firstTask() === task) {
        processNextTask();
    }
};

/**
 * Cancel a specific task. If it's the currently active (first) task, signal
 * the Rust backend to abort the download. If it's only queued (not yet started),
 * just remove it from the queue and fire its onCancel callback.
 */
const cancelTask = async (task: IBaseTask) => {
    const activeTask = QueueStore.firstTask();

    if (task === activeTask) {
        // This is the currently running task — signal the backend to cancel
        try {
            await invoke("cancel_task");
        } catch (e) {
            console.error("Failed to signal cancel:", e);
        }
        // The download loop will return "CANCELLED" which processNextTask handles
    } else {
        // This task is just queued, not running yet — remove it directly
        removePayload(task);
        QueueStore.remove(task);
        task.onCancel?.();
    }
};

const processNextTask = async () => {
    const next = QueueStore.next();
    if(!next) return;

    try {
        next.startedAt = new Date();
        createPayload(next);
        await next.start();
        removePayload(next);
        next.onFinish?.();
    } catch (e) {
        const errorStr = e as string;
        if (errorStr === CANCELLED) {
            // Clean up and call onCancel instead of showing an error
            removePayload(next);
            next.onCancel?.();
        } else {
            next.onError?.(errorStr);
            showErrorDialog(errorStr);
            console.error(e);
        }
    }

    processNextTask();
};

const useTask = (tag: TaskTag, profile: string) => {
    return useStore(
        QueueStore.store,
        queue => QueueStore.findTask(queue, tag, profile)
    );
};

const useCurrentTask = () => {
    return useStore(
        QueueStore.store,
        () => QueueStore.firstTask()
    );
};

export { addTask, cancelTask, processNextTask, useTask, useCurrentTask };
