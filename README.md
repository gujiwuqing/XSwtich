# FliggySwitch

一个用于HTTP请求拦截与重定向的浏览器扩展插件，使用Ant Design 5构建界面。

## 功能特点

- 请求拦截与修改：拦截浏览器发出的HTTP/HTTPS请求，并根据规则修改这些请求
- 请求重定向：将请求重定向到本地文件或其他URL
- 接口数据模拟：允许开发者将API请求重定向到本地的mock数据
- 规则组管理：创建不同的规则组，并根据需要启用或禁用

## 开发环境准备

```bash
# 安装依赖
tnpm install

# 开发模式构建
tnpm run dev

# 生产环境构建
tnpm run build
```

## 使用方法

1. 运行 `tnpm run build` 生成 dist 目录
2. 在Chrome浏览器中打开 chrome://extensions/
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目中的 dist 目录

## 使用案例

### 1. URL重定向

将测试环境的API请求重定向到生产环境：
- 匹配规则：`https://test-api.example.com/(.*)` 
- 重定向到：`https://api.example.com/$1`

### 2. 本地文件映射

将远程CSS文件请求映射到本地文件：
- 匹配规则：`https://cdn.example.com/styles/main.css`
- 重定向到：`/Users/username/projects/mysite/css/main.css`

### 3. Mock数据

使用本地JSON数据响应API请求：
- 匹配规则：`https://api.example.com/users/list`
- 重定向到：`{"users":[{"id":1,"name":"Test User"}]}`

## 注意事项

- 在Chrome中，需要启用开发者模式才能加载本地扩展
- 某些浏览器API可能需要特定权限，请参考manifest.json中的permissions字段
- 如需修改图标，请替换src/assets目录中的icon文件