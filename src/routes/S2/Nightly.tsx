import LaunchPage from "@app/components/Launch/LaunchPage";
import { useS2Release } from "@app/hooks/useS2Release";
import { useS2Version } from "@app/hooks/useS2Version";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import NightlyS2Banner from "@app/assets/Banner/Nightly.png";

function NightlyS2Page() {
    const { data: releaseData, error, isSuccess, isLoading } = useS2Release("nightly");
    const S2Version = useS2Version(releaseData, "nightly");

    if (isLoading) return "Loading...";

    if (error) return `An error has occurred: ${error}`;

    if (isSuccess) {
        return (<>
            <LaunchPage
                version={S2Version}
                releaseTag={releaseData?.tag_name}
                playName="BETA"
                description={<>
                    Savage 2 - BETA
                </>}
                // websiteUrl="https://github.com/agbowley/savage2/releases/tag/nightly"
                websiteUrl="https://savage2.net"
                icon={NightlyS2Icon}
                banner={NightlyS2Banner}
                created_at={releaseData?.created_at}
            />
        </>);
    }
}

export default NightlyS2Page;