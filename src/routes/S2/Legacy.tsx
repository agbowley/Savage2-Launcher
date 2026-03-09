import LaunchPage from "@app/components/Launch/LaunchPage";
import { useS2Release } from "@app/hooks/useS2Release";
import { useS2Version } from "@app/hooks/useS2Version";
import LegacyS2Icon from "@app/assets/s2icon-legacy.png";
import LegacyS2Banner from "@app/assets/Banner/Legacy.png";
import { useTranslation } from "react-i18next";

function LegacyS2Page() {
    const { t } = useTranslation("launch");
    const { data: releaseData, error, isSuccess, isLoading } = useS2Release("legacy");
    const S2Version = useS2Version(releaseData, "legacy");

    if (isLoading) return t("loading", { ns: "common" });

    if (error) return t("error_occurred", { ns: "common", error });

    if (isSuccess) {
        return (<>
            <LaunchPage
                version={S2Version}
                playName={t("legacy_client")}
                description={<>
                    {t("legacy_client_desc")}
                </>}
                websiteUrl="https://savage2.net"
                icon={LegacyS2Icon}
                banner={LegacyS2Banner}
                channel="legacy"
            />
        </>);
    }
}

export default LegacyS2Page;