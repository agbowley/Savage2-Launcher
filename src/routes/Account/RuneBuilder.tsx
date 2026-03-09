import { useState } from "react";
import styles from "./Account.module.css";
import Button, { ButtonColor } from "@app/components/Button";
import CachedImage from "@app/components/CachedImage";
import RuneImage from "./RuneImage";
import Spinner from "@app/components/Spinner";
import { useAuthStore } from "@app/stores/AuthStore";
import { tauriFetchPost } from "@app/utils/tauriFetch";
import {
    RUNE_IMAGE_BASE,
    Types,
    Regen,
    Passives,
    Actives,
    MAX_POINTS,
    composeType,
    type Affix,
} from "./runeData";
import { useTranslation } from "react-i18next";

type Step = "intro" | "builder" | "confirm" | "success";

interface Selections {
    type: number | null;
    color: number | null;
    passive: number | null;
    active: number | null;
}

interface RuneBuilderProps {
    onGoldChanged: () => void;
}

// eslint-disable-next-line react/prop-types
const RuneBuilder: React.FC<RuneBuilderProps> = ({ onGoldChanged }) => {
    const { t } = useTranslation("account");
    const [step, setStep] = useState<Step>("intro");
    const [selections, setSelections] = useState<Selections>({ type: null, color: null, passive: null, active: null });
    const [resultType, setResultType] = useState<number>(0);
    const [loading, setLoading] = useState(false);

    const getToken = () => useAuthStore.getState().authToken!;
    const headers = () => ({ Authorization: `Bearer ${getToken()}` });

    const selectedType = Types.find(a => a.id === selections.type);
    const selectedColor = Regen.find(a => a.id === selections.color);
    const selectedPassive = Passives.find(a => a.id === selections.passive);
    const selectedActive = Actives.find(a => a.id === selections.active);
    const allSelected = selectedType && selectedColor && selectedPassive && selectedActive;
    const pointsSpent = (selectedType?.cost ?? 0) + (selectedColor?.cost ?? 0) + (selectedPassive?.cost ?? 0) + (selectedActive?.cost ?? 0);
    const pointsLeft = MAX_POINTS - pointsSpent;

    const previewType = allSelected
        ? composeType(selections.type!, selections.color!, selections.passive!, selections.active!)
        : 0;

    const canAfford = (affix: Affix, category: keyof Selections) => {
        const currentCostInCategory = category === "type"
            ? (selectedType?.cost ?? 0)
            : category === "color"
                ? (selectedColor?.cost ?? 0)
                : category === "passive"
                    ? (selectedPassive?.cost ?? 0)
                    : (selectedActive?.cost ?? 0);
        return (pointsSpent - currentCostInCategory + affix.cost) <= MAX_POINTS;
    };

    const select = (category: keyof Selections, id: number) => {
        setSelections(prev => ({ ...prev, [category]: prev[category] === id ? null : id }));
    };

    const createItem = async (isRandom: boolean) => {
        setLoading(true);
        try {
            const body = isRandom
                ? { type: 1, color: 1, passive: 1, active: 1, isRandom: true }
                : { type: selections.type!, color: selections.color!, passive: selections.passive!, active: selections.active!, isRandom: false };

            const data = await tauriFetchPost<{ type: number; color: number; passive: number; active: number }>(
                "https://savage2.net/api/items/generate", body, headers()
            );
            setResultType(composeType(data.type, data.color, data.passive, data.active));
            setStep("success");
            onGoldChanged();
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setSelections({ type: null, color: null, passive: null, active: null });
        setResultType(0);
        setStep("intro");
    };

    const stepIndex = step === "intro" ? 0 : step === "builder" ? 1 : step === "confirm" ? 2 : 3;
    const stepLabels = [t("step_introduction"), t("step_builder"), t("step_confirmation"), t("step_success")];

    const renderStepper = () => (
        <div className={styles.stepper}>
            {stepLabels.map((label, i) => (
                <div key={i} className={styles.stepItem}>
                    <div className={`${styles.stepCircle} ${i < stepIndex ? styles.stepDone : ""} ${i === stepIndex ? styles.stepActive : ""}`}>
                        {i < stepIndex ? "\u2714" : i + 1}
                    </div>
                    <span className={`${styles.stepLabel} ${i === stepIndex ? styles.stepLabelActive : ""}`}>{label}</span>
                    {i < 3 && <div className={`${styles.stepLine} ${i < stepIndex ? styles.stepLineDone : ""}`} />}
                </div>
            ))}
        </div>
    );

    const renderAffixColumn = (title: string, affixes: Affix[], category: keyof Selections, selected: number | null) => (
        <div className={styles.affixColumn}>
            {affixes.map(affix => {
                const isSelected = selected === affix.id;
                const affordable = canAfford(affix, category);
                return (
                    <div
                        key={affix.id}
                        className={`${styles.affixRow} ${isSelected ? styles.affixRowSelected : ""} ${!affordable && !isSelected ? styles.affixRowDisabled : ""}`}
                        onClick={() => affordable || isSelected ? select(category, affix.id) : undefined}
                    >
                        <CachedImage
                            cachedSrc={`${RUNE_IMAGE_BASE}${affix.affixImage}`}
                            className={styles.affixThumb}
                            alt={t(affix.text)}
                        />
                        <div className={styles.affixInfo}>
                            <span className={styles.affixName}>{t(affix.text)}</span>
                            <span className={styles.affixStat}>+ {t(affix.status)}</span>
                        </div>
                        <span className={styles.affixPoints}>&#10022; {affix.cost}</span>
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className={styles.builderWrapper}>
            {renderStepper()}

            {step === "intro" && (
                <div className={styles.builderLanding}>
                    <p className={styles.builderTitle}>
                        {t("builder_intro")}
                    </p>
                    <div className={styles.introIcons}>
                        <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}types/object_jewel.png`} className={styles.introIcon} alt="" />
                        <span className={styles.introPlus}>+</span>
                        <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}regen/bg_red.png`} className={styles.introIcon} alt="" />
                        <span className={styles.introPlus}>+</span>
                        <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}armadillo.png`} className={styles.introIcon} alt="" />
                        <span className={styles.introPlus}>+</span>
                        <CachedImage cachedSrc={`${RUNE_IMAGE_BASE}lungs.png`} className={styles.introIcon} alt="" />
                        <span className={styles.introEquals}>=</span>
                        <RuneImage type={composeType(3, 1, 4, 1)} stage={-1} size={80} />
                    </div>
                    <p className={styles.builderHint}>
                        {t("builder_hint_spend")} <GoldIcon /> {t("builder_hint_gold_craft")} <GoldIcon /> {t("builder_hint_gold_random")}
                    </p>
                    <div className={styles.introButtons}>
                        <Button color={ButtonColor.YELLOW} onClick={() => setStep("builder")} compact>
                            {t("create_new_item")}
                        </Button>
                        <Button color={ButtonColor.GRAY} onClick={() => createItem(true)} disabled={loading} compact>
                            {loading ? <Spinner size={14} /> : t("randomize_item")}
                        </Button>
                    </div>
                </div>
            )}

            {step === "builder" && (
                <div className={styles.builderStep}>
                    <div className={styles.pointsHeader}>
                        <span className={styles.pointsStar}>&#10022;</span>
                        <span className={styles.pointsText}>{t("points_left", { left: pointsLeft, max: MAX_POINTS })}</span>
                    </div>
                    <div className={styles.builderColumns}>
                        {renderAffixColumn(t("column_type"), Types, "type", selections.type)}
                        {renderAffixColumn(t("column_color"), Regen, "color", selections.color)}
                        {renderAffixColumn(t("column_passive"), Passives, "passive", selections.passive)}
                        {renderAffixColumn(t("column_active"), Actives, "active", selections.active)}
                    </div>
                    <div className={styles.builderNav}>
                        <Button color={ButtonColor.GRAY} compact onClick={() => { reset(); }}>
                            {t("previous")}
                        </Button>
                        <Button color={ButtonColor.YELLOW} compact disabled={!allSelected || pointsLeft < 0} onClick={() => setStep("confirm")}>
                            {t("next_step")}
                        </Button>
                    </div>
                </div>
            )}

            {step === "confirm" && (
                <div className={styles.builderLanding}>
                    <p className={styles.builderTitle}>{t("confirm_rune")}</p>
                    <RuneImage type={previewType} stage={-1} size={160} />
                    <div className={styles.introButtons}>
                        <Button color={ButtonColor.GRAY} compact onClick={() => setStep("builder")}>
                            {t("previous")}
                        </Button>
                        <Button color={ButtonColor.YELLOW} compact disabled={loading} onClick={() => createItem(false)}>
                            {loading ? <Spinner size={14} /> : t("create")}
                        </Button>
                    </div>
                </div>
            )}

            {step === "success" && (
                <div className={styles.builderLanding}>
                    <p className={styles.builderTitle}>
                        {t("rune_created")}
                    </p>
                    <RuneImage type={resultType} stage={-1} size={160} />
                    <Button color={ButtonColor.YELLOW} compact onClick={reset}>
                        {t("create_new_rune")}
                    </Button>
                </div>
            )}
        </div>
    );
};

const GoldIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14, flexShrink: 0, verticalAlign: "middle", margin: "0 2px" }}>
        <circle cx="12" cy="12" r="10" fill="#FFD700" />
        <circle cx="12" cy="12" r="8" fill="#FFC107" />
    </svg>
);

export default RuneBuilder;
