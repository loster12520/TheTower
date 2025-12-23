import {useState, useRef, useEffect} from "react";
import style from "./style.module.scss";
import {authStore} from "@/models/auth";
import {observer} from "mobx-react";
import {history} from "umi";
import {message} from "antd";
import Input from "@/components/UI/Input";

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
            },
            next: "Register",
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
            },
            next: "Login",
        },
        Loading: {
            color: "rgba(250,173,20,0.3)",
            submit: () => {
                message.info("Please wait...");
            },
            submitText: "Loading...",
        }
    };

    const containerRef = useRef<HTMLDivElement | null>(null)

    return <div className={"page"}>
        <div
            className={style.container}
            ref={containerRef}
            style={{
                background: options[tab].color,
                ['--next-color' as any]: options[options[tab].next]?.color ?? options[tab].color,
                ['--next-text' as any]: `'${options[tab].next ?? ""}'`
            }}
        >
            {/*<div className={style.prompt} style={{color: options[tab].color}}>{tab}</div>*/}
            <Input
                label={"Username"}
                placeholder={"Please enter your username"}
                value={username}
                onChange={
                    (value) => setUsername(value)
                }/>
            <Input
                label={"Password"}
                placeholder={"Please enter the password"}
                value={password}
                onChange={
                    (value) => setPassword(value)
                }/>
            <button className={style.button} onClick={() => options[tab].submit()}>
                {options[tab].submitText ?? tab}
            </button>
            <div className={style.next} onClick={() => options[tab].next && setTab(options[tab].next)}/>
        </div>
    </div>;
}

export default observer(Login);