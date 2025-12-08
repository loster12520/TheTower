// 运行时配置

// 全局初始化数据配置，用于 Layout 用户信息和权限初始化
// 更多信息见文档：https://umijs.org/docs/api/runtime-config#getinitialstate
import {RequestConfig} from "umi";

export async function getInitialState(): Promise<{ name: string }> {
    return {name: '@umijs/max'};
}


export const request: RequestConfig = {
    // 全局请求配置
    timeout: 10000,
    errorConfig: {
        errorHandler() {
        },
        errorThrower() {
        }
    },
    requestInterceptors: [
        (url, options) => {
            console.log(`开始请求${url}`, options);
            return {url, options}
        },
    ],
    responseInterceptors: [
        async (response) => {
            console.log("请求结束", response);
            return response;
        },
    ],
}