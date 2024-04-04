import { S2States, S2Version } from "@app/hooks/useS2Version";
import { ButtonColor } from "../../Button";
import { InstallingIcon, UpdateIcon } from "@app/assets/Icons";
import { calculatePayloadPercentage } from "@app/tasks/payload";
import PayloadProgress from "../../PayloadProgress";
import Button from "@app/components/Button";
import { DropdownButton, DropdownItem } from "@app/components/DropdownButton";

interface LaunchButtonProps extends React.PropsWithChildren {
    version: S2Version,
    playName: string,
    style?: React.CSSProperties
}

export function LaunchButton(props: LaunchButtonProps) {
    const { version, playName } = props;

    if (version.state === S2States.NEW_UPDATE) {
        const buttonChildren = <>
            <UpdateIcon /> Install {playName}
        </>;

        return <Button
            style={props.style}
            color={ButtonColor.BLUE}
            onClick={() => version.download()}>

            {buttonChildren}
        </Button>;
    }

    if (version.state === S2States.DOWNLOADING) {
        const buttonChildren = <>
            <InstallingIcon />
            <PayloadProgress payload={version.payload} />
        </>;

        return <Button
            style={props.style}
            progress={calculatePayloadPercentage(version.payload)}
            color={ButtonColor.YELLOW}>

            {buttonChildren}
        </Button>;
    }

    if (version.state === S2States.AVAILABLE) {
        const buttonChildren = <>
            Play {playName}
        </>;

        const dropdownChildren = <>
            <DropdownItem onClick={() => version.uninstall()}>
                Uninstall
            </DropdownItem>
            <DropdownItem onClick={() => version.revealFolder()}>
                Open Install Folder
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
            Opening S2 {playName}
        </>;

        return <Button
            color={ButtonColor.GRAY}
            style={props.style}>

            {buttonChildren}
        </Button>;
    }

    if (version.state === S2States.ERROR) {
        const buttonChildren = <>
            Error!
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