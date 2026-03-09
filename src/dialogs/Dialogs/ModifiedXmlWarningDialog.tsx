import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";
import i18n from "@app/i18n";

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
            <p dangerouslySetInnerHTML={{ __html: i18n.t(
                fileNames.length === 1 ? "modified_files_body_one" : "modified_files_body",
                { ns: "dialogs", modName }
            ) }} />
            <ul style={{ textAlign: "left", margin: "8px 0", paddingLeft: 24 }}>
                {fileNames.map((f) => (
                    <li key={f} style={{ fontFamily: "monospace", fontSize: "0.9em" }}>{f}</li>
                ))}
            </ul>
            <p>{i18n.t("modified_files_confirm", { ns: "dialogs" })}</p>
        </>;
    }

    getTitle() {
        return <>{i18n.t("modified_files_title", { ns: "dialogs" })}</>;
    }

    getButtons() {
        return <>
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>{i18n.t("cancel", { ns: "common" })}</Button>
            <Button color={ButtonColor.RED} onClick={() => closeDialog("confirm")}>{i18n.t("remove_anyway", { ns: "dialogs" })}</Button>
        </>;
    }
}
