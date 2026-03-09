import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";
import i18n from "@app/i18n";

export class TryCloseDialog extends BaseDialog<Record<string, never>> {
    constructor(props: Record<string, unknown>) {
        super(props);
    }

    getIcon() {
        return <WarningIcon />;
    }

    getIconClass() {
        return baseStyles.warning;
    }

    getInnerContents() {
        return <>
            <p>
                {i18n.t("cannot_close_body", { ns: "dialogs" })}
                <strong> {i18n.t("cannot_close_warning", { ns: "dialogs" })}</strong>
            </p>
        </>;
    }

    getTitle() {
        return <>{i18n.t("cannot_close_title", { ns: "dialogs" })}</>;
    }

    getButtons() {
        return <>
            <Button color={ButtonColor.GREEN} onClick={() => closeDialog()}>{i18n.t("dont_close", { ns: "dialogs" })}</Button>
            <Button color={ButtonColor.YELLOW} onClick={() => closeDialog("close")}>
                <strong>{i18n.t("force_close", { ns: "dialogs" })}</strong>
            </Button>
        </>;
    }
}