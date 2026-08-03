// knowledge.js —— 宇宙地点与科普知识数据
// 整个宇宙被组织成 6 大区域（宇宙阶梯），从地球一直延伸到可观测宇宙边缘。
// 每个地点：id / 中文名 / 英文名 / 类型 / 所属区域 / 三维坐标 / 视觉半径 / 主色 / 科普卡片
// 坐标为统一的"游戏内宇宙尺度"单位（非真实天文距离，仅为空间布局）。
//
// 视觉类型标记（供 main.js 的构建器识别）：
//   isStar 恒星 · isPlanet 行星(默认) · isMoon 卫星 · isRing 带环
//   isDwarf 矮行星 · isBelt 小行星带 · isComet 彗星
//   isNebula 星云/遗迹 · isPlanetary 行星状星云 · isRedGiant 红巨星 · isWhiteDwarf 白矮星
//   isBlackHole 黑洞 · isPulsar 脉冲星 · isNeutronBinary 中子星双星 · isMagnetar 磁星
//   isGalaxy 星系/矮星系 · isGlobular 球状星团 · isScatter 疏散星团
//   isQuasar 类星体(活动星系核) · isCMB 宇宙微波背景

export const ZONES = [
  {
    id: 'solar', name: '太阳系', nameEn: 'Solar System',
    desc: '我们的母星系：一颗恒星、八颗行星，以及无数冰与石。人类全部故事都发生在这里。',
    center: [0, 0, 0], view: [0, 300, 6500],
  },
  {
    id: 'nearby', name: '近邻恒星系', nameEn: 'Nearby Stars',
    desc: '离开太阳系后最先遇见的邻居。其中藏着已知最近的系外世界，是未来星际航行最可能的目标。',
    center: [0, -1500, 17000], view: [0, -1500, 14500],
  },
  {
    id: 'nebula', name: '星云与遗迹', nameEn: 'Nebulae & Remnants',
    desc: '恒星的生与死：气体尘埃中诞生新星，爆炸后留下绚烂残骸与致密余烬。',
    center: [16000, 1500, 6000], view: [16000, 1500, 3500],
  },
  {
    id: 'extreme', name: '致密与极端', nameEn: 'Compact & Extreme',
    desc: '引力与磁场的极端实验室：黑洞、脉冲星、磁星，把物理定律逼到极限。',
    center: [-5000, -3000, 12000], view: [-5000, -3000, 9500],
  },
  {
    id: 'galaxy', name: '银河系', nameEn: 'The Galaxy',
    desc: '我们所在的恒星之城：上千亿颗恒星、球状星团，以及正中心的超大质量黑洞。',
    center: [-15000, 2500, -5000], view: [-15000, 2500, -8000],
  },
  {
    id: 'deep', name: '宇宙深处', nameEn: 'Deep Universe',
    desc: '跨越数百万光年：邻近星系、喷吐 jets 的类星体，以及包裹一切的宇宙微波背景——可观测宇宙的边界。',
    center: [3000, -4000, -19000], view: [3000, -4000, -21500],
  },
];

export const LOCATIONS = [
  /* ============================ Z1 太阳系 ============================ */
  {
    id: 'sun', name: '太阳', nameEn: 'The Sun', type: '恒星', zone: 'solar',
    position: [0, 0, 0], radius: 800, color: 0xffcc33, accent: 0xfff2a8, isStar: true,
    facts: {
      title: '太阳 · 系统的心脏',
      tldr: '一颗普通的 G 型黄矮星，却占了整个太阳系 99.86% 的质量，是地球一切能量的来源。',
      points: [
        '占太阳系总质量的 99.86%，靠核聚变把氢变成氦发光发热。',
        '核心温度约 1500 万℃，表面约 5500℃。',
        '阳光跑到地球大约需要 8 分 20 秒。',
        '它是一颗“中等个头”的恒星，寿命约 100 亿年，现在约 46 亿岁。',
      ],
    },
  },
  {
    id: 'mercury', name: '水星', nameEn: 'Mercury', type: '岩石行星', zone: 'solar',
    position: [2100, 0, 1500], radius: 70, color: 0x9a8c7a, accent: 0xc9bda8,
    facts: {
      title: '水星 · 炙烤与冰封',
      tldr: '离太阳最近的行星，白天能熔化铅，两极陨石坑里却藏着永不消融的冰。',
      points: [
        '距太阳仅约 5800 万 km，公转一圈只要 88 天。',
        '没有大气保温，昼夜温差从 430℃ 直降到 -180℃。',
        '表面布满陨石坑，长得很像被放大的月球。',
        '两极永久阴影坑里探测到了水冰，是未来驻留的潜在资源。',
      ],
    },
  },
  {
    id: 'venus', name: '金星', nameEn: 'Venus', type: '岩石行星', zone: 'solar',
    position: [2600, 200, 2600], radius: 120, color: 0xe8c07a, accent: 0xfff0c0,
    facts: {
      title: '金星 · 地狱孪生星',
      tldr: '大小和地球几乎一样，却被浓密二氧化碳大气裹成 460℃ 的温室炼狱，是太阳系最热的行星。',
      points: [
        '浓厚的二氧化碳大气造成失控温室效应，表面比水星还热。',
        '大气压是地球的约 90 倍，相当于深海 900 米处的压力。',
        '自转极慢且逆向，一天比一年还长。',
        '常被称作“地球的姐妹星”，却提醒我们气候可以有多脆弱。',
      ],
    },
  },
  {
    id: 'earth', name: '地球', nameEn: 'Earth', type: '岩石行星', zone: 'solar',
    position: [3200, 0, 0], radius: 180, color: 0x3a7bd5, accent: 0x7fd4ff,
    facts: {
      title: '地球 · 我们的蓝色家园',
      tldr: '目前已知宇宙里唯一确认有生命的星球，71% 表面被液态水覆盖。',
      points: [
        '半径约 6371 km，是太阳系里密度最大的行星。',
        '表面约 71% 被海洋覆盖，从太空看是一颗蓝色弹珠。',
        '地核铁液流动产生磁场，像盾牌一样挡住太阳风保护生命。',
        '距离太阳约 1 个天文单位，正好落在宜居带里。',
      ],
    },
  },
  {
    id: 'moon', name: '月球', nameEn: 'The Moon', type: '卫星', zone: 'solar',
    position: [3450, 80, 200], radius: 48, color: 0xbdbdbd, accent: 0xe8e8e8, isMoon: true,
    facts: {
      title: '月球 · 地球的伴侣',
      tldr: '地球唯一的天然卫星，用引力稳住地轴倾角，也用潮汐塑造着海洋。',
      points: [
        '半径约 1737 km，约为地球的四分之一。',
        '潮汐锁定让我们永远只看到它的一面（近地面）。',
        '没有大气，昼夜温差极大，表面布满古老陨石坑。',
        '阿波罗计划曾 6 次载人登月，是人类至今最远足迹。',
      ],
    },
  },
  {
    id: 'mars', name: '火星', nameEn: 'Mars', type: '岩石行星', zone: 'solar',
    position: [6400, 600, -1800], radius: 120, color: 0xc1440e, accent: 0xff8a5c,
    facts: {
      title: '火星 · 红色星球',
      tldr: '因为表面富含氧化铁（铁锈）而泛红，是人类最想登陆的下一颗行星。',
      points: [
        '表面的红色来自遍布的氧化铁，也就是铁锈。',
        '拥有太阳系最高的山——奥林匹斯山，高约 22 km。',
        '一天约 24.6 小时，和地球非常接近。',
        '远古曾有河流湖泊，现在两极是干冰（固态二氧化碳）。',
      ],
    },
  },
  {
    id: 'jupiter', name: '木星', nameEn: 'Jupiter', type: '气态巨行星', zone: 'solar',
    position: [-5200, 400, 3200], radius: 460, color: 0xd8a47f, accent: 0xffe0b3,
    facts: {
      title: '木星 · 太阳系的巨人',
      tldr: '质量是其他所有行星加起来两倍半还多的气态巨行星，大红斑是一场刮了数百年的风暴。',
      points: [
        '太阳系最大的行星，质量约为地球的 318 倍。',
        '“大红斑”是比地球还大的巨型风暴，持续了至少 300 年。',
        '主要由氢和氦组成，没有实体表面，是一颗“失败的恒星”。',
        '强大引力像吸尘器，替内行星挡下大量彗星撞击。',
      ],
    },
  },
  {
    id: 'saturn', name: '土星', nameEn: 'Saturn', type: '气态巨行星', zone: 'solar',
    position: [-7600, -300, -2600], radius: 400, color: 0xe3c98b, accent: 0xfff1c9, ring: true,
    facts: {
      title: '土星 · 戴草帽的行星',
      tldr: '以壮观光环闻名，光环由无数冰与岩石碎块组成；它密度比水还小，理论上能浮在水面。',
      points: [
        '最醒目的特征是环绕赤道的光环，由冰粒和岩石碎块构成。',
        '平均密度小于水，是太阳系唯一“能浮在水上”的行星。',
        '光环里有著名的“卡西尼缝”，是卫星引力清出来的空隙。',
        '拥有 140 多颗卫星，土卫六（泰坦）有浓密大气和液态甲烷湖。',
      ],
    },
  },
  {
    id: 'uranus', name: '天王星', nameEn: 'Uranus', type: '冰巨星', zone: 'solar',
    position: [-9000, 200, 3000], radius: 300, color: 0x9fe3e3, accent: 0xc8f4f4,
    facts: {
      title: '天王星 · 躺着自转的冰巨星',
      tldr: '一颗淡蓝绿色的冰巨星，自转轴几乎躺倒在地，像在轨道上“滚着走”。',
      points: [
        '大气中的甲烷吸收红光，让它呈现独特的青蓝色。',
        '自转轴倾斜约 98°，几乎是“侧躺”着绕太阳公转。',
        '主要由水、氨、甲烷冰组成，因此是“冰巨星”而非气态巨行星。',
        '也有暗淡的行星环和十几颗卫星。',
      ],
    },
  },
  {
    id: 'neptune', name: '海王星', nameEn: 'Neptune', type: '冰巨星', zone: 'solar',
    position: [-11000, -300, -1500], radius: 290, color: 0x3b5bdb, accent: 0x8fb0ff,
    facts: {
      title: '海王星 · 最远的蓝色风暴',
      tldr: '太阳系最外侧的行星，深蓝色、风暴狂暴，是靠着数学计算“算出来”才被发现的。',
      points: [
        '距太阳约 45 亿 km，是肉眼绝对看不见的远疆。',
        '拥有太阳系最强的风，时速可超过 2000 km。',
        '是唯一先由数学预测、再被望远镜证实的行星。',
        '大暗斑曾是与木星大红斑类似的巨型风暴。',
      ],
    },
  },
  {
    id: 'pluto', name: '冥王星', nameEn: 'Pluto', type: '矮行星', zone: 'solar',
    position: [3000, -800, 9000], radius: 60, color: 0xc9b8a8, accent: 0xe8dcc8, isDwarf: true,
    facts: {
      title: '冥王星 · 被降级的边疆',
      tldr: '曾是第九大行星，2006 年被重新归类为“矮行星”，开启了对太阳系边缘柯伊伯带的认识。',
      points: [
        '轨道又斜又扁，有时比海王星还靠近太阳。',
        '2015 年新视野号飞掠，拍到它心形的氮冰平原。',
        '有一颗相对很大的卫星“冥卫一”，二者像双行星互绕。',
        '是柯伊伯带成千上万冰质小天体的代表。',
      ],
    },
  },
  {
    id: 'ceres', name: '谷神星', nameEn: 'Ceres', type: '矮行星', zone: 'solar',
    position: [2000, 200, 7000], radius: 70, color: 0x9a8c7a, accent: 0xc9bda8, isDwarf: true,
    facts: {
      title: '谷神星 · 小行星带的王',
      tldr: '小行星带里最大的天体，也是唯一被正式认定的矮行星，地下可能藏着咸水海洋。',
      points: [
        '直径约 940 km，占整个小行星带质量的三分之一。',
        '表面有神秘的亮斑，是反射阳光的盐类沉积。',
        '近年证据表明它冰壳之下可能有液态咸水。',
        '黎明号探测器曾长期环绕它细致观测。',
      ],
    },
  },
  {
    id: 'belt', name: '小行星带', nameEn: 'Asteroid Belt', type: '小天体群', zone: 'solar',
    position: [2000, 200, 7000], radius: 600, color: 0x9a8c7a, accent: 0xc9bda8, isBelt: true,
    facts: {
      title: '小行星带 · 太阳系的碎石带',
      tldr: '分布在火星与木星轨道之间，上百万颗岩石碎块，但总质量还不如月球，飞船穿过去其实很空旷。',
      points: [
        '位于火星和木星轨道之间，是太阳系早期没聚成行星的“建筑垃圾”。',
        '包含上百万颗小行星，但加起来的总质量还不到月球。',
        '最大的谷神星（Ceres）已被列为矮行星。',
        '天体之间平均距离极远，飞船穿行并不像电影里那样密集碰撞。',
      ],
    },
  },
  {
    id: 'halley', name: '哈雷彗星', nameEn: 'Halley’s Comet', type: '彗星', zone: 'solar',
    position: [5000, 400, 10000], radius: 40, color: 0xcfcfcf, accent: 0x9fd8ff, isComet: true,
    facts: {
      title: '哈雷彗星 · 定时回归的访客',
      tldr: '每约 76 年回归一次，是肉眼可见、周期最短的著名彗星，拖着因阳光蒸发形成的长尾。',
      points: [
        '由冰和尘埃组成，靠近太阳时蒸发喷出气体与尘埃，形成尾巴。',
        '彗尾永远背向太阳，可分蓝色的离子尾和白色的尘埃尾。',
        '上次回归是 1986 年，下次约在 2061 年。',
        '哈雷最早证明了彗星是绕太阳运行的周期性天体。',
      ],
    },
  },

  /* ============================ Z2 近邻恒星系 ============================ */
  {
    id: 'proxima', name: '比邻星 b', nameEn: 'Proxima b', type: '系外行星', zone: 'nearby',
    position: [0, -1500, 17000], radius: 90, color: 0x8a5a3c, accent: 0xffb37a,
    facts: {
      title: '比邻星 b · 最近的系外世界',
      tldr: '距离地球仅 4.24 光年，是离我们最近的太阳系外行星，且恰好落在恒星的宜居带里。',
      points: [
        '距地球约 4.24 光年，是已知离太阳最近的系外行星。',
        '绕着红矮星“比邻星”运行，正好落在可能允许液态水的宜居带。',
        '质量至少是地球的 1.3 倍，可能是一颗岩石行星。',
        '因为母恒星黯淡，它一年只有约 11 天。',
      ],
    },
  },
  {
    id: 'trappist1e', name: 'TRAPPIST-1e', nameEn: 'TRAPPIST-1e', type: '系外行星', zone: 'nearby',
    position: [-1200, -1000, 16200], radius: 85, color: 0x4a8c6a, accent: 0x9fe0b0,
    facts: {
      title: 'TRAPPIST-1e · 七姐妹之一',
      tldr: '一颗围绕超冷红矮星运行的岩石行星，处在宜居带中央，是寻找外星生命的头号候选。',
      points: [
        '属于 TRAPPIST-1 系统，那里共有 7 颗地球大小的行星。',
        '距离我们约 40 光年，系统紧凑得能并排看到邻居行星。',
        'e 位于宜居带中部，很可能表面有液态水。',
        '多颗行星彼此引力拉扯，为研究行星大气提供天然实验室。',
      ],
    },
  },
  {
    id: 'kepler452b', name: '开普勒-452b', nameEn: 'Kepler-452b', type: '系外行星', zone: 'nearby',
    position: [1200, -2000, 17800], radius: 110, color: 0x6a8cd8, accent: 0xaec8ff,
    facts: {
      title: '开普勒-452b · “地球 2.0”',
      tldr: '绕着类太阳恒星运行、周期约 385 天的系外行星，被称为最接近地球孪生兄弟的世界。',
      points: [
        '2015 年发现，公转一圈约 385 天，与地球年惊人相似。',
        '母恒星与太阳同类型、同年龄，让它格外受关注。',
        '半径约地球的 1.6 倍，可能是一颗“超级地球”。',
        '距地球约 1400 光年，远得暂时无法探测其大气。',
      ],
    },
  },
  {
    id: 'hotjupiter', name: '51 Pegasi b', nameEn: '51 Peg b', type: '热木星', zone: 'nearby',
    position: [800, -800, 15800], radius: 160, color: 0xd87a3a, accent: 0xffc08a,
    facts: {
      title: '51 Pegasi b · 炽热的气态巨行星',
      tldr: '人类发现的第一颗绕类太阳恒星的系外行星，是一颗贴在恒星脸旁的“热木星”，颠覆了行星形成理论。',
      points: [
        '1995 年发现，直接催生了诺贝尔物理学奖。',
        '质量接近木星，却离恒星极近，表面温度高达上千摄氏度。',
        '公转一圈只要 4 天多，被称为“热木星”。',
        '它的存在逼科学家重新思考行星如何形成与迁移。',
      ],
    },
  },
  {
    id: 'reddwarf', name: '巴纳德星', nameEn: 'Barnard’s Star', type: '红矮星', zone: 'nearby',
    position: [-800, -2200, 17200], radius: 130, color: 0xff6a4a, accent: 0xff9a7a, isStar: true,
    facts: {
      title: '巴纳德星 · 跑得最快的邻星',
      tldr: '距地球约 6 光年的红矮星，是肉眼看不见、却在天空中移动最快的恒星，也是长寿的低质量恒星。',
      points: [
        '红矮星是宇宙中最常见的恒星类型，又暗又长寿。',
        '它以每秒约 110 km 的视向速度“横穿”天空，故得名“跑星”。',
        '寿命可达数千亿年，远长于当前宇宙年龄。',
        '周围疑似有行星，是近邻系外研究的重点目标。',
      ],
    },
  },

  /* ============================ Z3 星云与遗迹 ============================ */
  {
    id: 'orion', name: '猎户座大星云', nameEn: 'Orion Nebula', type: '恒星摇篮', zone: 'nebula',
    position: [16000, 1500, 6000], radius: 520, color: 0xff6699, accent: 0x99ccff, isNebula: true,
    facts: {
      title: '猎户座大星云 · 恒星的摇篮',
      tldr: '距离我们约 1344 光年的气体尘埃云，新的恒星正在里面诞生，是肉眼可见的“宇宙产房”。',
      points: [
        '编号 M42，是距地球最近的大质量恒星形成区之一。',
        '距离约 1344 光年，晴朗夜空用肉眼就能看到一小团模糊光斑。',
        '云气里坍缩的气体团正在点燃核聚变，诞生新一代恒星。',
        '中心“梯形星团”几颗炽热年轻恒星把周围气体照得发光。',
      ],
    },
  },
  {
    id: 'crab', name: '蟹状星云', nameEn: 'Crab Nebula', type: '超新星遗迹', zone: 'nebula',
    position: [15000, 2500, 5500], radius: 480, color: 0x66ffcc, accent: 0xff6688, isNebula: true,
    facts: {
      title: '蟹状星云 · 千年前的爆炸',
      tldr: '公元 1054 年一颗恒星爆炸留下的膨胀残骸云，中心是一颗仍在快速转动的脉冲星。',
      points: [
        '源自公元 1054 年的超新星爆发，当时中外都有记录。',
        '爆发产生的膨胀气体云，如今已扩散到约 11 光年宽。',
        '中心藏有一颗每秒自转约 30 次的年轻脉冲星。',
        '它在几乎全波段电磁波都明亮，是天文学家的“标准烛光”。',
      ],
    },
  },
  {
    id: 'eagle', name: '鹰状星云·创生之柱', nameEn: 'Eagle Nebula', type: '星云', zone: 'nebula',
    position: [17000, 800, 6800], radius: 420, color: 0x88bbff, accent: 0xffd9a0, isNebula: true,
    facts: {
      title: '鹰状星云 · 创生之柱',
      tldr: '哈勃最著名的照片主角：几根高耸的气体尘埃柱，柱顶正在诞生新的恒星，像宇宙里的“孵化室”。',
      points: [
        '位于约 7000 光年外，是巨大的恒星新生区。',
        '“创生之柱”是密度较高的气体柱，能抵御辐射而留存。',
        '柱顶的致密团块在引力下坍缩，点燃新的恒星。',
        '年轻恒星的紫外辐射正缓慢“雕刻”并蒸发这些柱子。',
      ],
    },
  },
  {
    id: 'rosette', name: '玫瑰星云', nameEn: 'Rosette Nebula', type: '星云', zone: 'nebula',
    position: [15500, 2200, 5000], radius: 400, color: 0xff6a8c, accent: 0xffd0e0, isNebula: true,
    facts: {
      title: '玫瑰星云 · 绽放的星花',
      tldr: '一片形如玫瑰花瓣的发射星云，中央年轻星团吹出空腔，把气体推开成花瓣状的壳。',
      points: [
        '距地球约 5000 光年，因玫瑰般的结构得名。',
        '中心年轻的 O、B 型恒星用星风挖出一个巨大的空腔。',
        '空腔边缘被压缩的气体正是新一轮恒星诞生的温床。',
        '在长时间曝光的望远镜照片里尤为绚丽。',
      ],
    },
  },
  {
    id: 'helix', name: '螺旋星云', nameEn: 'Helix Nebula', type: '行星状星云', zone: 'nebula',
    position: [16500, 500, 6400], radius: 260, color: 0x66e0ff, accent: 0xffd9ff, isPlanetary: true,
    facts: {
      title: '螺旋星云 · 上帝之眼',
      tldr: '一颗类太阳恒星死亡时抛出的外层气壳，从地球看像一只巨大的蓝色眼睛，被称为“上帝之眼”。',
      points: [
        '是“行星状星云”，与行星无关，是恒星晚年的绚丽谢幕。',
        '中心的白矮星正以强烈紫外光点燃周围的气体壳。',
        '距地球约 655 光年，是离我们最近的此类星云之一。',
        '预示了约 50 亿年后太阳可能的结局。',
      ],
    },
  },
  {
    id: 'betelgeuse', name: '参宿四', nameEn: 'Betelgeuse', type: '红巨星', zone: 'nebula',
    position: [14800, 1800, 6200], radius: 320, color: 0xff5533, accent: 0xffa080, isRedGiant: true,
    facts: {
      title: '参宿四 · 将逝的巨星',
      tldr: '猎户座肩膀上一颗红超巨星，体积能吞掉木星轨道，随时可能在人类有生之年以超新星爆发谢幕。',
      points: [
        '半径约为太阳的 700 倍，是一颗红超巨星。',
        '质量足够大，终结时会以超新星形式炸开。',
        '2019 年曾莫名变暗，引发“是否即将爆发”的全球关注。',
        '距离约 548 光年，即便爆发对地球也基本无害。',
      ],
    },
  },
  {
    id: 'siriusB', name: '天狼星 B', nameEn: 'Sirius B', type: '白矮星', zone: 'nebula',
    position: [17200, 1200, 5600], radius: 70, color: 0xcfe6ff, accent: 0xffffff, isWhiteDwarf: true,
    facts: {
      title: '天狼星 B · 恒星的残骸',
      tldr: '夜空中最亮恒星天狼星的伴星，是一颗地球大小却和太阳差不多重的白矮星——恒星死亡后的致密余烬。',
      points: [
        '白矮星是像太阳这类恒星演化的最终归宿之一。',
        '体积接近地球，质量却接近太阳，密度高得惊人。',
        '一茶匙白矮星物质重达数吨。',
        '它靠残余热量缓慢冷却，最终会变成冰冷的“黑矮星”。',
      ],
    },
  },
  {
    id: 'sn1987a', name: 'SN 1987A', nameEn: 'SN 1987A', type: '超新星遗迹', zone: 'nebula',
    position: [15800, 300, 7000], radius: 300, color: 0xff8844, accent: 0x66ddff, isNebula: true,
    facts: {
      title: 'SN 1987A · 近代最亮的爆炸',
      tldr: '1987 年 human 肉眼可见的超新星，是现代天文学第一次用中微子“提前”捕捉到的恒星死亡。',
      points: [
        '1987 年在大麦哲伦云爆发，是近 400 年最亮的超新星。',
        '探测器先收到爆炸喷出的中微子，再看到光——证实了理论。',
        '爆炸前抛出的物质形成三个发光环，结构罕见。',
        '为研究中微子、元素合成提供了第一手样本。',
      ],
    },
  },

  /* ============================ Z4 致密与极端 ============================ */
  {
    id: 'blackhole', name: '黑洞', nameEn: 'Black Hole', type: '黑洞', zone: 'extreme',
    position: [-5000, -3000, 12000], radius: 260, color: 0x000000, accent: 0xff6a00, isBlackHole: true,
    facts: {
      title: '黑洞 · 连光也逃不掉',
      tldr: '引力强到连光都无法逃逸的天体；周围旋动的吸积盘因高速摩擦被加热到发光明亮。',
      points: [
        '“事件视界”是黑洞的边界，一旦越过连光都跑不出来。',
        '恒星级黑洞由大质量恒星燃料耗尽后坍缩形成。',
        '吸积盘里的物质高速旋转摩擦，温度高达数百万度，发出强烈 X 光。',
        '2019 年 EHT 拍下首张黑洞照片（M87 中心）。',
      ],
    },
  },
  {
    id: 'pulsar', name: '脉冲星', nameEn: 'Pulsar', type: '中子星', zone: 'extreme',
    position: [-4000, -2200, 12500], radius: 70, color: 0x66e0ff, accent: 0xffffff, isPulsar: true,
    facts: {
      title: '脉冲星 · 宇宙里的灯塔',
      tldr: '快速自转的中子星，像灯塔一样每转一圈就扫来一束射电脉冲，密度高到一茶匙物质重达十亿吨。',
      points: [
        '本质是中子星：大质量恒星超新星爆发后的致密残骸。',
        '每秒自转可达上百次，磁场强到地球的万亿倍。',
        '磁极喷出的辐射束随自转扫过地球，被接收成像钟表一样规律的脉冲。',
        '一茶匙中子星物质质量约相当于十亿吨。',
      ],
    },
  },
  {
    id: 'neutronbinary', name: '双中子星', nameEn: 'Neutron Star Binary', type: '中子星双星', zone: 'extreme',
    position: [-5500, -3500, 11500], radius: 80, color: 0xaad4ff, accent: 0xff88aa, isNeutronBinary: true,
    facts: {
      title: '双中子星 · 引力波之源',
      tldr: '两颗中子星互绕螺旋，最终并合喷出引力波与黄金——宇宙中重元素的诞生地之一。',
      points: [
        '两颗致密中子星互相绕转，因引力波辐射而逐渐靠近。',
        '2017 年首次同时探测到引力波和对应伽马暴（GW170817）。',
        '并合瞬间抛出的物质被认为锻造了大量金、铂等重元素。',
        '是验证广义相对论与宇宙学的重要天然实验。',
      ],
    },
  },
  {
    id: 'magnetar', name: '磁星', nameEn: 'Magnetar', type: '磁星', zone: 'extreme',
    position: [-4500, -2800, 12800], radius: 60, color: 0xff77ff, accent: 0xffffff, isMagnetar: true,
    facts: {
      title: '磁星 · 宇宙最强磁场',
      tldr: '一种磁场强到地球万亿亿倍的中子星，偶尔的“星震”能向全星系释放毁灭性的高能辐射。',
      points: [
        '磁场强度可达 10^15 高斯，是普通中子星的上千倍。',
        '磁场扭曲地壳引发“星震”，喷发强烈伽马射线暴。',
        '2004 年一次磁星爆发，即便相距 5 万光年也扰动了对地磁场。',
        '是已知宇宙中磁场最强的天体。',
      ],
    },
  },

  /* ============================ Z5 银河系 ============================ */
  {
    id: 'sgrastar', name: '人马座 A*', nameEn: 'Sagittarius A*', type: '星系中心黑洞', zone: 'galaxy',
    position: [-15000, 2500, -5000], radius: 300, color: 0x000000, accent: 0xffaa33, isBlackHole: true,
    facts: {
      title: '人马座 A* · 银心巨兽',
      tldr: '潜伏在银河系正中心的超大质量黑洞，质量约 400 万个太阳，用引力统帅着整座星系的运行。',
      points: [
        '是银河系中心的超大质量黑洞，质量约 430 万倍太阳。',
        '周围恒星以极高速度绕它飞奔，由此被精确称量。',
        '2022 年 EHT 拍下它的首张照片，证实银心确有黑洞。',
        '它吞噬物质时偶尔“进食”，喷出强烈的辐射。',
      ],
    },
  },
  {
    id: 'm13', name: '球状星团 M13', nameEn: 'Globular Cluster M13', type: '球状星团', zone: 'galaxy',
    position: [-15200, 3000, -4500], radius: 360, color: 0xffe0a0, accent: 0xfff0c0, isGlobular: true,
    facts: {
      title: '球状星团 M13 · 恒星的蜂巢',
      tldr: '由数十万颗古老恒星紧紧抱成一团的球状星团，是银河系晕里的“活化石”，年龄动辄百亿年。',
      points: [
        '包含数十万到上百万颗恒星，密集抱成球状。',
        '其中的恒星大多极老，是银河系最古老的居民。',
        'M13 距地球约 2.2 万光年，是北天最著名的星团。',
        '曾被人选作向可能的外星文明发送信号的“地址”。',
      ],
    },
  },
  {
    id: 'lmc', name: '大麦哲伦云', nameEn: 'Large Magellanic Cloud', type: '矮星系', zone: 'galaxy',
    position: [-14800, 2000, -5800], radius: 500, color: 0xffd9a0, accent: 0xaad4ff, isGalaxy: true,
    facts: {
      title: '大麦哲伦云 · 银河系的卫星',
      tldr: '南天肉眼可见的不规则矮星系，是银河系的小邻居，也是 1987A 超新星的故乡。',
      points: [
        '距地球约 16 万光年，是最近的星系级天体之一。',
        '作为银河系的卫星星系，正被引力缓缓撕扯吞并。',
        '里面富含气体，正在活跃地诞生新恒星。',
        '著名的 SN 1987A 就发生在它内部。',
      ],
    },
  },
  {
    id: 'pleiades', name: '昴星团', nameEn: 'Pleiades', type: '疏散星团', zone: 'galaxy',
    position: [-15400, 2200, -4200], radius: 300, color: 0xaad4ff, accent: 0xcfe6ff, isScatter: true,
    facts: {
      title: '昴星团 · 七姐妹星团',
      tldr: '肉眼可见的一小撮蓝色亮星，是被蓝色反射星云轻轻笼罩的年轻疏散星团，许多文化都有它的传说。',
      points: [
        '又称“七姐妹”，是距地球约 440 光年的年轻星团。',
        '年龄仅约 1 亿年，恒星还非常年轻炽热。',
        '周围的蓝色雾气是反射星光的尘埃，并非恒星本身发光。',
        '在许多文明的神话里都占有一席之地。',
      ],
    },
  },

  /* ============================ Z6 宇宙深处 ============================ */
  {
    id: 'andromeda', name: '仙女座星系', nameEn: 'Andromeda Galaxy', type: '星系', zone: 'deep',
    position: [3000, -4000, -19000], radius: 900, color: 0xffd9a0, accent: 0xaad4ff, isGalaxy: true,
    facts: {
      title: '仙女座星系 · 我们的银河邻居',
      tldr: '距地球约 254 万光年的最大邻近星系，正以每秒约 110 km 向我们靠近，40 亿年后将与银河系相撞合并。',
      points: [
        '距地球约 254 万光年，是肉眼可见的最远天体之一。',
        '直径约 22 万光年，比我们的银河系还略大。',
        '正以每秒约 110 km 的速度向银河系靠近。',
        '约 40 亿年后将与银河系相撞并融合成更大的椭圆星系。',
      ],
    },
  },
  {
    id: 'triangulum', name: '三角座星系', nameEn: 'Triangulum Galaxy', type: '星系', zone: 'deep',
    position: [2000, -3500, -19800], radius: 600, color: 0xffd0b0, accent: 0xbcd4ff, isGalaxy: true,
    facts: {
      title: '三角座星系 · 第三大邻星系',
      tldr: '本星系群里第三大的旋涡星系，比银河系和仙女座都小，却以疯狂的恒星形成速率著称。',
      points: [
        '编号 M33，距地球约 270 万光年。',
        '是银河系与仙女座之外、本星系群里最大的成员之一。',
        '气体丰富，恒星形成异常活跃。',
        '可能没有自己的超大质量黑洞，或极其微弱。',
      ],
    },
  },
  {
    id: 'sombrero', name: '草帽星系', nameEn: 'Sombrero Galaxy', type: '星系', zone: 'deep',
    position: [3800, -4500, -18500], radius: 550, color: 0xffe0b0, accent: 0xcfe0ff, isGalaxy: true,
    facts: {
      title: '草帽星系 · 宇宙里的宽边帽',
      tldr: '因明亮核球加一条暗尘埃带而酷似宽边草帽的边缘-on 旋涡星系，是天文摄影的明星目标。',
      points: [
        '编号 M104，距地球约 2800 万光年。',
        '中央鼓起的核球与环绕的暗尘埃带构成“帽檐”轮廓。',
        '中心藏有一个质量很大的超大质量黑洞。',
        '在可见光与红外下都极具辨识度。',
      ],
    },
  },
  {
    id: 'quasar', name: '类星体 3C 273', nameEn: 'Quasar 3C 273', type: '活动星系核', zone: 'deep',
    position: [3200, -3000, -20000], radius: 200, color: 0xffffff, accent: 0x88bbff, isQuasar: true,
    facts: {
      title: '类星体 3C 273 · 远古的灯塔',
      tldr: '一个遥远星系中心、被黑洞驱动的“活动星系核”，亮度超过千亿颗恒星，却小如太阳系——宇宙最早的巨型引擎。',
      points: [
        '亮度可达整个银河系的数百倍，却源自极小区域。',
        '能量来自中心超大质量黑洞吞噬物质形成的吸积盘。',
        '向两端喷出接近光速的物质喷流（jets）。',
        '距地球约 24 亿光年，我们看到的是它久远的过去。',
      ],
    },
  },
  {
    id: 'cmb', name: '宇宙微波背景', nameEn: 'Cosmic Microwave Background', type: '宇宙背景辐射', zone: 'deep',
    position: [3000, -4000, -21000], radius: 1200, color: 0x223044, accent: 0x556688, isCMB: true,
    facts: {
      title: '宇宙微波背景 · 宇宙的婴儿照',
      tldr: '充满整个天空的极微弱“余晖”，来自宇宙诞生约 38 万年时，是可观测宇宙我们能看到的最远边界。',
      points: [
        '是大爆炸后约 38 万年、宇宙首次变得透明时留下的光。',
        '温度均匀约 -270℃（2.7 K），是宇宙最古老的图像。',
        '上面极微小的冷热起伏，后来长成了今天的星系。',
        '它定义了“可观测宇宙”的边界，再远处光还没来得及到达。',
      ],
    },
  },
];

// 出发点的提示文案
export const INTRO = {
  title: 'COSMIC VOYAGE · 整个宇宙',
  lines: [
    '你正漂浮在地球轨道上。从一颗行星，到可观测宇宙的边缘——整片宇宙都是你的航线。',
    'WASD 推进 · 鼠标转视角 · Shift 加速 · E 靠近天体查看科普',
    '按 G 打开【星图航图】跃迁到六大区域 · 按 B 查看【宇宙图鉴】探索进度 · 按 H 开关帮助',
  ],
};
