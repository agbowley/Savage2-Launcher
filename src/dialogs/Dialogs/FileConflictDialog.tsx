import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";
import i18n from "@app/i18n";

export class FileConflictDialog extends BaseDialog<Record<string, never>> {
    constructor(props: Record<string, unknown>) {
        super(props);
    }

    getIcon() {
        return <WarningIcon />;
    }

    getIconClass() {
        return baseStyles.warning;
    }

    getTitle() {
        return <>{i18n.t("file_conflict_title", { ns: "dialogs" })}</>;
    }

    getInnerContents() {
        const files = (this.props.files ?? []) as string[];

        return (
            <div style={{ textAlign: "center" }}>
                <p>
                    {files.length !== 1
                        ? i18n.t("file_conflict_files_plural", { ns: "dialogs" })
                        : i18n.t("file_conflict_files_singular", { ns: "dialogs" })}
                </p>
                <div style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    margin: "8px 0",
                    maxHeight: 120,
                    overflowY: "auto",
                    textAlign: "left",
                }}>
                    {files.map((f) => (
                        <div key={f} style={{
                            fontFamily: "monospace",
                            fontSize: 12,
                            color: "rgba(255,255,255,0.7)",
                            padding: "2px 0",
                        }}>
                            {f}
                        </div>
                    ))}
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                    {files.length !== 1
                        ? i18n.t("file_conflict_hint_plural", { ns: "dialogs" })
                        : i18n.t("file_conflict_hint_singular", { ns: "dialogs" })}
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
