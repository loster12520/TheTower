# Gradle Wrapper

此目录需要包含 `gradle-wrapper.jar` 文件才能使用 `./gradlew` 命令。

## 解决方案

### 方案 1：使用系统 Gradle (推荐)

如果系统已安装 Gradle，直接使用：

```bash
cd C:\code\project\kotlin\TheTower\backend
gradle run
```

### 方案 2：生成 Wrapper

```bash
cd C:\code\project\kotlin\TheTower\backend
gradle wrapper
```

这将自动下载 `gradle-wrapper.jar` 到本目录。

### 方案 3：手动下载

1. 访问 https://services.gradle.org/distributions/gradle-8.5-bin.zip
2. 解压后复制 `gradle-8.5/lib/plugins/gradle-wrapper-8.5.jar` 到本目录，重命名为 `gradle-wrapper.jar`
