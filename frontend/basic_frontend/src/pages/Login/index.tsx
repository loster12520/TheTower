import {useState, useRef, useEffect} from "react";
import style from "./style.module.scss";
import {authStore} from "@/models/auth";
import {observer} from "mobx-react";
import {history} from "umi";
import {message} from "antd";

const Login = () => {
    const [tab, setTab] = useState("Login");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const options: Record<string, any> = {
        Login: {
            color: "rgba(24,144,255,0.3)",
            submit: () => {
                setTab("Loading");
                authStore.login(username, password).then(res => {
                    if (res) {
                        history.push("/home");
                    }
                })
            }
        },
        Register: {
            color: "rgba(82,196,26,0.3)",
            submit: () => {
                setTab("Loading");
                authStore.register(username, password).then(res => {
                    if (res) {
                        setTab("Login");
                    }
                })
            }
        },
        Loading: {
            color: "rgba(250,173,20,0.3)",
            submit: () => {
                message.info("Please wait...");
            },
            submitText: "Loading..."
        }
    };

    const containerRef = useRef<HTMLDivElement | null>(null)
    const handleScroll = (event: WheelEvent) => {
        if (tab === "Loading") return;
        if (event.deltaY > 0) {
            setTab("Register");
        } else {
            setTab("Login");
        }
    }

    useEffect(() => {
        const el = containerRef.current
        const tabElement = document.querySelector(`.${style.prompt}`);
        const stopPropagation = (e: Event) => {
            e.stopPropagation();
        }
        if (el) {
            el.addEventListener("wheel", handleScroll)
            tabElement?.addEventListener("wheel", stopPropagation)
            return () => {
                el.removeEventListener("wheel", handleScroll)
                tabElement?.removeEventListener("wheel", stopPropagation)
            }
        }
    }, []);

    return <div className={"page"}>
        <div className={style.container} ref={containerRef}>
            <div className={style.prompt} style={{color: options[tab].color}}>{tab}</div>
            <input placeholder={"Please enter your username"} className={style.input} value={username} onChange={
                (e) => setUsername(e.target.value)
            }/>
            <input placeholder={"Please enter the password"} className={style.input} value={password} onChange={
                (e) => setPassword(e.target.value)
            }/>
            <button className={style.button} onClick={() => options[tab].submit()}>
                {options[tab].submitText ?? tab}
            </button>
        </div>
    </div>;
}

export default observer(Login);