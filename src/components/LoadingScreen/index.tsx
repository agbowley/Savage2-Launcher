import { useEffect, useState } from "react";
import styles from "./LoadingScreen.module.css";
import * as Progress from "@radix-ui/react-progress";
import { error as logError } from "tauri-plugin-log-api";
import { serializeError } from "serialize-error";
import { invoke } from "@tauri-apps/api/tauri";
import { useTranslation } from "react-i18next";

enum LoadingState {
    "LOADING",
    "FADE_OUT",
    "DONE"
}

interface Props {
    setError: React.Dispatch<unknown>;
}

const LoadingScreen: React.FC<Props> = (props: Props) => {
    const [loading, setLoading] = useState(LoadingState.LOADING);
    const { t } = useTranslation();

    // Load
    useEffect(() => {
        (async () => {
            try {
                const start = Date.now();
                await invoke("init");

                // Ensure the loading bar animation (1s) finishes before hiding
                const elapsed = Date.now() - start;
                const remaining = Math.max(1000 - elapsed, 0);
                await new Promise(r => setTimeout(r, remaining));
            } catch (e) {
                console.error(e);
                logError(JSON.stringify(serializeError(e)));

                // If there's an error, just instantly hide the loading screen
                props.setError(e);
                setLoading(LoadingState.DONE);

                return;
            }

            // The loading screen takes 250ms to fade out
            setLoading(LoadingState.FADE_OUT);
            await new Promise(r => setTimeout(r, 250));

            // Done!
            setLoading(LoadingState.DONE);
        })();
    }, []);

    // Don't display anything if done
    if (loading == LoadingState.DONE) {
        return <></>;
    }

    // Display loading screen
    // When fading out (opacity 0), disable pointer events so it doesn't block clicks
    return <div className={styles.container} style={{
        opacity: loading ? 0 : 1,
        pointerEvents: loading ? "none" : "auto"
    }}>
        <Progress.Root className={styles.progressRoot}>
            <Progress.Indicator className={styles.progressIndicator} />
        </Progress.Root>

        <div className={styles.factContainer}>
            {/* <p className={styles.factHeader}>Fun Fact</p> */}
            {t("loading")}
        </div>
    </div>;
};

export default LoadingScreen;