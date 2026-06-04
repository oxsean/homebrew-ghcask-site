# ghcask 网站

本仓库用于存放 `ghcask` 的独立产品展示网站。

网站规划为现代、简洁、蓝色主视觉，并同时支持英文和中文用户。

## 当前状态

本仓库已提供静态网站实现。

## 设计稿

- [英文浅色/深色设计稿 v2](design/ghcask-site-en-light-dark-v2.png)
- [中文浅色/深色设计稿 v2](design/ghcask-site-zh-light-dark-v2.png)
- [归档双语设计稿 v1](design/ghcask-site-mockup-v1.png)

## 规格文档

- [产品需求文档](specs/product-requirements.md)
- [实现任务拆解](specs/implementation-tasks.md)

## 产品仓库

- [oxsean/homebrew-ghcask](https://github.com/oxsean/homebrew-ghcask)

## 规划语言支持

- English
- 简体中文

## 预览方式

可直接打开以下文件：

- `index.html` 英文页
- `zh-CN.html` 简体中文页

也可以在仓库根目录启动一个简单静态服务器：

```sh
python3 -m http.server 8000
```

然后访问：

- `http://localhost:8000/`
- `http://localhost:8000/zh-CN.html`

## 许可证

本项目基于 [Apache License 2.0](LICENSE) 许可发布。
