import LaunchPage from "@app/components/Launch/LaunchPage";
import { useS2Release } from "@app/hooks/useS2Release";
import { useS2Version } from "@app/hooks/useS2Version";
import StableS2Icon from "@app/assets/s2icon-stable.png";
import StableS2Banner from "@app/assets/Banner/Stable.png";

function StableS2Page() {
    const { data: releaseData, error, isSuccess, isLoading } = useS2Release("stable");
    const S2Version = useS2Version(releaseData, "stable");

    if (isLoading) return "Loading...";

    if (error) return `An error has occurred: ${error}`;

    if (isSuccess) {
        return (<>
            <LaunchPage
                version={S2Version}
                releaseTag={releaseData?.tag_name}
                playName="Community Edition"
                description={<>
                    {releaseData?.description}
                </>}
                // websiteUrl="https://github.com/agbowley/savage2/releases/tag/stable"
                websiteUrl="https://savage2.net"
                icon={StableS2Icon}
                banner={StableS2Banner}
                created_at={releaseData?.created_at}
            />
        </>);
    }
}

export default StableS2Page;