import {Outlet} from "umi";
import style from "./style.scss"
import avatar from "@/assets/pictures/avatar.jpg"
import {history} from "umi";

interface Tab {
    name: string,
    path: string
}

const tabList: Tab[] = [
    {
        name: "Home",
        path: "/home"
    },
    {
        name: "Login",
        path: "./login"
    },
];

const Layout = () => {
    return (<div className={style.container}>
        <div className={style.leftBar}>
            <div className={style.tab} key={"icon"}>
                <img src={avatar} alt={"avatar"} className={style.avatar}/>
            </div>
            {tabList.map(item => (
                <div className={style.tab} onClick={() => history.push(item.path)} key={item.name}>
                    <label className={style.label}>{item.name}</label>
                </div>
            ))}
        </div>
        <div className={style.page}>
            <Outlet/>
        </div>
    </div>);
};

export default Layout;