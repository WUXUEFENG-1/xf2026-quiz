# 学宪法 讲宪法 · 校园知识竞赛答题平台（单人赛）

云南工业信息职业学院第二届“学宪法 讲宪法”校园知识竞赛线上答题平台。
主办：学生处、院团委　｜　承办：学生青年成长社

- 线上地址：GitHub Pages 自动部署（见仓库 Actions → pages）
- 数据存储：Supabase（PostgreSQL + PostgREST），未配置时自动降级为浏览器本机存储
- 形态：静态前端（`index.html` + `bank.js` + `app.js`），无需构建、无需服务器

## 赛制与规则

| 项目 | 设置 |
| --- | --- |
| 赛制 | 单人赛，选手独立报名、独立作答、独立排名 |
| 题量 | 100 题：单选 60、多选 20、判断 20，每题 1 分，满分 100 |
| 时限 | 60 分钟，到时自动交卷 |
| 排名 | 得分高者列前；同分者用时短者列前；同一学号多次作答取最好成绩 |
| 练习 | 随机 30 题，逐题判分并显示解析，无需报名、不计入成绩 |
| 报名 | 姓名、学号、系（部）、班级必填，手机号选填；学号唯一 |
| 续答 | 作答进度实时存本机，意外退出后可重新登录继续 |

## 功能清单

1. **在线报名**：学号唯一校验、系（部）可选可填、重复报名给出提示并引导登录。
2. **选手练习**：随机抽题、单选/判断即时判分、多选“确认本题答案”后判分并显示解析、练习结果页可回顾错题。
3. **正式答题**：报名信息核验登录、60 分钟倒计时（最后 10 分钟变黄）、答题卡（已答/已标记/当前）、多选逐项勾选、断线续答、交卷二次确认、超时自动交卷。
4. **成绩单**：得分环、答对题数、当前排名、正确率、用时、分题型表现表、错题回顾（练习模式）。
5. **成绩榜单**：个人总榜（取每人最好成绩）、系（部）参与情况（报名人数/参赛人数/平均分），实时读取云端。
6. **管理端**（口令 `xf2026`）：报名名单、成绩记录、参赛人数与平均分统计、导出个人成绩 CSV / 报名名单 CSV / JSON 备份、JSON 导入（本机模式）、本机数据清空。

## 部署

### 1. GitHub Pages

仓库已内置 `.github/workflows/pages.yml`，推送到 `main` 分支即自动触发：

- `actions/configure-pages@v5` 中的 `enablement: true` 会自动开启 Pages，无需手工设置
- 部署地址形如 `https://<用户名>.github.io/<仓库名>/`

### 2. 接入 Supabase（开启云端存储）

1. 在 [supabase.com](https://supabase.com) 新建项目（Region 选择离国内较近的区域，如 Singapore）。
2. 打开 **SQL Editor**，把 `supabase/schema.sql` 全文粘贴执行，创建 `registrations`、`results` 两张表及 RLS 策略。
3. 打开 **Project Settings → API**，复制 `Project URL` 与 `anon public` key。
4. 修改 `app.js` 顶部两个常量：

```js
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

5. 提交推送，页面顶部状态标签显示“云端已连接 · Supabase 实时同步”即生效。

> 安全提示：前端只使用 `anon public` key，**绝不可**把 `service_role` key 写进任何前端文件或仓库。`service_role` 会绕过 RLS，泄露等于交出整个数据库。

### 3. 本机演示

直接打开 `index.html`，顶部显示“本机模式 · 数据保存在当前浏览器”，报名、答题、榜单、管理端全部可用，数据存 `localStorage`。适合赛前演示与流程验收。

## 目录结构

```
xf2026-quiz/
├── index.html                 # 页面结构与样式
├── bank.js                    # 100 题题库
├── app.js                     # 答题、报名、榜单、管理端逻辑
├── .nojekyll                  # 关闭 Jekyll，保证静态资源直出
├── .github/workflows/pages.yml# GitHub Pages 自动部署
├── supabase/schema.sql        # 建表 + 索引 + RLS 策略
└── README.md
```

## 修改指引

| 需求 | 位置 |
| --- | --- |
| 管理端口令 | `app.js` 中 `const ADMIN_PASS = 'xf2026';` |
| 答题时长 | `const EXAM_SECONDS = 3600;`（单位秒） |
| 练习题量 | `const PRACTICE_COUNT = 30;` |
| 题库 | `bank.js` 中 `const BANK = [...]`，每题 `{t,q,o,a,e}` |
| 系（部）列表 | 报名页 `#dept-list`，或由已有报名记录自动汇总 |

## 数据表字段

`registrations`：`sid`（学号，唯一）、`name`、`dept`、`class`、`phone`、`created_at`

`results`：`sid`、`name`、`dept`、`class`、`score`、`right`、`wrong`、`used`（秒）、`detail`（jsonb 分题型明细）、`created_at`

## 已知边界

- 云端模式的管理端不支持删除记录，需在 Supabase 控制台操作（避免 anon 拥有 delete 权限）。
- 当前为纯前端判分，答案随题库下发，不具备防作弊能力；正式比赛建议在机房集中作答并配合现场监考。
- 榜单数据量按比赛规模（数百人）设计；如超过数千条，建议为 `results` 增加分页查询。
