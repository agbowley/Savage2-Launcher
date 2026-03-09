import i18n from "@app/i18n";

export const millisToDisplayLength = (length: number) => {
    const date = new Date(length);
    return new Intl.DateTimeFormat(i18n.language, {
        minute: "numeric",
        second: "numeric"
    }).format(date);
};

export const isConsideredNewRelease = (releaseDate: string, newestInSetlist: string) => {
    const release = new Date(releaseDate).getTime();
    const newest = new Date(newestInSetlist).getTime();

    if (release < newest) {
        return false;
    }

    // Threshold is 30 days
    const month = 1000 * 60 * 60 * 24 * 30;
    if (release + month < Date.now()) {
        return false;
    }

    return true;
};