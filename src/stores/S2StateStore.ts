import { S2States } from "@app/hooks/useS2Version";
import { create } from "zustand";

interface S2StateStore {
    states: {
        [key: string]: S2States
    },
    update: (key: string, state: S2States) => void
}

const useS2StateStore = create<S2StateStore>()((set) => ({
    states: {},
    update(key, state) {
        return set(current => ({
            states: {
                ...current.states,
                [key]: state
            }
        }));
    },
}));

interface useS2StateInterface {
    state: S2States;
    setState: (newState: S2States) => void;
}

export const useS2State = (version?: string): useS2StateInterface => {
    const store = useS2StateStore();

    // If we don't have a version yet, return a dummy loading version;
    if (!version) {
        return {
            state: S2States.LOADING,
            setState: () => {}
        };
    }

    const state = store.states[version];
    const setState = (newState: S2States) => store.update(version, newState);

    return { state, setState };
};