import { v4 as generateUUID } from "uuid";

export type TaskTag = "Savage 2" | "setlist";

export interface IBaseTask {
    startedAt?: Date,
    taskUUID: string,
    taskTag: TaskTag,
    profile: string,

    onFinish?: () => void;
    onError?: (error: string) => void;
    onCancel?: () => void;

    start(): Promise<void>;
    getQueueEntry(bannerMode: boolean, onRemove?: () => void): React.ReactNode;
}

export class BaseTask {
    taskUUID: string;
    taskTag: TaskTag;
    profile: string;

    constructor(taskTag: TaskTag, profile: string) {
        this.taskUUID = generateUUID();
        this.taskTag = taskTag;
        this.profile = profile;
    }
}