import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import { closeDialog } from "..";
import i18n from "@app/i18n";

interface State {
    content: string;
    originalContent: string;
}

export class XmlEditorDialog extends BaseDialog<State> {
    constructor(props: Record<string, unknown>) {
        super(props);
        const content = (props.content ?? "") as string;
        this.state = {
            content,
            originalContent: content,
        };
    }

    getTitle() {
        const filename = (this.props.filename ?? "file") as string;
        return (
            <span style={{ fontSize: 16 }} dangerouslySetInnerHTML={{ __html: i18n.t("edit_filename", { ns: "dialogs", filename }) }} />
        );
    }

    getInnerContents() {
        const hasChanges = this.state.content !== this.state.originalContent;

        return (
            <div style={{ width: "80vw", maxWidth: 660, textAlign: "left" }}>
                <textarea
                    value={this.state.content}
                    onChange={(e) => this.setState({ content: e.target.value })}
                    spellCheck={false}
                    style={{
                        width: "100%",
                        boxSizing: "border-box" as const,
                        minHeight: 340,
                        maxHeight: "55vh",
                        resize: "vertical",
                        fontFamily: "'Consolas', 'Courier New', monospace",
                        fontSize: 12,
                        lineHeight: 1.5,
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        background: "rgba(0, 0, 0, 0.4)",
                        color: "rgba(255, 255, 255, 0.85)",
                        outline: "none",
                        tabSize: 4,
                    }}
                    onFocus={(e) => {
                        e.target.style.borderColor = "rgba(100, 160, 255, 0.4)";
                    }}
                    onBlur={(e) => {
                        e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                    }}
                    onKeyDown={(e) => {
                        // Allow Tab key for indentation
                        if (e.key === "Tab") {
                            e.preventDefault();
                            const target = e.target as HTMLTextAreaElement;
                            const start = target.selectionStart;
                            const end = target.selectionEnd;
                            const newContent =
                                this.state.content.substring(0, start) +
                                "\t" +
                                this.state.content.substring(end);
                            this.setState({ content: newContent }, () => {
                                target.selectionStart = target.selectionEnd = start + 1;
                            });
                        }
                        // Ctrl+S to save
                        if (e.key === "s" && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            if (hasChanges) {
                                closeDialog(this.state.content);
                            }
                        }
                    }}
                />
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 6,
                        fontSize: 11,
                        color: "rgba(255, 255, 255, 0.3)",
                    }}
                >
                    <span>
                        {hasChanges ? (
                            <span style={{ color: "#FFB800" }}>{i18n.t("unsaved_changes", { ns: "common" })}</span>
                        ) : (
                            i18n.t("no_changes", { ns: "common" })
                        )}
                    </span>
                    <span>{i18n.t("ctrl_s_save", { ns: "common" })}</span>
                </div>
            </div>
        );
    }

    getButtons() {
        const hasChanges = this.state.content !== this.state.originalContent;

        return (
            <>
                <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>
                    {i18n.t("cancel", { ns: "common" })}
                </Button>
                <Button
                    color={hasChanges ? ButtonColor.GREEN : ButtonColor.GRAY}
                    onClick={() => { if (hasChanges) closeDialog(this.state.content); }}
                    disabled={!hasChanges}
                >
                    {i18n.t("save", { ns: "common" })}
                </Button>
            </>
        );
    }
}
