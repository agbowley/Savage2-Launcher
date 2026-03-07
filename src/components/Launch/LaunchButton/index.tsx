import { S2States, S2Version } from "@app/hooks/useS2Version";
import { ButtonColor } from "../../Button";
import { ErrorIcon, PlayIcon, TimeIcon, UpdateIcon, UpgradeIcon, WarningIcon } from "@app/assets/Icons";
import { calculatePayloadPercentage } from "@app/tasks/payload";
import PayloadProgress from "../../PayloadProgress";
import Button from "@app/components/Button";
import { DropdownButton, DropdownItem } from "@app/components/DropdownButton";
import Spinner from "@app/components/Spinner";
import { useNavigate } from "react-router-dom";
import { useCurrentTask } from "@app/tasks";
import { useState } from "react";

interface LaunchButtonProps extends React.PropsWithChildren {
    version: S2Version,
    playName: string,
    style?: React.CSSProperties
}

export function LaunchButton(props: LaunchButtonProps) {
    const { version, playName } = props;
    const navigate = useNavigate();
    const currentTask = useCurrentTask();
    const [hoveringPlaying, setHoveringPlaying] = useState(false);

    // Check if this version's task is queued (not the active/first task)
    const isQueued = version.task != null && currentTask != null && version.task !== currentTask;

    if (isQueued) {
        const buttonChildren = <>
            <TimeIcon width={16} height={16} />
            Queued
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.cancel()}>
                Cancel
            </DropdownItem>
        </>;

        return <DropdownButton
            style={props.style}
            color={ButtonColor.GRAY}
            onClick={() => navigate("/queue")}
            dropdownChildren={dropdownChildren}>

            {buttonChildren}
        </DropdownButton>;
    }

    if (version.state === S2States.NEW_UPDATE) {
        const buttonChildren = <>
            <UpdateIcon /> Install {playName}
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.changeInstallLocation()}>
                Choose Install Location
            </DropdownItem>
        </>;

        return <DropdownButton
            style={props.style}
            color={ButtonColor.BLUE}
            onClick={() => version.download()}
            dropdownChildren={dropdownChildren}>

            {buttonChildren}
        </DropdownButton>;
    }

    if (version.state === S2States.UPDATE_AVAILABLE) {
        const buttonChildren = <>
            <UpgradeIcon /> Update {playName}
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.play()}>
                Play Anyway
            </DropdownItem>
            <DropdownItem onClick={() => version.verifyInstallation()}>
                Verify Installation
            </DropdownItem>
            <DropdownItem onClick={() => version.changeInstallLocation()}>
                Change Install Location
            </DropdownItem>
            <DropdownItem onClick={() => version.revealFolder()}>
                Open Install Folder
            </DropdownItem>
            <DropdownItem onClick={() => version.uninstall()}>
                Uninstall
            </DropdownItem>
        </>;

        return <DropdownButton
            style={props.style}
            color={ButtonColor.BLUE}
            onClick={() => version.download()}
            dropdownChildren={dropdownChildren}>

            {buttonChildren}
        </DropdownButton>;
    }

    if (version.state === S2States.DOWNLOADING) {
        const buttonChildren = <>
            <Spinner size={16} />
            <PayloadProgress payload={version.payload} />
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.cancel()}>
                Cancel
            </DropdownItem>
        </>;

        return <DropdownButton
            style={props.style}
            progress={calculatePayloadPercentage(version.payload)}
            color={ButtonColor.YELLOW}
            onClick={() => navigate("/queue")}
            dropdownChildren={dropdownChildren}>

            {buttonChildren}
        </DropdownButton>;
    }

    if (version.state === S2States.UPDATING) {
        const buttonChildren = <>
            <Spinner size={16} />
            <PayloadProgress payload={version.payload} defaultText="Updating" />
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.cancel()}>
                Cancel
            </DropdownItem>
        </>;

        return <DropdownButton
            style={props.style}
            progress={calculatePayloadPercentage(version.payload)}
            color={ButtonColor.YELLOW}
            onClick={() => navigate("/queue")}
            dropdownChildren={dropdownChildren}>

            {buttonChildren}
        </DropdownButton>;
    }

    if (version.state === S2States.REPAIRING) {
        const buttonChildren = <>
            <Spinner size={16} />
            <PayloadProgress payload={version.payload} defaultText="Repairing" />
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.cancel()}>
                Cancel
            </DropdownItem>
        </>;

        return <DropdownButton
            style={props.style}
            progress={calculatePayloadPercentage(version.payload)}
            color={ButtonColor.YELLOW}
            onClick={() => navigate("/queue")}
            dropdownChildren={dropdownChildren}>

            {buttonChildren}
        </DropdownButton>;
    }

    if (version.state === S2States.UNINSTALLING) {
        const buttonChildren = <>
            <Spinner size={16} />
            <PayloadProgress payload={version.payload} defaultText="Uninstalling" />
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.cancel()}>
                Cancel
            </DropdownItem>
        </>;

        return <DropdownButton
            style={props.style}
            progress={calculatePayloadPercentage(version.payload)}
            color={ButtonColor.RED}
            onClick={() => navigate("/queue")}
            dropdownChildren={dropdownChildren}>

            {buttonChildren}
        </DropdownButton>;
    }

    if (version.state === S2States.AVAILABLE) {
        const buttonChildren = <>
            <PlayIcon /> Play {playName}
            {version.verificationWarning && <WarningIcon width={16} height={16} style={{ marginLeft: 4 }} title="Some files could not be verified" />}
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.verifyInstallation()}>
                Verify Installation
            </DropdownItem>
            <DropdownItem onClick={() => version.checkForUpdates()}>
                Check for Updates
            </DropdownItem>
            <DropdownItem onClick={() => version.changeInstallLocation()}>
                Change Install Location
            </DropdownItem>
            <DropdownItem onClick={() => version.revealFolder()}>
                Open Install Folder
            </DropdownItem>
            <DropdownItem onClick={() => version.uninstall()}>
                Uninstall
            </DropdownItem>
        </>;

        return <DropdownButton
            style={props.style}
            color={ButtonColor.GREEN}
            onClick={() => version.play()}
            dropdownChildren={dropdownChildren}>

            {buttonChildren}
        </DropdownButton>;
    }

    if (version.state === S2States.PLAYING) {
        return <Button
            color={ButtonColor.GRAY}
            style={props.style}
            onClick={() => version.stopGame()}
            onMouseEnter={() => setHoveringPlaying(true)}
            onMouseLeave={() => setHoveringPlaying(false)}>
            {hoveringPlaying
                ? <span style={{ color: "var(--button_red)" }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="1" y="1" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    {" "}Stop
                </span>
                : "Playing"}
        </Button>;
    }

    if (version.state === S2States.LOADING) {
        const buttonChildren = <>
            <Spinner size={16} />
            Verifying
        </>;

        return <Button
            color={ButtonColor.GRAY}
            style={props.style}>

            {buttonChildren}
        </Button>;
    }

    if (version.state === S2States.ERROR) {
        const buttonChildren = <>
            <ErrorIcon /> Error!
        </>;

        return <Button
            color={ButtonColor.RED}
            style={props.style}>

            {buttonChildren}
        </Button>;
    }

    return <Button
        style={props.style}>
        Loading...
    </Button>;
}