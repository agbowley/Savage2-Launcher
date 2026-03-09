import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import styles from "./ErrorDialog.module.css";
import { error as LogError } from "tauri-plugin-log-api";
import { serializeError } from "serialize-error";
import { closeDialog } from "..";
import { ErrorIcon } from "@app/assets/Icons";
import i18n from "@app/i18n";

export class ErrorDialog extends BaseDialog<Record<string, never>> {
    constructor(props: Record<string, unknown>) {
        super(props);
        
        try {
            LogError(
                JSON.stringify(serializeError(props.error))
            );
        } catch (e) {
            console.error(e);
        }
    }

    getIcon() {
        return <ErrorIcon />;
    }

    getIconClass() {
        return baseStyles.error;
    }

    getInnerContents() {
        const error = this.props.error;
        let message: string;
        if (error instanceof Error) {
            message = error.message;
        } else if (typeof error === "string") {
            message = error;
        } else {
            message = JSON.stringify(serializeError(error));
        }

        return <>
            <p>
                {i18n.t("error_body", { ns: "dialogs" })}
            </p>
            <div className={styles.stacktrace}>
                {message}
            </div>
        </>;
    }

    getTitle() {
        return <>{i18n.t("error_title", { ns: "dialogs" })}</>;
    }

    getButtons() {
        return <>
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>{i18n.t("okay", { ns: "dialogs" })}</Button>
        </>;
    }
}