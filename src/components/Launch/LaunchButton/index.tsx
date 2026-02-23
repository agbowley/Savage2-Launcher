import { S2States, S2Version } from "@app/hooks/useS2Version";
import { ButtonColor } from "../../Button";
import { ErrorIcon, PlayIcon, UpdateIcon, UpgradeIcon } from "@app/assets/Icons";
import { calculatePayloadPercentage } from "@app/tasks/payload";
import PayloadProgress from "../../PayloadProgress";
import Button from "@app/components/Button";
import { DropdownButton, DropdownItem } from "@app/components/DropdownButton";
import Spinner from "@app/components/Spinner";
import { useNavigate } from "react-router-dom";

interface LaunchButtonProps extends React.PropsWithChildren {
    version: S2Version,
    playName: string,
    style?: React.CSSProperties
}

export function LaunchButton(props: LaunchButtonProps) {
    const { version, playName } = props;
    const navigate = useNavigate();

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

    if (version.state === S2States.AVAILABLE) {
        const buttonChildren = <>
            <PlayIcon /> Play {playName}
        </>;

        const dropdownChildren = <>
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
        const buttonChildren = <>
            Opening Savage 2
        </>;

        return <Button
            color={ButtonColor.GRAY}
            style={props.style}>

            {buttonChildren}
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