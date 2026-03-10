import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";
import i18n from "@app/i18n";

interface State {
    deleteFiles: boolean;
}

export class DeleteModDialog extends BaseDialog<State> {
    constructor(props: Record<string, unknown>) {
        super(props);
        this.state = { deleteFiles: false };
    }

    getIcon() {
        return <WarningIcon />;
    }

    getIconClass() {
        return baseStyles.warning;
    }

    getTitle() {
        return <>{i18n.t("remove_mod_title", { ns: "dialogs" })}</>;
    }

    getInnerContents() {
        const modName = (this.props.modName ?? "this mod") as string;
        const fileCount = (this.props.fileCount ?? 0) as number;

        return (
            <div style={{ textAlign: "center" }}>
                <p dangerouslySetInnerHTML={{ __html: i18n.t("remove_mod_confirm", { ns: "dialogs", modName }) }} />
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    {i18n.t("remove_mod_hint", { ns: "dialogs" })}
                </p>
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        marginTop: 12,
                        cursor: "pointer",
                        color: this.state.deleteFiles ? "#F32B37" : "rgba(255,255,255,0.7)",
                        fontSize: 13,
                        transition: "color 0.15s",
                    }}
                >
                    <input
                        type="checkbox"
                        checked={this.state.deleteFiles}
                        onChange={(e) => this.setState({ deleteFiles: e.target.checked })}
                    />
                    {i18n.t("delete_files_checkbox", { ns: "dialogs", fileCount })}
                </label>
            </div>
        );
    }

    getButtons() {
        return (
            <>
                <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>
                    {i18n.t("cancel", { ns: "common" })}
                </Button>
                <Button
                    color={ButtonColor.RED}
                    onClick={() => closeDialog(this.state.deleteFiles ? "delete-files" : "remove-only")}
                >
                    {i18n.t("remove", { ns: "common" })}
                </Button>
            </>
        );
    }
}
