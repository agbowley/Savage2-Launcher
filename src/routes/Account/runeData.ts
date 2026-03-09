/** Image base URL on the website */
export const RUNE_IMAGE_BASE = "https://savage2.net/img/icons/rune-icons/";

import i18n from "@app/i18n";

const t = (key: string, options?: Record<string, string>) => i18n.t(key, { ns: "account", ...options });

export interface Affix {
    id: number;
    /** i18n key (account namespace) for the display name */
    text: string;
    /** Raw value or i18n key for the stat label */
    status: string;
    image: string;
    affixImage: string;
    /** Point cost for the builder (15-point budget) */
    cost: number;
    /** i18n key (account namespace) for the description, or raw percentage */
    description: string;
}

/** Maximum points available in the builder */
export const MAX_POINTS = 15;

export const Types: Affix[] = [
    { id: 1, text: "rune_type_ring", status: "5%", description: "5%", cost: 0, image: "types/object_ring.png", affixImage: "types/object_ring.png" },
    { id: 2, text: "rune_type_amulet", status: "8%", description: "8%", cost: 2, image: "types/object_amulet.png", affixImage: "types/object_amulet.png" },
    { id: 3, text: "rune_type_jewel", status: "11%", description: "11%", cost: 7, image: "types/object_jewel.png", affixImage: "types/object_jewel.png" },
    { id: 4, text: "rune_type_rune", status: "15%", description: "15%", cost: 11, image: "types/object_rune.png", affixImage: "types/object_rune.png" },
];

export const Regen: Affix[] = [
    { id: 1, text: "rune_regen_red", status: "rune_stat_health", image: "regen/bg_red.png", affixImage: "regen/bg_red.png", cost: 0, description: "rune_desc_health_regen" },
    { id: 3, text: "rune_regen_blue", status: "rune_stat_mana", image: "regen/bg_blue.png", affixImage: "regen/bg_blue.png", cost: 1, description: "rune_desc_mana_regen" },
    { id: 4, text: "rune_regen_white", status: "rune_stat_stamina", image: "regen/bg_white.png", affixImage: "regen/bg_white.png", cost: 5, description: "rune_desc_stamina_regen" },
];

export const Passives: Affix[] = [
    { id: 1, text: "rune_passive_dolphin", status: "rune_stat_mana", image: "passives/animal_dolphin.png", affixImage: "dolphin.png", cost: 1, description: "rune_desc_increases_mana" },
    { id: 2, text: "rune_passive_beaver", status: "rune_stat_gold", image: "passives/animal_beaver.png", affixImage: "beaver.png", cost: 0, description: "rune_desc_increases_gold" },
    { id: 4, text: "rune_passive_armadillo", status: "rune_stat_armor", image: "passives/animal_armadillo.png", affixImage: "armadillo.png", cost: 3, description: "rune_desc_increases_armor" },
    { id: 5, text: "rune_passive_bear", status: "rune_stat_health", image: "passives/animal_bear.png", affixImage: "bear.png", cost: 5, description: "rune_desc_increases_health" },
    { id: 7, text: "rune_passive_rabbit", status: "rune_stat_stamina", image: "passives/animal_rabbit.png", affixImage: "rabbit.png", cost: 0, description: "rune_desc_increases_stamina" },
];

export const Actives: Affix[] = [
    { id: 1, text: "rune_active_lungs", status: "rune_stat_stamina", image: "actives/effected_lungs.png", affixImage: "lungs.png", cost: 0, description: "rune_desc_replenish_stamina" },
    { id: 2, text: "rune_active_heart", status: "rune_stat_health", image: "actives/effected_heart.png", affixImage: "heart.png", cost: 2, description: "rune_desc_replenish_health" },
    { id: 3, text: "rune_active_shield", status: "rune_stat_shield", image: "actives/effected_shield.png", affixImage: "shield.png", cost: 2, description: "rune_desc_increases_armor_use" },
    { id: 4, text: "rune_active_feet", status: "rune_stat_speed", image: "actives/effected_feet.png", affixImage: "feet.png", cost: 5, description: "rune_desc_increases_speed" },
    { id: 5, text: "rune_active_brain", status: "rune_stat_mana", image: "actives/effected_brain.png", affixImage: "brain.png", cost: 1, description: "rune_desc_replenish_mana" },
    { id: 6, text: "rune_active_dagger", status: "rune_stat_damage", image: "actives/effected_dagger.png", affixImage: "dagger.png", cost: 5, description: "rune_desc_increases_damage" },
];

const affixArrays = [Types, Regen, Passives, Actives] as const;

export function getAffixesForStage(stage: number): Affix[] {
    return [...(affixArrays[stage] ?? [])];
}

/** Compose a 4-digit type number from individual affix IDs. */
export function composeType(type: number, color: number, passive: number, active: number): number {
    return type * 1000 + color * 100 + passive * 10 + active;
}

function digitAt(value: number, pos: number): number {
    const s = value.toString();
    return s.length > pos ? +s[pos] : 0;
}

export function getType(type: number): Affix | undefined { return Types.find(t => t.id === digitAt(type, 0)); }
export function getRegen(type: number): Affix | undefined { return Regen.find(t => t.id === digitAt(type, 1)); }
export function getPassive(type: number): Affix | undefined { return Passives.find(t => t.id === digitAt(type, 2)); }
export function getActive(type: number): Affix | undefined { return Actives.find(t => t.id === digitAt(type, 3)); }

export function getRuneName(type: number, stage: number): string {
    const parts: string[] = [];
    if (stage > 1) { const r = getRegen(type); if (r) parts.push(t(r.text)); }
    if (stage > 0) { const tp = getType(type); if (tp) parts.push(t(tp.text)); }
    if (stage > 2) { const p = getPassive(type); if (p) parts.push(t(stage > 3 ? "rune_name_of_possessive" : "rune_name_of", { passive: t(p.text) })); }
    if (stage > 3) { const a = getActive(type); if (a) parts.push(t(a.text)); }
    return parts.join(" ");
}

export function getRuneDescription(type: number, stage: number): string[] {
    const typeAffix = getType(type);
    const pct = typeAffix?.description ?? "";
    const descs: string[] = [];
    if (stage > 1) { const r = getRegen(type); if (r) descs.push(t(r.description, { pct })); }
    if (stage > 2) { const p = getPassive(type); if (p) descs.push(t(p.description, { pct })); }
    if (stage > 3) { const a = getActive(type); if (a) descs.push(t(a.description, { pct })); }
    return descs;
}

export function getSalvageValue(): number {
    return 40;
}
