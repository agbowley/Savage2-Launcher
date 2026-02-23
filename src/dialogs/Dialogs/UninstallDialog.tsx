import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";

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
                Are you sure you want to uninstall <strong>{this.props.appName as string}</strong>?
                This will remove all game files. Your mods and user configuration settings will be preserved.
            </p>
        </>;
    }

    getTitle() {
        return <>Confirm Uninstall</>;
    }

    getButtons() {
        return <>
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>Cancel</Button>
            <Button color={ButtonColor.RED} onClick={() => closeDialog("confirm")}>Uninstall</Button>
        </>;
    }
}
