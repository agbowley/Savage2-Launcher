import { invoke } from "@tauri-apps/api";
import { InstallFolderDialog } from "./Dialogs/InstallFolderDialog";
import { ErrorDialog } from "./Dialogs/ErrorDialog";
import { UninstallDialog } from "./Dialogs/UninstallDialog";
import { UnknownModDialog } from "./Dialogs/UnknownModDialog";
import { DeleteModDialog } from "./Dialogs/DeleteModDialog";
import { FileConflictDialog } from "./Dialogs/FileConflictDialog";
import { DuplicateModDialog } from "./Dialogs/DuplicateModDialog";
import { XmlEditorDialog } from "./Dialogs/XmlEditorDialog";
import { ModifiedXmlWarningDialog } from "./Dialogs/ModifiedXmlWarningDialog";
import { LoginDialog } from "./Dialogs/LoginDialog";
import { RegisterDialog } from "./Dialogs/RegisterDialog";
import { ConfirmActionDialog } from "./Dialogs/ConfirmActionDialog";
import { GoldHistoryDialog } from "./Dialogs/GoldHistoryDialog";
import { OutdatedModsDialog } from "./Dialogs/OutdatedModsDialog";
import type { OutdatedModEntry } from "./Dialogs/OutdatedModsDialog";
import { createAndShowDialog } from ".";
import type { UnknownModFile } from "@app/types/mods";
import { ButtonColor } from "@app/components/Button";

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

export async function showErrorDialog(error: unknown) {
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

/** Open the XML editor dialog. Returns the edited content on save, or null on cancel. */
export async function showXmlEditorDialog(
    filename: string,
    content: string,
): Promise<string | null> {
    const result = await createAndShowDialog(XmlEditorDialog, { filename, content, wide: true });
    if (result === undefined || result === "") return null;
    return result;
}

/** Show a warning when uninstalling a mod with user-modified XML files. Returns true if user confirms. */
export async function showModifiedXmlWarning(
    modName: string,
    fileNames: string[],
): Promise<boolean> {
    const result = await createAndShowDialog(ModifiedXmlWarningDialog, { modName, fileNames });
    return result === "confirm";
}

export async function showConfirmAction(
    title: string,
    message: string,
    confirmLabel?: string,
    confirmColor?: ButtonColor,
): Promise<boolean> {
    const result = await createAndShowDialog(ConfirmActionDialog, { title, message, confirmLabel, confirmColor });
    return result === "confirm";
}

export async function showGoldHistory(): Promise<void> {
    await createAndShowDialog(GoldHistoryDialog, { wide: true });
}

export async function showLoginDialog(): Promise<void> {
    const result = await createAndShowDialog(LoginDialog);
    // If user clicked "Create account", open register dialog
    if (result === "register") {
        await showRegisterDialog();
    }
}

export async function showRegisterDialog(): Promise<void> {
    const result = await createAndShowDialog(RegisterDialog);
    // If user clicked "Sign in" from register, open login dialog
    if (result === "login") {
        await showLoginDialog();
    }
}

export interface OutdatedModsResult {
    action: "cancel" | "play";
    dontShowAgain: boolean;
}

export async function showOutdatedModsDialog(
    outdatedMods: OutdatedModEntry[],
    profile: string,
    channel: string,
): Promise<OutdatedModsResult | null> {
    const result = await createAndShowDialog(OutdatedModsDialog, {
        outdatedMods,
        profile,
        channel,
        wide: true,
    });
    if (!result || result === "cancel") return { action: "cancel", dontShowAgain: false };
    try {
        return JSON.parse(result) as OutdatedModsResult;
    } catch {
        return null;
    }
}