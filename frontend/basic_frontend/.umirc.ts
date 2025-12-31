import {defineConfig} from '@umijs/max';

export default defineConfig({
    antd: {},
    access: {},
    model: {},
    initialState: {},
    request: {
        dataField: "data"
    },
    proxy: {
        '/api': {
            'target': process.env.API_SERVER ?? "http://localhost:8888",
            'changeOrigin': true,
            'pathRewrite': {'^/api': ''},
        }
    },
    layout: false,
    routes: [
        {
            path: '/',
            redirect: '/home',
        },
        {
            name: 'Home',
            path: '/home',
            component: './Home',
        },
        {
            name: '登录',
            path: '/login',
            component: './Login',
            layout: false
        }
    ],
    npmClient: 'yarn',
    extraBabelPlugins: [
        ["@babel/plugin-proposal-decorators", {"legacy": true}],
        ["@babel/plugin-proposal-class-properties", {"loose": true}]
    ]
});

