import Button, { ButtonColor } from "@app/components/Button";
import { BaseDialog } from "./BaseDialog";
import baseStyles from "./BaseDialog.module.css";
import { closeDialog } from "..";
import { WarningIcon } from "@app/assets/Icons";
import type { UnknownModFile } from "@app/types/mods";
import i18n from "@app/i18n";

interface State {
    /** Map of filename → user-provided mod name (empty string = will ignore) */
    modNames: Record<string, string>;
    /** Which files the user wants to register vs ignore */
    actions: Record<string, "register" | "ignore">;
}

export class UnknownModDialog extends BaseDialog<State> {
    constructor(props: Record<string, unknown>) {
        super(props);

        const files = (props.unknownFiles ?? []) as UnknownModFile[];
        const modNames: Record<string, string> = {};
        const actions: Record<string, "register" | "ignore"> = {};

        for (const f of files) {
            // Default name from filename: "resourcesFoo.s2z" → "Foo"
            const stem = f.filename.replace(/\.s2z$/i, "");
            const cleanName = stem.replace(/^resources/i, "").replace(/-\d+$/, "") || stem;
            modNames[f.filename] = cleanName;
            actions[f.filename] = "register";
        }

        this.state = { modNames, actions };
    }

    getIcon() {
        return <WarningIcon />;
    }

    getIconClass() {
        return baseStyles.warning;
    }

    getTitle() {
        return <>{i18n.t("unknown_mods_title", { ns: "dialogs" })}</>;
    }

    getInnerContents() {
        const files = (this.props.unknownFiles ?? []) as UnknownModFile[];

        return (
            <div style={{ textAlign: "left", width: "100%" }}>
                <p style={{ textAlign: "center", marginBottom: 12 }}>
                    {i18n.t("unknown_mods_body", { ns: "dialogs" })}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 300, overflowY: "auto" }}>
                    {files.map((f) => (
                        <div
                            key={f.filename}
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                                padding: "8px 10px",
                                borderRadius: 6,
                                background: "rgba(255,255,255,0.04)",
                                border: "1px solid rgba(255,255,255,0.06)",
                            }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#fff" }}>
                                    {f.filename}
                                </span>
                                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                                    {(f.size / 1024).toFixed(0)} KB
                                </span>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <select
                                    value={this.state.actions[f.filename]}
                                    onChange={(e) => {
                                        this.setState({
                                            actions: {
                                                ...this.state.actions,
                                                [f.filename]: e.target.value as "register" | "ignore",
                                            },
                                        });
                                    }}
                                    style={{
                                        padding: "3px 6px",
                                        borderRadius: 4,
                                        border: "1px solid rgba(255,255,255,0.15)",
                                        background: "rgba(255,255,255,0.06)",
                                        color: "#fff",
                                        fontSize: 11,
                                        fontFamily: "inherit",
                                    }}
                                >
                                    <option value="register">{i18n.t("register_custom_mod", { ns: "dialogs" })}</option>
                                    <option value="ignore">{i18n.t("ignore", { ns: "dialogs" })}</option>
                                </select>
                                {this.state.actions[f.filename] === "register" && (
                                    <input
                                        type="text"
                                        value={this.state.modNames[f.filename]}
                                        placeholder={i18n.t("mod_name_placeholder", { ns: "dialogs" })}
                                        onChange={(e) => {
                                            this.setState({
                                                modNames: {
                                                    ...this.state.modNames,
                                                    [f.filename]: e.target.value,
                                                },
                                            });
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: "3px 6px",
                                            borderRadius: 4,
                                            border: "1px solid rgba(255,255,255,0.15)",
                                            background: "rgba(255,255,255,0.06)",
                                            color: "#fff",
                                            fontSize: 11,
                                            fontFamily: "inherit",
                                            outline: "none",
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    getButtons() {
        return (
            <>
                <Button color={ButtonColor.GRAY} onClick={() => closeDialog("cancel")}>
                    {i18n.t("skip", { ns: "dialogs" })}
                </Button>
                <Button
                    color={ButtonColor.GREEN}
                    onClick={() => {
                        // Pack the user decisions into the output
                        const result = JSON.stringify({
                            modNames: this.state.modNames,
                            actions: this.state.actions,
                        });
                        closeDialog(result);
                    }}
                >
                    {i18n.t("confirm", { ns: "common" })}
                </Button>
            </>
        );
    }
}
