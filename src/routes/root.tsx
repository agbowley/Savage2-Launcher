// import { Container } from './styles';

import Sidebar from "@app/components/Sidebar";
import { Outlet } from "react-router-dom";
import { useAuthStore } from "@app/stores/AuthStore";

const RootLayout: React.FC = () => {
    const accountId = useAuthStore(s => s.user?.accountId ?? "");

    return (<>

        <Sidebar />
        <div id="content">
            <Outlet key={accountId} />
        </div>

    </>);
};

export default RootLayout;