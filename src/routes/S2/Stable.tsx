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
                playName="Community Edition"
                description={<>
                    {releaseData?.description}
                </>}
                websiteUrl="https://savage2.net"
                icon={StableS2Icon}
                banner={StableS2Banner}
                channel="stable"
            />
        </>);
    }
}

export default StableS2Page;