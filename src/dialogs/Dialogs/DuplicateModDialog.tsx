import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { InformationIcon } from "@app/assets/Icons";

export class DuplicateModDialog extends BaseDialog<Record<string, never>> {
    constructor(props: Record<string, unknown>) {
        super(props);
    }

    getIcon() {
        return <InformationIcon />;
    }

    getIconClass() {
        return baseStyles.warning;
    }

    getTitle() {
        return <>Already Installed</>;
    }

    getInnerContents() {
        const modName = this.props.modName as string;
        const existingModName = this.props.existingModName as string;

        return (
            <div style={{ textAlign: "center" }}>
                <p>
                    <strong>{modName}</strong> was not installed because identical files are already present in the local mod <strong>{existingModName}</strong>.
                </p>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    If you still want to install this mod, remove the local mod first.
                </p>
            </div>
        );
    }

    getButtons() {
        return (
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>
                OK
            </Button>
        );
    }
}
