import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import { closeDialog } from "..";

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
            <span style={{ fontSize: 16 }}>
                Edit <code style={{ color: "#64a0ff", fontSize: 14 }}>{filename}</code>
            </span>
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
                            <span style={{ color: "#FFB800" }}>Unsaved changes</span>
                        ) : (
                            "No changes"
                        )}
                    </span>
                    <span>Ctrl+S to save</span>
                </div>
            </div>
        );
    }

    getButtons() {
        const hasChanges = this.state.content !== this.state.originalContent;

        return (
            <>
                <Button color={ButtonColor.GRAY} onClick={() => closeDialog()}>
                    Cancel
                </Button>
                <Button
                    color={hasChanges ? ButtonColor.GREEN : ButtonColor.GRAY}
                    onClick={() => { if (hasChanges) closeDialog(this.state.content); }}
                    disabled={!hasChanges}
                >
                    Save
                </Button>
            </>
        );
    }
}
