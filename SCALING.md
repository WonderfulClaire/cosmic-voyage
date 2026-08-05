# 扩容与高可用方案 · COSMIC VOYAGE

> 目标：流量上来不崩、国内也能打开、将来火了接得住；**全程不花钱**。

## 1. 现状与架构判断

- **纯前端 Three.js 单页应用**：渲染、物理、音效全在访客自己的浏览器里跑，**服务端不做任何计算**。
- 托管：GitHub Pages（push `main` 自动发布根目录）。
- 依赖：Three.js 已从外部 CDN（jsDelivr）改为**仓库内自带**（`vendor/three/`），消除第三方单点故障。
- 缓存：已加 Service Worker（`sw.js`），同源静态资源 stale-while-revalidate，HTML 网络优先 + 离线兜底。

### 为什么这套架构天生抗并发
静态资源分发没有"服务器算活"，每个访客独立渲染。传统意义上"并发打爆后端"在这里**不会发生**——服务器只负责把文件发给浏览器。
真正的风险只有两类：**(a) 带宽上限**、**(b) 国内可达性**。

## 2. 已做的免费加固

| 措施 | 作用 |
|------|------|
| 自带 Three.js（`vendor/`） | 不再依赖外部 CDN，全站自包含，少一个故障点 |
| Service Worker 缓存（`sw.js`） | 重复访问秒开；源站带宽大幅下降（首屏后再访问近乎 0 出网）；断网也能进首页 |

## 3. 流量真起来：免费迁移到 Cloudflare Pages

GitHub Pages 有**软带宽上限（约 100GB/月）**，且**国内常被墙/很慢**（GFW）。换成 **Cloudflare Pages**：

- 免费、**无带宽上限**、自带 **DDoS 防护** 与 **全球 CDN**；
- **国内可达性远好于 GitHub Pages**；
- 自动签发 SSL、可绑自定义域名；
- 仍从 GitHub 仓库自动部署，工作流不变。

**迁移步骤（约 5 分钟）：**
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → 连接 GitHub 仓库 `WonderfulClaire/cosmic-voyage`。
2. 构建设置：**Build command 留空**，**Build output directory 填 `/`**（根目录即站点）。
3. （可选）**Custom domains** 绑定你的域名，Cloudflare 自动签发证书。
4. 本项目已含 `_headers`（长缓存静态资源、HTML 不缓存），Cloudflare 部署后自动生效。
5. 之后每次 push `main` 仍自动部署。

## 4. 将来要"不止前端"（免费 serverless 后端）

当要加这些功能时——**共享明信片相册 / 全球排行榜 / 联系表单 / 轻量 API**——用 Cloudflare 全家桶，**全部 serverless、按需扩缩、免费额度巨大、火了也接得住**：

| 组件 | 用途 | 免费额度 |
|------|------|----------|
| **Cloudflare Workers** | 边缘函数（API、表单、相册后端） | 100k 请求/天、10ms CPU/请求，自动扩到百万级 |
| **Cloudflare R2** | 对象存储，存用户上传的照片/明信片 | 10GB 存储、**无出口流量费** |
| **Cloudflare KV / D1** | 边缘键值 / SQLite，存排行榜、探索进度 | KV 免费额度很大；D1 免费档够用 |

这些都不需要你管服务器、不用运维，按量付费，不火不花。

## 5. 备选免费托管

Vercel / Netlify / Deno Deploy 能力类似；但 **Cloudflare 在「国内可达 + 免出口流量费」上最稳**，优先推荐。

## 6. 监控与告警（可选，免费）

- Cloudflare Analytics：看实时流量与缓存命中率。
- 免费 uptime 监控（如 UptimeRobot）：盯可用性，挂了第一时间知道。

## 7. 成本现实

免费层即可支撑**每月数百万 PV**。只有当你要：自定义企业域名邮箱、超大对象存储、或重度后端计算时，才可能花钱——且都是按需付费，**不火不花**。

---
**结论**：现在这套已经是"静态站点能扛流量"的顶配；真要上规模，按第 3 节迁移到 Cloudflare Pages（依旧免费），后端按第 4 节用 Workers + R2 接住即可。安心做内容，流量交给 CDN。
