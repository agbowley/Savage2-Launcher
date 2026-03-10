import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ServerFavouritesState {
    favourites: string[];
    toggleFavourite: (id: string) => void;
}

export const useServerFavourites = create<ServerFavouritesState>()(
    persist(
        (set) => ({
            favourites: [],
            toggleFavourite: (id) =>
                set((state) => ({
                    favourites: state.favourites.includes(id)
                        ? state.favourites.filter((fid) => fid !== id)
                        : [...state.favourites, id],
                })),
        }),
        {
            name: "server-favourites",
        },
    ),
);
