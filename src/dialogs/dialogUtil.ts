import { invoke } from "@tauri-apps/api";
import { InstallFolderDialog } from "./Dialogs/InstallFolderDialog";
import { ErrorDialog } from "./Dialogs/ErrorDialog";
import { UninstallDialog } from "./Dialogs/UninstallDialog";
import { UnknownModDialog } from "./Dialogs/UnknownModDialog";
import { DeleteModDialog } from "./Dialogs/DeleteModDialog";
import { FileConflictDialog } from "./Dialogs/FileConflictDialog";
import { DuplicateModDialog } from "./Dialogs/DuplicateModDialog";
import { createAndShowDialog } from ".";
import type { UnknownModFile } from "@app/types/mods";

export async function showInstallFolderDialog() {
    if (!await invoke("is_initialized")) {
        const dialogOutput = await createAndShowDialog(InstallFolderDialog);

        if (dialogOutput === "cancel") {
            return false;
        } else {
            try {
                await invoke("set_download_location", {
                    path: dialogOutput
                });
            } catch {
                return false;
            }
        }
    }

    return true;
}

export async function showErrorDialog(error: string) {
    await createAndShowDialog(ErrorDialog, { error: error });
}

export async function showUninstallDialog(appName: string): Promise<boolean> {
    const result = await createAndShowDialog(UninstallDialog, { appName });
    return result === "confirm";
}

export interface UnknownModDecision {
    modNames: Record<string, string>;
    actions: Record<string, "register" | "ignore">;
}

export async function showUnknownModDialog(
    unknownFiles: UnknownModFile[],
): Promise<UnknownModDecision | null> {
    const result = await createAndShowDialog(UnknownModDialog, { unknownFiles });
    if (!result || result === "cancel") return null;
    try {
        return JSON.parse(result) as UnknownModDecision;
    } catch {
        return null;
    }
}

export type DeleteModResult = "delete-files" | "remove-only" | null;

export async function showDeleteModDialog(
    modName: string,
    fileCount: number,
): Promise<DeleteModResult> {
    const result = await createAndShowDialog(DeleteModDialog, { modName, fileCount });
    if (result === "delete-files" || result === "remove-only") return result;
    return null;
}

export async function showFileConflictDialog(files: string[]): Promise<void> {
    await createAndShowDialog(FileConflictDialog, { files });
}

export async function showDuplicateModDialog(modName: string, existingModName: string): Promise<void> {
    await createAndShowDialog(DuplicateModDialog, { modName, existingModName });
}