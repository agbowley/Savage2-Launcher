import LaunchPage from "@app/components/Launch/LaunchPage";
import { useS2Release } from "@app/hooks/useS2Release";
import { useS2Version } from "@app/hooks/useS2Version";
import NightlyS2Icon from "@app/assets/s2icon-nightly.png";
import NightlyS2Banner from "@app/assets/Banner/hell_banner.webp";
import { useTranslation } from "react-i18next";

function NightlyS2Page() {
    const { t } = useTranslation("launch");
    const { data: releaseData, error, isSuccess, isLoading } = useS2Release("nightly");
    const S2Version = useS2Version(releaseData, "nightly");

    if (isLoading) return t("loading", { ns: "common" });

    if (error) return t("error_occurred", { ns: "common", error });

    if (isSuccess) {
        return (<>
            <LaunchPage
                version={S2Version}
                playName={t("beta_test_client")}
                description={<>
                    {t("beta_test_client_desc")}
                </>}
                websiteUrl="https://savage2.net"
                icon={NightlyS2Icon}
                banner={NightlyS2Banner}
                channel="nightly"
            />
        </>);
    }
}

export default NightlyS2Page;