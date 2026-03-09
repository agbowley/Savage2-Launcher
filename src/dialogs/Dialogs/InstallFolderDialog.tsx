import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import { open } from "@tauri-apps/api/dialog";
import styles from "./InstallFolderDialog.module.css";
import { DriveIcon, WarningIcon } from "@app/assets/Icons";
import { invoke } from "@tauri-apps/api";
import { closeDialog } from "..";
import i18n from "@app/i18n";

interface State {
    path?: string;
    empty: boolean;
}

export class InstallFolderDialog extends BaseDialog<State> {
    constructor(props: Record<string, unknown>) {
        super(props);
        this.state = {
            path: undefined,
            empty: true
        };

        // Load the default path
        (async () => {
            const path = await invoke("get_download_location") as string;
            this.setState(() => ({
                path: path,
                empty: true
            }));
        })();
    }

    getInnerContents() {
        return <>
            <p>
                {i18n.t("install_folder_body", { ns: "dialogs" })}
            </p>
            <div className={styles.folder_container} onClick={() => this.askForFolder()}>
                <div className={styles.folder_info}>
                    <DriveIcon />
                    {typeof this.state.path === "string" ? this.state.path : i18n.t("loading")}
                </div>
                <div className={styles.folder_extra}>

                </div>
            </div>
            {!this.state.empty ?
                <div className={styles.warning_box}>
                    <WarningIcon /> {i18n.t("folder_not_empty", { ns: "dialogs" })}
                </div>
                : ""
            }
        </>;
    }

    private async askForFolder() {
        const select = await open({
            directory: true
        });

        if (typeof select === "string") {
            const path: string = select;
            const empty: boolean = await invoke("is_dir_empty", { path: path });

            this.setState(() => ({
                path: path,
                empty: empty
            }));
        }
    }

    getTitle() {
        return <>{i18n.t("install_folder_title", { ns: "dialogs" })}</>;
    }

    getIcon() {
        return <DriveIcon />;
    }

    getIconClass() {
        return "";
    }

    getButtons() {
        return <>
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog("cancel")}>{i18n.t("cancel", { ns: "common" })}</Button>
            <Button color={ButtonColor.GREEN} onClick={() => {
                if (!this.state.empty) {
                    return;
                }

                closeDialog(this.state.path);
            }}>{i18n.t("okay", { ns: "dialogs" })}</Button>
        </>;
    }
}