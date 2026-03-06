import { useCachedImage } from "@app/hooks/useCachedImage";
import Spinner from "@app/components/Spinner";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
    /** The remote image URL to cache. */
    cachedSrc: string | null | undefined;
    /** Optional fallback URL shown while loading. */
    fallbackSrc?: string;
}

/**
 * Drop-in `<img>` replacement that transparently caches remote images
 * as in-memory blob URLs via Tauri's HTTP client.
 *
 * On first load the image is fetched, converted to a blob URL, and
 * stored in a global cache.  Subsequent renders (even after the
 * component unmounts) serve the blob URL instantly — no flicker.
 *
 * While loading, a centered spinner is shown.
 */
const CachedImage: React.FC<Props> = ({ cachedSrc, fallbackSrc, style, ...rest }: Props) => {
    const { src, isLoading } = useCachedImage(cachedSrc, fallbackSrc);

    if (isLoading) {
        return (
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "100%",
                    height: "100%",
                    ...style,
                }}
            >
                <Spinner size={24} color="rgba(255,255,255,0.3)" />
            </div>
        );
    }

    if (!src) return null;
    return <img {...rest} style={style} src={src} />;
};

export default CachedImage;
