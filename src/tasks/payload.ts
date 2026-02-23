import { createStore } from "zustand/vanilla";
import { IBaseTask } from "./Processors/base";
import QueueStore from "./queue";
import { listen } from "@tauri-apps/api/event";
import { throttle } from "lodash";
import { useStore } from "zustand";

export type TaskState = "downloading" | "installing" | "verifying" | "checking" | "waiting";

export interface TaskPayload {
    state: TaskState;
    current: number;
    total: number;
    /** Bytes per second (smoothed). Only meaningful when state === "downloading". */
    speed: number;
}

interface TaskPayloadStore {
    [key: string]: TaskPayload,
}

const store = createStore<TaskPayloadStore>(() => ({}));

/** Per-task speed tracking state (not stored in zustand — internal bookkeeping). */
interface SpeedSample {
    bytes: number;
    time: number; // performance.now()
}
const speedState = new Map<string, { samples: SpeedSample[]; lastSpeed: number }>();

const SPEED_WINDOW_MS = 3000; // rolling 3-second window for smoothing

/** Compute a smoothed download speed from recent samples. */
function computeSpeed(uuid: string, currentBytes: number): number {
    const now = performance.now();
    let state = speedState.get(uuid);
    if (!state) {
        state = { samples: [], lastSpeed: 0 };
        speedState.set(uuid, state);
    }

    state.samples.push({ bytes: currentBytes, time: now });

    // Prune samples outside the window
    const cutoff = now - SPEED_WINDOW_MS;
    state.samples = state.samples.filter(s => s.time >= cutoff);

    if (state.samples.length < 2) {
        return state.lastSpeed; // not enough data yet
    }

    const oldest = state.samples[0];
    const newest = state.samples[state.samples.length - 1];
    const elapsed = (newest.time - oldest.time) / 1000; // seconds
    if (elapsed <= 0) return state.lastSpeed;

    const speed = (newest.bytes - oldest.bytes) / elapsed;
    state.lastSpeed = speed;
    return speed;
}

const createPayload = (task: IBaseTask) => {
    const initialPayload: TaskPayload = {
        state: "waiting",
        current: 0,
        total: 0,
        speed: 0,
    };

    // Reset speed tracking for this task
    speedState.delete(task.taskUUID);

    setPayload(task, initialPayload);
};

const setPayload = (task: IBaseTask, payload: TaskPayload) => {
    const uuid = task.taskUUID;
    return store.setState({ [uuid]: { ...payload } });
};

const removePayload = (task: IBaseTask) => {
    const uuid = task.taskUUID;
    speedState.delete(uuid);
    return store.setState({ [uuid]: undefined });
};

const usePayload = (uuid?: string) => {
    return useStore(
        store,
        store => uuid ? store[uuid] : undefined
    );
};

const calculatePayloadPercentage = (payload?: TaskPayload): number | undefined => {
    if (!payload) return undefined;

    return payload.total > 0 ? (payload.current / payload.total) * 100 : undefined;
};

export { store, createPayload, updatePayload, removePayload, usePayload, calculatePayloadPercentage };

const throttleTime = 25;

listen("progress_info",
    throttle(
        ({ payload }: { payload: TaskPayload }) => {
            updatePayload(payload);
        }, throttleTime
    )
);

const updatePayload = (payload: TaskPayload) => {
    const current = QueueStore.firstTask();
    if(!current) return console.warn("Received a payload but no current task is loaded.");

    const speed = payload.state === "downloading"
        ? computeSpeed(current.taskUUID, payload.current)
        : 0;

    return setPayload(current, { ...payload, speed });
};