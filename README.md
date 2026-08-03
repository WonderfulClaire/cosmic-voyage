# 🚀 COSMIC VOYAGE · 沉浸式宇宙旅行

一个用 **Three.js** 打造的网页端沉浸式宇宙旅行应用：你在地球轨道上苏醒，驾驶飞船自由穿梭于太阳系行星、黑洞、星云、星系之间，**靠近任意天体即可弹出真实科普卡片**，边飞边长知识。

> 灵感：把「自由开飞船 + 多个宇宙地点 + 交互式宇宙知识」三件事合在一起，做一个酷到能发朋友圈的东西。

## ✨ 特性

- **第一人称飞船操控**：WASD 平移、鼠标转视角、Shift 引擎加速，自由飞行无重力束缚
- **12 个真实宇宙地点**：地球 / 火星 / 木星 / 土星（带光环）/ 太阳 / 黑洞（吸积盘 shader）/ 猎户座大星云 / 仙女座星系 / 比邻星 b / 小行星带 / 脉冲星 / 蟹状星云
- **靠近即学**：飞近天体自动提示，按 `E` 弹出该天体的中文科普卡片（含一句话速记 + 多条知识点）
- **程序化视觉**：星空粒子、发光星云、土星环、黑洞吸积盘、脉冲星光束、辉光（Bloom）后处理，全部代码生成，无需任何外部素材
- **零后端纯静态**：一个网页直接跑，方便部署到 GitHub Pages

## 🎮 操作

| 按键 | 功能 |
|------|------|
| `W` / `S` | 前进 / 后退 |
| `A` / `D` | 左移 / 右移 |
| `空格` / `C` | 上升 / 下降 |
| `鼠标` | 转动视角（先点击画面锁定指针） |
| `Shift` | 引擎加速 |
| `E` | 靠近天体时查看科普卡片 |
| `H` | 开关操作帮助 |
| `ESC` | 解除鼠标锁定 |

## ▶️ 运行

### 在线玩（部署后）
访问 GitHub Pages 链接即可，无需安装。

### 本地运行
因为用 ES Module + importmap，需通过本地服务器打开（不能直接双击 `file://`）：

```bash
cd cosmic-voyage
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

Three.js 通过 CDN（jsdelivr）加载，首次运行需联网。

## 🛠️ 技术栈

- [Three.js](https://threejs.org/) r160（CDN importmap）
- EffectComposer + UnrealBloomPass（辉光后处理）
- PointerLockControls（第一人称视角）
- 程序化纹理（Canvas 2D）/ 程序化几何体 / GLSL 着色器（黑洞吸积盘）

## 📁 结构

```
cosmic-voyage/
├── index.html      # 页面骨架 + HUD / 卡片 DOM + importmap
├── styles.css      # 座舱 HUD / 科普卡片样式
├── main.js         # 场景、飞船控制、天体生成、交互逻辑
├── knowledge.js    # 宇宙地点与科普数据（可自由增删地点）
└── README.md
```

想加自己的星球？编辑 `knowledge.js` 的 `LOCATIONS` 数组即可。

---

Made with ❤️ for space & curiosity.
