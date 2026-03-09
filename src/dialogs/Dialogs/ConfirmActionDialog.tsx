import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";
import i18n from "@app/i18n";

export class ConfirmActionDialog extends BaseDialog<Record<string, never>> {
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
            <p>{this.props.message as string}</p>
        </>;
    }

    getTitle() {
        return <>{this.props.title as string}</>;
    }

    getButtons() {
        const confirmLabel = (this.props.confirmLabel as string) || i18n.t("confirm", { ns: "common" });
        const confirmColor = (this.props.confirmColor as ButtonColor) || ButtonColor.RED;
        return <>
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>{i18n.t("cancel", { ns: "common" })}</Button>
            <Button color={confirmColor} onClick={() => closeDialog("confirm")}>{confirmLabel}</Button>
        </>;
    }
}
