import { createBrowserRouter } from "react-router-dom";

import RootLayout from "@app/routes/root";
import Home from "@app/routes/Home";
import Settings from "@app/routes/Settings";
import StableS2Page from "./S2/Stable";
import NightlyS2Page from "./S2/Nightly";
import LegacyS2Page from "./S2/Legacy";
// import OfficialSetlistPage from "./Setlist/Official";
import Queue from "@app/routes/Queue";
import NewsPage from "./NewsPage";

const Router = createBrowserRouter([
    {
        path: "/",
        element: <RootLayout />,
        children: [
            {
                path: "/",
                element: <Home />
            },

            {
                path: "/settings",
                element: <Settings />
            },

            {
                path: "/queue",
                element: <Queue />
            },

            // {
            //     path: "/s2/stable",
            //     element: <StableS2Page />
            // },

            // {
            //     path: "/s2/nightly",
            //     element: <NightlyS2Page />
            // },

            {
                path: "/s2/legacy",
                element: <LegacyS2Page />
            },

            // {
            //     path: "/setlist/official",
            //     element: <OfficialSetlistPage />
            // },

            {
                path: "/news/:md",
                element: <NewsPage />
            }
        ]
    },
]);

export default Router;