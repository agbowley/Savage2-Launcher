/** Image base URL on the website */
export const RUNE_IMAGE_BASE = "https://savage2.net/img/icons/rune-icons/";

export interface Affix {
    id: number;
    text: string;
    status: string;
    image: string;
    affixImage: string;
    /** Point cost for the builder (15-point budget) */
    cost: number;
    description: string;
}

/** Maximum points available in the builder */
export const MAX_POINTS = 15;

export const Types: Affix[] = [
    { id: 1, text: "Ring", status: "5%", description: "5%", cost: 0, image: "types/object_ring.png", affixImage: "types/object_ring.png" },
    { id: 2, text: "Amulet", status: "8%", description: "8%", cost: 2, image: "types/object_amulet.png", affixImage: "types/object_amulet.png" },
    { id: 3, text: "Jewel", status: "11%", description: "11%", cost: 7, image: "types/object_jewel.png", affixImage: "types/object_jewel.png" },
    { id: 4, text: "Rune", status: "15%", description: "15%", cost: 11, image: "types/object_rune.png", affixImage: "types/object_rune.png" },
];

export const Regen: Affix[] = [
    { id: 1, text: "Red", status: "Health", image: "regen/bg_red.png", affixImage: "regen/bg_red.png", cost: 0, description: "Increases health regen by [TYPE]" },
    { id: 3, text: "Blue", status: "Mana", image: "regen/bg_blue.png", affixImage: "regen/bg_blue.png", cost: 1, description: "Increases mana regen by [TYPE]" },
    { id: 4, text: "White", status: "Stamina", image: "regen/bg_white.png", affixImage: "regen/bg_white.png", cost: 5, description: "Increases stamina regen by [TYPE]" },
];

export const Passives: Affix[] = [
    { id: 1, text: "Dolphin", status: "Mana", image: "passives/animal_dolphin.png", affixImage: "dolphin.png", cost: 1, description: "Increases mana by [TYPE]" },
    { id: 2, text: "Beaver", status: "Gold", image: "passives/animal_beaver.png", affixImage: "beaver.png", cost: 0, description: "Increases gold earned by [TYPE]" },
    { id: 4, text: "Armadillo", status: "Armor", image: "passives/animal_armadillo.png", affixImage: "armadillo.png", cost: 3, description: "Increases armor by [TYPE]" },
    { id: 5, text: "Bear", status: "Health", image: "passives/animal_bear.png", affixImage: "bear.png", cost: 5, description: "Increases health by [TYPE]" },
    { id: 7, text: "Rabbit", status: "Stamina", image: "passives/animal_rabbit.png", affixImage: "rabbit.png", cost: 0, description: "Increases stamina by [TYPE]" },
];

export const Actives: Affix[] = [
    { id: 1, text: "Lungs", status: "Stamina", image: "actives/effected_lungs.png", affixImage: "lungs.png", cost: 0, description: "Replenishes [TYPE] of your stamina on use" },
    { id: 2, text: "Heart", status: "Health", image: "actives/effected_heart.png", affixImage: "heart.png", cost: 2, description: "Replenishes [TYPE] of your health on use" },
    { id: 3, text: "Shield", status: "Shield", image: "actives/effected_shield.png", affixImage: "shield.png", cost: 2, description: "Increases your armor by [TYPE] on use" },
    { id: 4, text: "Feet", status: "Speed", image: "actives/effected_feet.png", affixImage: "feet.png", cost: 5, description: "Increases your speed by [TYPE] on use" },
    { id: 5, text: "Brain", status: "Mana", image: "actives/effected_brain.png", affixImage: "brain.png", cost: 1, description: "Replenishes [TYPE] of your mana on use" },
    { id: 6, text: "Dagger", status: "Damage", image: "actives/effected_dagger.png", affixImage: "dagger.png", cost: 5, description: "Increases your damage by [TYPE] on use" },
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
    if (stage > 1) { const r = getRegen(type); if (r) parts.push(r.text); }
    if (stage > 0) { const t = getType(type); if (t) parts.push(t.text); }
    if (stage > 2) { const p = getPassive(type); if (p) parts.push(`of ${p.text}${stage > 3 ? "'s" : ""}`); }
    if (stage > 3) { const a = getActive(type); if (a) parts.push(a.text); }
    return parts.join(" ");
}

export function getRuneDescription(type: number, stage: number): string[] {
    const typeAffix = getType(type);
    const pct = typeAffix?.description ?? "";
    const descs: string[] = [];
    if (stage > 1) { const r = getRegen(type); if (r) descs.push(r.description.replace("[TYPE]", pct)); }
    if (stage > 2) { const p = getPassive(type); if (p) descs.push(p.description.replace("[TYPE]", pct)); }
    if (stage > 3) { const a = getActive(type); if (a) descs.push(a.description.replace("[TYPE]", pct)); }
    return descs;
}

export function getSalvageValue(): number {
    return 40;
}
