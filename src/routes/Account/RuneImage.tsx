import CachedImage from "@app/components/CachedImage";
import { RUNE_IMAGE_BASE, getType, getRegen, getPassive, getActive } from "./runeData";
import styles from "./Account.module.css";

interface RuneImageProps {
    type: number;
    /** -1 = vault (show all layers), 0-4 = builder stage */
    stage: number;
    size?: number;
}

// eslint-disable-next-line react/prop-types
const RuneImage: React.FC<RuneImageProps> = ({ type, stage, size = 56 }) => {
    const showAll = stage === -1;
    const regen = getRegen(type);
    const itemType = getType(type);
    const passive = getPassive(type);
    const active = getActive(type);

    return (
        <div className={styles.runeImage} style={{ width: size, height: size }}>
            {showAll && (
                <div className={styles.runeLayerWrap}>
                    <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}vault_empty.png`} className={styles.runeLayerImg} alt="" />
                </div>
            )}
            {(showAll || stage > 1) && regen && (
                <div className={styles.runeLayerWrap}>
                    <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}${regen.image}`} className={styles.runeLayerImg} alt="" />
                </div>
            )}
            {(showAll || stage > 0) && itemType && (
                <div className={styles.runeLayerWrap}>
                    <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}${itemType.image}`} className={styles.runeLayerImg} alt="" />
                </div>
            )}
            {(showAll || stage > 2) && passive && (
                <div className={styles.runeLayerWrap}>
                    <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}${passive.image}`} className={styles.runeLayerImg} alt="" />
                </div>
            )}
            {(showAll || stage > 3) && active && (
                <div className={styles.runeLayerWrap}>
                    <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}${active.image}`} className={styles.runeLayerImg} alt="" />
                </div>
            )}
        </div>
    );
};

export default RuneImage;
