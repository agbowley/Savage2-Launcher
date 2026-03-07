import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";

export class ModifiedXmlWarningDialog extends BaseDialog<Record<string, never>> {
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
        const modName = this.props.modName as string;
        const fileNames = this.props.fileNames as string[];

        return <>
            <p>
                You have modified XML settings in <strong>{modName}</strong>.
                Removing this mod will lose your custom settings for the following {fileNames.length === 1 ? "file" : "files"}:
            </p>
            <ul style={{ textAlign: "left", margin: "8px 0", paddingLeft: 24 }}>
                {fileNames.map((f) => (
                    <li key={f} style={{ fontFamily: "monospace", fontSize: "0.9em" }}>{f}</li>
                ))}
            </ul>
            <p>Are you sure you want to continue?</p>
        </>;
    }

    getTitle() {
        return <>Modified Files Warning</>;
    }

    getButtons() {
        return <>
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>Cancel</Button>
            <Button color={ButtonColor.RED} onClick={() => closeDialog("confirm")}>Remove Anyway</Button>
        </>;
    }
}
