import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";

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
        return <>File Conflict</>;
    }

    getInnerContents() {
        const files = (this.props.files ?? []) as string[];

        return (
            <div style={{ textAlign: "center" }}>
                <p>
                    The following file{files.length !== 1 ? "s were" : " was"} overwritten in the game folder:
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
                    Another mod may have been using {files.length !== 1 ? "these files" : "this file"}.
                    If you experience issues, try disabling conflicting mods.
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
