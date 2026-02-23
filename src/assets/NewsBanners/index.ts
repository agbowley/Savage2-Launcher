import banner1 from "./1.png";
import banner2 from "./2.png";
import banner3 from "./3.png";
import banner4 from "./4.png";
import banner5 from "./5.png";
import banner6 from "./6.png";

interface BannerInfo {
    url: string;
    color: string;
}

const bannerMap: Record<number, BannerInfo> = {
    1: { url: banner1, color: "174, 140, 40" },
    2: { url: banner2, color: "47, 117, 67" },
    3: { url: banner3, color: "88, 72, 27" },
    4: { url: banner4, color: "54, 74, 138" },
    5: { url: banner5, color: "154, 63, 16" },
    6: { url: banner6, color: "169, 101, 11" },
};

const BANNER_COUNT = Object.keys(bannerMap).length;

export function getNewsBanner(articleId: number): BannerInfo {
    const index = ((articleId - 1) % BANNER_COUNT) + 1;
    return bannerMap[index];
}
