# OpenHW Lab · openhwlab.com

> 开放硬件实验室 —— 让吃灰的旧硬件重获新生。
> Open source hardware lab — give idle hardware a second life.

本仓库是 **OpenHW Lab 官网源码**（纯静态站点，中英双语，无构建依赖）。

- 线上地址：<https://www.openhwlab.com>（临时：<https://openhwlab.pages.dev>）
- 站点理念：**开放、开源、共创、共享**

## 目录结构

```
index.html        首页
projects.html     全部项目
downloads.html    下载中心（含 SHA-256）
docs.html         教程与文档
about.html        关于 / 许可 / 免责
en/               英文版（同 5 页）
assets/           style.css · logo.svg
dl/               安装包（4 个方案）
robots.txt / sitemap.xml   SEO（含中英 hreflang）
```

## 本地预览

```bash
cd website
python3 -m http.server 8080
# 打开 http://127.0.0.1:8080/
```

## 部署

静态站点，任意静态托管即可。我们使用 **Cloudflare Pages**（自定义域 `www.openhwlab.com`，自动 HTTPS）。
把本目录推到 GitHub 后，可用 Cloudflare Pages 的 “Connect to Git” 自动发布。

## 开源项目

| 方案 | 说明 |
|---|---|
| TV Box → Game Console | 机顶盒改游戏机（8 款小游戏 + 学科/考证/教学，1–9 人同屏） |
| TV Box → Mini PC | 机顶盒改电脑主机（桌面 + 浏览器 + 互传 + U 盘） |
| TV Box → Surveillance NVR | 机顶盒改监控录像主机（直播 + 循环录像 + AI 识别 + 告警） |
| TV Box → Print Server | 机顶盒改打印机服务器（网络打印 + AirPrint + 扫码传件） |

安装包见站点的 `dl/` 目录或 `downloads.html`。

## 许可

[MIT License](LICENSE) · 仅供学习与个人使用。
