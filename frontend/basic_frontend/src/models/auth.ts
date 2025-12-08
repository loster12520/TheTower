import {observable, computed, action, makeAutoObservable} from "mobx";
import {login, register} from "@/services/auth";
import {message} from "antd";

class AuthStore {
    // @observable
    // isAuthenticated: boolean = false;
    @observable
    token: string | null = null;
    @observable
    username: string | null = null;

    @computed
    get isAuthenticated() {
        return this.token !== null;
    }

    @action
    async login(username: string, password: string): Promise<boolean> {
        this.username = username;
        const res = await login({userName: username, password})
        if (res.code === 0) {
            this.token = res.data.token;
            message.success("Login successful");
            return true;
        } else if (res.code === 10001) {
            message.error("Incorrect username");
            return false;
        } else if (res.code === 10002) {
            message.error("Incorrect password");
            return false;
        } else {
            message.error("Login failed");
            return false;
        }
    }

    @action
    async register(username: string, password: string): Promise<boolean> {
        const res = await register({userName: username, password})
        if (res.code === 0) {
            message.success("Registration successful");
            return true;
        } else if (res.code === 10003) {
            message.error("Username already exists");
            return false;
        } else {
            message.error("Registration failed");
            return false;
        }
    }

    constructor() {
        makeAutoObservable(this);
    }
}

export const authStore = new AuthStore();