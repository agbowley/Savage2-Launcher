import { useEffect, useState } from "react";
import styles from "./Account.module.css";
import { useAuthStore } from "@app/stores/AuthStore";
import { tauriFetchPost } from "@app/utils/tauriFetch";
import { useVaultStore } from "@app/stores/VaultStore";
import RuneImage from "./RuneImage";
import CachedImage from "@app/components/CachedImage";
import TooltipWrapper from "@app/components/TooltipWrapper";
import { getRuneName, getRuneDescription, getSalvageValue, RUNE_IMAGE_BASE } from "./runeData";
import { showConfirmAction } from "@app/dialogs/dialogUtil";
import { ButtonColor } from "@app/components/Button";
import { useTranslation } from "react-i18next";

interface RuneVaultProps {
    onGoldChanged: () => void;
    refreshKey: number;
}

// eslint-disable-next-line react/prop-types
const RuneVault: React.FC<RuneVaultProps> = ({ onGoldChanged, refreshKey }) => {
    const { t } = useTranslation("account");
    const activeItems = useVaultStore(s => s.activeItems);
    const storedItems = useVaultStore(s => s.storedItems);
    const fetchActive = useVaultStore(s => s.fetchActive);
    const fetchStored = useVaultStore(s => s.fetchStored);
    const [selectedActive, setSelectedActive] = useState<number | null>(null);
    const [selectedStored, setSelectedStored] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    const getToken = () => useAuthStore.getState().authToken!;

    useEffect(() => {
        fetchActive();
        fetchStored();
    }, [fetchActive, fetchStored, refreshKey]);

    const headers = () => ({ Authorization: `Bearer ${getToken()}` });

    const activateItem = async (id: number) => {
        const item = storedItems.find(i => i.id === id);
        const name = item ? getRuneName(item.compositeType, 4) : t("this_item");
        const confirmed = await showConfirmAction(
            t("activate_item_title"),
            t("activate_item_confirm", { name }),
            t("activate"),
            ButtonColor.YELLOW,
        );
        if (!confirmed) return;
        setLoading(true);
        try {
            await tauriFetchPost("https://savage2.net/api/items/activate/" + id, {}, headers());
            setSelectedStored(null);
            await Promise.all([fetchActive(), fetchStored()]);
        } finally {
            setLoading(false);
        }
    };

    const salvageItem = async (id: number) => {
        const item = storedItems.find(i => i.id === id);
        const name = item ? getRuneName(item.compositeType, 4) : t("this_item");
        const confirmed = await showConfirmAction(
            t("salvage_item_title"),
            t("salvage_item_confirm", { name, value: getSalvageValue() }),
            t("salvage"),
        );
        if (!confirmed) return;
        setLoading(true);
        try {
            await tauriFetchPost("https://savage2.net/api/items/salvage/" + id, {}, headers());
            setSelectedStored(null);
            onGoldChanged();
            await fetchStored();
        } finally {
            setLoading(false);
        }
    };

    const deleteActive = async (id: number) => {
        const item = activeItems.find(i => i.id === id);
        const name = item ? getRuneName(item.compositeType, 4) : t("this_item");
        const confirmed = await showConfirmAction(
            t("delete_item_title"),
            t("delete_item_confirm", { name }),
            t("delete"),
        );
        if (!confirmed) return;
        setLoading(true);
        try {
            await tauriFetchPost("https://savage2.net/api/items/delete-active/" + id, {}, headers());
            setSelectedActive(null);
            await fetchActive();
        } finally {
            setLoading(false);
        }
    };

    const activeSlots = 5;
    const emptyActive = Math.max(0, activeSlots - activeItems.length);

    const selectedStoredItem = storedItems.find(i => i.id === selectedStored);
    const selectedActiveItem = activeItems.find(i => i.id === selectedActive);

    return (
        <div className={styles.vaultContainer}>
            {/* Active Items */}
            <div className={styles.vaultSection}>
                <div className={styles.vaultSectionHeader}>
                    {t("active_items", { count: activeItems.length, slots: activeSlots })}
                </div>
                <div className={styles.runeGrid}>
                    {activeItems.map(item => (
                        <TooltipWrapper
                            key={item.id}
                            text={`${getRuneName(item.compositeType, 4)}\n${getRuneDescription(item.compositeType, 4).join("\n")}`}
                        >
                            <div
                                className={`${styles.runeSlot} ${selectedActive === item.id ? styles.runeSlotSelected : ""}`}
                                onClick={() => setSelectedActive(selectedActive === item.id ? null : item.id)}
                            >
                                <RuneImage type={item.compositeType} stage={-1} size={56} />
                            </div>
                        </TooltipWrapper>
                    ))}
                    {Array.from({ length: emptyActive }).map((_, i) => (
                        <div key={`ea-${i}`} className={`${styles.runeSlot} ${styles.runeSlotEmpty}`}>
                            <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}vault_empty.png`} className={styles.emptySlotIcon} alt="" />
                        </div>
                    ))}
                </div>
                {selectedActiveItem && (
                    <div className={styles.runeActions}>
                        <span className={styles.runeActionName}>{getRuneName(selectedActiveItem.compositeType, 4)}</span>
                        <button
                            className={styles.deleteButton}
                            onClick={() => deleteActive(selectedActiveItem.id)}
                            disabled={loading}
                        >
                            {t("delete", { ns: "common" })}
                        </button>
                    </div>
                )}
            </div>

            {/* Item Storage */}
            <div className={styles.vaultSection}>
                <div className={styles.vaultSectionHeader}>
                    {t("item_storage", { count: storedItems.length })}
                </div>
                <div className={styles.runeGrid}>
                    {storedItems.map(item => (
                        <TooltipWrapper
                            key={item.id}
                            text={`${getRuneName(item.compositeType, 4)}\n${getRuneDescription(item.compositeType, 4).join("\n")}\n${t("salvage_tooltip", { value: getSalvageValue() })}`}
                        >
                            <div
                                className={`${styles.runeSlot} ${selectedStored === item.id ? styles.runeSlotSelected : ""}`}
                                onClick={() => setSelectedStored(selectedStored === item.id ? null : item.id)}
                            >
                                <RuneImage type={item.compositeType} stage={-1} size={56} />
                            </div>
                        </TooltipWrapper>
                    ))}
                    {Array.from({ length: Math.max(0, 5 - storedItems.length) }).map((_, i) => (
                        <div key={`es-${i}`} className={`${styles.runeSlot} ${styles.runeSlotEmpty}`}>
                            <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}empty.png`} className={styles.emptySlotIcon} alt="" />
                        </div>
                    ))}
                </div>
                {selectedStoredItem && (
                    <div className={styles.runeActions}>
                        <span className={styles.runeActionName}>{getRuneName(selectedStoredItem.compositeType, 4)}</span>
                        <button
                            className={styles.activateButton}
                            onClick={() => activateItem(selectedStoredItem.id)}
                            disabled={loading}
                        >
                            {t("activate")}
                        </button>
                        <button
                            className={styles.deleteButton}
                            onClick={() => salvageItem(selectedStoredItem.id)}
                            disabled={loading}
                        >
                            {t("salvage_value", { value: getSalvageValue() })}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RuneVault;
