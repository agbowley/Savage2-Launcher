import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { InformationIcon } from "@app/assets/Icons";
import i18n from "@app/i18n";

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
        return <>{i18n.t("already_installed_title", { ns: "dialogs" })}</>;
    }

    getInnerContents() {
        const modName = this.props.modName as string;
        const existingModName = this.props.existingModName as string;

        return (
            <div style={{ textAlign: "center" }}>
                <p dangerouslySetInnerHTML={{ __html: i18n.t("already_installed_body", { ns: "dialogs", modName, existingModName }) }} />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    {i18n.t("already_installed_hint", { ns: "dialogs" })}
                </p>
            </div>
        );
    }

    getButtons() {
        return (
            <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>
                {i18n.t("ok", { ns: "common" })}
            </Button>
        );
    }
}
