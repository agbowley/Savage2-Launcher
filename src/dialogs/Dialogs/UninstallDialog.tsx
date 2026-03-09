import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";
import i18n from "@app/i18n";

export class UninstallDialog extends BaseDialog<Record<string, never>> {
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
                {i18n.t("confirm_uninstall_body", { ns: "dialogs", appName: this.props.appName as string })}
            </p>
        </>;
    }

    getTitle() {
        return <>{i18n.t("confirm_uninstall_title", { ns: "dialogs" })}</>;
    }

    getButtons() {
        return <>
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>{i18n.t("cancel", { ns: "common" })}</Button>
            <Button color={ButtonColor.RED} onClick={() => closeDialog("confirm")}>{i18n.t("uninstall", { ns: "launch" })}</Button>
        </>;
    }
}
