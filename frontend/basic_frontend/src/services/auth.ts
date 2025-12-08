import {request} from "@@/plugin-request";

export const login = async (data: {
    userName: string,
    password: string
}) => (
    request("/api/login", {
        method: "POST",
        data
    })
);

export const register = async (data: {
    userName: string,
    password: string
}) => (
    request("/api/register", {
        method: "POST",
        data
    })
);