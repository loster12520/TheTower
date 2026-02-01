# TheTower Backend

Kotlin Ktor 后端项目，用于浏览器 RPA 工作流执行。

## 项目结构

```
backend/
├── src/
│   ├── main/
│   │   ├── kotlin/
│   │   │   └── com/thetower/
│   │   │       ├── Application.kt
│   │   │       ├── config/
│   │   │       │   └── Routing.kt
│   │   │       ├── models/
│   │   │       │   ├── ApiResponse.kt
│   │   │       │   └── Health.kt
│   │   │       └── routes/
│   │   │           └── HealthRoutes.kt
│   │   └── resources/
│   │       ├── application.conf
│   │       └── logback.xml
│   └── test/
│       └── kotlin/
├── build.gradle.kts
├── settings.gradle.kts
└── gradle.properties
```

## 环境要求

- JDK 17 或更高版本
- Gradle 8.5+ (或直接使用 wrapper)

## 快速开始

### 1. 准备 Gradle Wrapper

本项目包含 `gradlew.bat` 和 `gradle-wrapper.properties`，但缺少 `gradle-wrapper.jar`。

**方式一：使用系统已安装的 Gradle**
```bash
gradle run
```

**方式二：生成 Wrapper (推荐)**
```bash
cd C:\code\project\kotlin\TheTower\backend
gradle wrapper
```

### 2. 运行项目

Windows:
```cmd
cd C:\code\project\kotlin\TheTower\backend
gradlew.bat run
```

或使用系统 Gradle:
```cmd
cd C:\code\project\kotlin\TheTower\backend
gradle run
```

### 3. 测试 API

启动后访问健康检查接口：

```bash
curl http://localhost:8080/api/v1/health
```

预期响应：
```json
{
  "requestId": "...",
  "data": {
    "status": "ok"
  },
  "error": null
}
```

## API 文档

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/health | 健康检查 |

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Ktor | 3.0.3 | Web 框架 |
| Kotlin | 2.1.0 | 编程语言 |
| Kotlinx Serialization | 1.6.2 | JSON 序列化 |
| Playwright | 1.40.0 | 浏览器自动化 |
| Logback | 1.4.14 | 日志框架 |

## 配置

编辑 `src/main/resources/application.conf` 修改服务器端口：

```hocon
ktor {
    deployment {
        port = 8080
    }
}
```

## 构建

```bash
# 编译
gradle build

# 运行测试
gradle test

# 打包
gradle shadowJar
```
