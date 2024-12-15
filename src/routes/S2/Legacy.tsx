import LaunchPage from "@app/components/Launch/LaunchPage";
import { useS2Release } from "@app/hooks/useS2Release";
import { useS2Version } from "@app/hooks/useS2Version";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import LegacyS2Banner from "@app/assets/Banner/Legacy.png";

function LegacyS2Page() {
    const { data: releaseData, error, isSuccess, isLoading } = useS2Release("legacy");
    const S2Version = useS2Version(releaseData, "legacy");

    if (isLoading) return "Loading...";

    if (error) return `An error has occurred: ${error}`;

    if (isSuccess) {
        return (<>
            <LaunchPage
                version={S2Version}
                releaseTag={releaseData?.tag_name}
                playName="Legacy Client"
                description={<>
                    {releaseData?.description}
                </>}
                // websiteUrl="https://savage2.net"
                websiteUrl="http://localhost:5000"
                icon={LegacyS2Icon}
                banner={LegacyS2Banner}
                created_at={releaseData?.created_at}
            />
        </>);
    }
}

export default LegacyS2Page;