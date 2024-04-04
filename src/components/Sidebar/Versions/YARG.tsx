// import { YARGChannels, useYARGRelease } from "@app/hooks/useYARGRelease";
// import { YARGStates, useYARGVersion } from "@app/hooks/useYARGVersion";
// import BaseVersion from "./Base";
// import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
// import StableS2Icon from "@app/assets/s2icon-stable.png";
// import { NavLink } from "react-router-dom";

// interface Props {
//     channel: YARGChannels
// }

// const YARGVersion: React.FC<Props> = ({ channel }: Props) => {
//     const {data: releaseData} = useYARGRelease(channel);
//     const { state } = useYARGVersion(releaseData, channel);

//     function getChannelIcon() {
//         switch (channel) {
//             case "stable":
//                 return StableS2Icon;
//             case "nightly":
//                 return NightlyS2Icon;
//         }
//     }

//     function getChannelDisplayName() {
//         switch (channel) {
//             case "stable":
//                 return "Stable";
//             case "nightly":
//                 return "Nightly";
//         }
//     }

//     return (
//         <NavLink to={"/yarg/" + channel}>
//             <BaseVersion
//                 icon={<img src={getChannelIcon()} alt="YARG" />}
//                 programName="YARG"
//                 versionChannel={getChannelDisplayName()}
//                 version={releaseData?.tag_name}
//                 updateAvailable={state === YARGStates.NEW_UPDATE}
//             />
//         </NavLink>
//     );
// };

// export default YARGVersion;