import {request} from "@@/plugin-request";

export const login = async (data: {
    username: string,
    password: string
}) => (
    request("/login", {data})
);

export const register = async (data: {
    username: string,
    password: string
}) => (
    request("/register", {data})
);