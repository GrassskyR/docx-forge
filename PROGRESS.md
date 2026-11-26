# 验收日志

## M0 — PASS
- 实测环境：Python 3.13.13；Node v22.23.2；npm 10.9.8；LibreOffice 24.2.7.2；pdftoppm 24.02.0。
- `npm view @mariozechner/pi-agent-core version` / `npm view @mariozechner/pi-ai version` 均为 0.73.1；已按此版本安装（上游已标 deprecated，仍遵照指定包使用）。
- 编写 TS 前已读取两包 dist/index.d.ts、core/agent.d.ts、core/types.d.ts、ai/models.d.ts、ai/stream.d.ts。
- 真实 API：`new Agent(options?: AgentOptions)`；`prompt(string | AgentMessage | AgentMessage[])`；`subscribe(listener)`；`state.messages` 可赋值；`transformContext(messages, signal?) => Promise<AgentMessage[]>` 每轮执行；`getApiKey(provider)`；`AgentTool.execute(toolCallId, params, signal?, onUpdate?) => Promise<{content,details}>`；Type 从 pi-ai 导出（来自 typebox，非旧版 @sinclair/typebox）。`streamSimple(model,context,options?)`，`getModel(provider,modelId)`。
- 门禁：`.venv/bin/python` import fastapi, uvicorn, multipart, pydantic, docx, lxml, httpx, openai, pytest 并断言 core 的 agent.d.ts 存在：退出码 0，imports PASS，Pydantic 2.14.4。
- 项目 .env 从原工作目录复制，未记录或输出密钥；有配置 LLM 参数，后续真实验证。

## M1 — PASS
- 门禁：`.venv/bin/python -m pytest engine/tests/test_extractor.py engine/tests/test_nl_parser.py engine/tests/test_store.py engine/tests/test_renderer_and_linter.py -v`：退出码 0，27 passed in 5.01s。
- 真实 soffice .doc OLE 魔数确认并反推成功；Direct Formatting 页边距、标题/正文中西字体、字号、行距、缩进所有断言通过；递归 basedOn、加权 Run 众数通过。
- SQLite 继承、Active Profile 重建实例后持久化通过。
- 正常输出 score=100；分别篡改中文字体、西文字体、字号、行距、缩进、页边距、对齐、加粗，8/8 检出。审计器独立解压磁盘 document.xml/styles.xml，不引用渲染或提取实现。

## M2 — PASS
- 门禁：`.venv/bin/python -m pytest engine/tests/test_api.py -v`：退出码 0，1 passed in 2.71s。
- TestClient 在一个完整持久化工作流覆盖全部 9 个规定接口（另增 DELETE 供 manage_profiles 工具使用）；真实 multipart 上传、预设创建/继承/切换、Word 下载、PNG 魔数与路径/上传两种审计均通过。
- web/index.html 原生单文件、左右分栏，提供预设库、Active 切换、导入/自然语言微调、SSE 对话、分支切换、PNG、审计与下载。

### M3 验证中的修正
- 初次 HTTP 启动发现 8000 被其他项目（现有 interview-practice 服务）占用，未终止该进程；测试使用 ENGINE_URL=http://127.0.0.1:18000。
- TS 首次 E2E 编译错误为 assert 的 message 参数可能 undefined；依据编译器签名改用 assert.equal 检查 undefined 后 typecheck 通过。
- PNG 人工检查发现 PAGE 域错误嵌套在 w:r 下导致数字不显示；将 w:fldSimple 放回 w:p 的合法子节点。最终回归将复验。

## M3 — PASS
- `cd agent && npx tsc --noEmit`：退出码 0，0 类型错误。
- `cd agent && ENGINE_URL=http://127.0.0.1:18000 npm run verify`：退出码 0。
- 四条确定性场景全部 PASS：真实文件导入/默认复用/渲染审计；自然语言与继承/六工具/真实 Pi-Agent 工具循环/压缩后上下文；会话树持久化分叉切换；真实 XML 故障→字段 Diff 回传→重编译后独立审计通过（1 轮修复）。
- 已配置的真实 LLM（deepseek/deepseek-v4.1-flash）四次连续对话全部 PASS：导入后通知、自然语言新格式、派生默认格式、正文改写并再次审计。无伪造 LLM 输出或统计。

### M4 评测发现与修正
- 首轮范本还原率实测 2048/2080=98.46%；修正日期/主送受短 Run 干扰的角色识别后为 2072/2080=99.62%。
- 完整读取 .doc 转换后的 document.xml/styles.xml 发现 soffice 会丢弃仅设 firstLineChars 的部分缩进；独立作者脚本补上等价 firstLine 兼容属性，保留原字符缩进 Ground Truth。提取器补充物理缩进到字符的换算，并将 Word 缺省缩进视为 0，而非无条件按公文 2 字补全。
- 独立 Linter 新增真实 basedOn/docDefaults 解析和无角色标签的语义识别，避免对 Baseline 不公平；布尔值依据 OOXML 等价表示（0/false/off）归一化。不是放宽格式要求。
- 样式表审计新增测试：将正文字体移到 styles.xml 后正常通过，再篡改 styles.xml 的 eastAsia，准确报错；renderer/linter 专项 10 passed。
- 范本构建器初次多生成一个 .doc（6 而非 5），定位为额外 index==18 分支，删除该条件并重新独立构建后精确 15+5+20。
- 最终页码 PNG 人工复验：注册 gw_page_number 样式、将 PAGE 放在合法节点并显式设置域结果字体后，「— 1 —」在页脚居中正确显示。
- 本机 fontconfig 对 仿宋_GB2312、方正小标宋简体、Times New Roman 分别回退 Noto Sans / Noto Sans / Liberation Serif。OOXML 写入和审计仍使用指定真实字体名，预览与安装正版对应字体的 Word 环境存在视觉差异，交付文档需明确说明。
- npm 初装审计显示 6 条高危链，根源为间接依赖 basic-ftp@5.3.1。`npm view basic-ftp version` 核实可用 6.2.6 后增加 overrides.basic-ftp=6.2.6 并重装；npm audit 为 0 vulnerabilities，保留指定 Pi-Agent 0.73.1 主版本。

## M4 — PASS
- `.venv/bin/python eval/build_fixtures.py`：退出码 0，精确 15 DOCX + 5 真实二进制 DOC + 20 Ground Truth JSON。五类各四份，构建脚本无 engine 导入。
- `nl_instructions.jsonl`：30 行合法 JSON，10 完整+8 缺省+6 口语多级标题+6 继承增量，均带 expected_assertions。
- `.venv/bin/python eval/run_benchmark.py --with-llm --resume`：真实 30 条全部处理，退出码 0（约 30 分钟，Baseline 超时作为真实失败计入）。
- 原始 NL 241/244，发现大标题/第一层小标题/第二层省略称呼的规则串段，以及「别加粗」否定匹配问题；修正规则后两条样本重新真实请求 LLM，244/244。旧结果保留 eval/results.pre-fix.json，重试原始结构化结果保存在 results.json/revision_history。明确为同集调试复测，非留出集。
- 红头启用但 org_name 缺省时，渲染器优先使用 AST red_header_org、预设 org_name 或已知落款单位；均缺省则报错请求提供，不生成空机关或虚构机关。新增回归通过。
- `.venv/bin/python eval/run_benchmark.py --resume --reaudit`：退出码 0。读取真实模型解析结果重建系统文档，使用当前独立 Linter 重审三组，保留 Baseline 原始脚本/输出/异常。
- 最终实测：提取 2080/2080=100%；20/20 确定性输出合规；NL 244/244=100%；Baseline 20/30=66.67% 文档通过，平均字段合规率69.80%（含9次请求超时）；系统修复前/后均30/30=100%，未捏造改善幅度。M3 故障注入独立证明修复机制。
- 最终文件计数与 JSON 解析门禁：退出码 0，M4 final artifact gate PASS。
- 最终报告刷新最初误用系统 python3，触发 ModuleNotFoundError: docx；纠正为项目 .venv/bin/python 后刷新与所有计数/JSON 门禁通过，未改依赖限制。

## M5 — PASS
- 交付 start.sh（两个服务统一生命周期、健康就绪检查、端口冲突提示）、.env.example、README.md（Mermaid 架构、接口工具、操作/复现命令、真实指标和字体/同集复测边界）。
- 最终 `.venv/bin/python -m pytest engine/tests/ -v`：退出码 0，35 passed in 8.48s。
- 最终 `cd agent && npx tsc --noEmit`：退出码 0，0 错误；npm audit 为0漏洞。
- `bash -n start.sh`：退出码0。`ENGINE_PORT=18000 ./start.sh` 实际启动 Python 与 Pi-Agent，两个 /health 均200、Web GET / 为200；SSE 实际返回 document（审计passed）和done，跨源 OPTIONS 返回正确 Origin。
- 默认8000仍被现有其他项目占用，未终止；当前工作台 http://localhost:18000，Agent http://localhost:8787。18000 首次重启检查遇前一个引擎仍在退出，等待退出后原脚本正常启动。
- 启动后的 `ENGINE_URL=http://127.0.0.1:18000 agent/node_modules/.bin/tsx agent/src/e2e_verify.ts --deterministic`：退出码0，4/4 PASS，包含最终依赖与源码。
- 最终核对38个规定交付文件存在；15+5+20范本计数、二进制DOC魔数、30条指令、20+30逐项结果、Linter源码 SHA256 与报告一致。独立性检查使用 Python AST 核对 import，PASS（最初字符串检查误命中文档注释，已纠正为真实导入检查）。
- M0→M5 按顺序门禁完成；无待配置Key步骤，已运行真实 LLM。所有实测值和限制见 eval/report.md 与 README.md。

## 项目迁移到当前工作区 — PASS
- 用户要求搬至当前文件夹，完整项目已移动到 `/home/missi/project/docs-agent`，原目录已移除；现有 `.env` 与 `goal.md` 保留。
- 更新 README、会话历史中的项目路径、venv 激活脚本及可执行脚本 shebang、SQLite 预设母版路径；所有已保存母版均确认存在。
- `.venv/bin/python -m pytest engine/tests/ -v`：退出码0，35 passed in 8.12s；`.venv/bin/pip --version` 确认使用新目录。
- `cd agent && npx tsc --noEmit`：退出码0。
- `ENGINE_PORT=18000 ./start.sh` 从新目录实际启动成功，两个 health 正常；工作台 http://localhost:18000。
- `ENGINE_URL=http://127.0.0.1:18000 agent/node_modules/.bin/tsx agent/src/e2e_verify.ts --deterministic`：退出码0，四条端到端场景全部通过。

## R1 — PASS

- `.venv/bin/python eval/check_style.py` 退出 0。Web 为 365 行，四份文种 Skill 分别为 49、50、50、50 行。Python 和 TypeScript 源码通过行长与多语句检查。
- `.venv/bin/python -m pytest engine/tests/test_renderer_and_linter.py -v` 退出 0，14 passed。确认原始 XML 为 `both`，非法 `justify` 被拒绝，两种缩进单位均审计。真实文件外部同时篡改页纸、页边距、对齐、行距、缩进、字体、字号、字形、颜色，并删除红头、红线、页码，定向修复后违规归零且保留外部编辑的正文。
- `cd agent && npx tsc --noEmit` 退出 0。Agent 修复请求携带审计过的文件路径、有效预设与违规项。
- 现场通过 `render → lint → preview` 生成 `data/visual-check-v2/document.docx` 与 `page-1.png`，独立审计 180 项全部通过。亲自读图核验红头、文号、主送、一级标题、正文、落款与日期。一级标题和正文首行相对主送缩进约 45 像素，约两个正文字符。正文各完整行右侧齐整，页底居中清晰显示「— 1 —」。

## R2 — PASS

- `.venv/bin/python -m pytest engine/tests/test_extractor.py engine/tests/test_nl_parser.py engine/tests/test_store.py -v` 退出 0，32 passed。覆盖 OLE 转换、普通 ZIP 拒绝、样式继承、否定替换、双字体、相对修改与模型配置错误。
- `.venv/bin/python -m pytest engine/tests/test_real_docs.py -v` 退出 0，16 passed in 43.23s。16 个原文件的大小、魔数、SHA256 与锁定清单相符。16 份全部提取成功，页边距与清单按 twips 完全一致，页码与清单完全一致，所有字体无分号，母版无正文及页眉页脚等故事文本，重渲染通知均通过独立审计并生成 PNG。
- 实测真红线覆盖 01/03/05，其中 03 使用红色粗下划线与保留空格生成横线。01/04 两份保留全部红头行，01/02 的文号为方正仿宋_GBK 16pt，06 正文为 28pt，13 标题为方正小标宋简体 22pt，16 的伪 DOCX 转换成功。
- 清单与魔数实测为 9 份原生 DOCX、6 份 .doc OLE、1 份 .docx 后缀 OLE。目标开头对格式数量的描述为 8/7/1。验收使用锁定清单中的全部 16 个文件。

## R3 — PASS

- 清理数据库中 12 个旧验收预设，将会话恢复到空根节点。
- `.venv/bin/python -m pytest engine/tests/test_api.py -v` 退出 0，3 passed，含真实损坏 DOCX 修复前后审计、PNG 下载、过期违规列表拒绝以及结构化 AST 反馈。
- `cd agent && npx tsc --noEmit` 退出 0。引擎以 `ENGINE_PORT=18000 ./start.sh` 启动，两个健康端点正常。
- `cd agent && ENGINE_URL=http://127.0.0.1:18000 npm run verify` 退出 0。确定性 4/4 及真实 LLM 连续 4/4 通过。实际 HTTP 分支切换返回两份不同的对话及其预设，并同步更新 Active。真实文件故障修复一次，违规 17 → 0，PNG 已生成。
- E2E 的 finally 恢复 Active 并删除本次创建的全部预设。独立查询 SQLite 和会话文件确认只剩国标内置预设与空根节点。

## R4 — PASS

- `.venv/bin/python eval/build_fixtures.py` 退出 0，生成 15 份 DOCX、5 份 OLE DOC 与 20 份独立金标准。四份红头通知评分包含文号字体与字号，四份陷阱使用直接格式、短 Run、中西文混排和至少行距。
- `.venv/bin/python eval/run_benchmark.py --verify-inputs` 退出 0，20/20 格式断言和文档均唯一，15/20 含 PAGE，30/30 指令唯一且类别分配为 10/8/6/6，16/16 锁定原件通过 SHA256。
- `.venv/bin/python eval/run_benchmark.py --with-llm` 从空结果运行，退出 0，获取两组各 30 条真实请求的终态。单次超时 180 秒，暂时性错误最多重试三次，退避 1、2、4 秒。独立验证超时模拟依次触发三次退避。
- `.venv/bin/python eval/run_benchmark.py --reaudit` 退出 0。最终审计器通过节关系检查引用页脚，精确区分 PAGE 与 NUMPAGES。用本次真实模型产物复核，最终指标与本次完整运行一致。
- 合成提取 2088/2088，确定性渲染 20/20。真实文档 16/16 通过独立审计与 PNG 预览。NL 233/233，系统修复前后金标准审计均为 30/30。10 份故障注入产物各自违规 17 → 0，文档通过率 0% → 100%。
- Baseline 总通过率 6/30（20.00%），有效响应通过率 6/22（27.27%）。8 条网络超时，2 个有效响应的代码执行失败（2/22，9.09%）。逐字段违规分布和每次请求尝试见 `eval/results.json` 和 `eval/report.md`。

## R5 — PASS

- `.venv/bin/python -m pytest engine/tests/ -v` 退出 0，66 passed in 53.70s。
- `cd agent && npx tsc --noEmit` 退出 0。依赖目录的 Pi-Agent 声明与工具及运行时调用一致。
- `.venv/bin/python eval/check_style.py`、`.venv/bin/python eval/run_benchmark.py --verify-inputs`、`bash -n start.sh` 均退出 0。Web 源码 421 行，16/16 原件 SHA256 精确匹配，四份已序列化陷阱范本均实际含 `atLeast`。
- `ENGINE_PORT=18000 ./start.sh` 正常启动，Python 与 Agent 健康端点均 200。Chromium 加载页面、切换预设、真实对话并分叉，双向切换恢复独立聊天记录、当前分支和预设名称与 Active 高亮。示例通知独立审计 100%，浏览器成功加载 PNG 并验证 DOCX 下载。
- 最终服务又完成确定性 E2E 4/4，真实故障修复 17 → 0。浏览器和 E2E 的临时预设已清除。重启后查询在线服务和 SQLite，只有国标预设和空根节点。
- 最终报告、结果 JSON 和 README 已对齐。结果内审计器 SHA256 与源码一致，所有真实 PNG 和注入修复产物已生成。

## V3-M0 · TypeScript 单进程兼容基座

在 feature/v3-docforge 分支运行了 TypeScript 类型检查、Vite 构建和源码风格检查，均退出 0。
引擎兼容测试通过 68 项。20 份合成范本的锁定字段逐项匹配，重渲染后独立审计通过。
16 份真实公文均完成魔数识别、提取、空壳检查、渲染、磁盘审计与 PNG 生成。
30 条自然语言金标准、SQLite 重启持久化、误命名 OLE 转换通过。
单端口 HTTP 集成测试退出 0，验证预设管理、上传、生成、下载、两种审计入口、会话分叉与切换，
以及对磁盘文件注入 8 项格式故障后定向修复并保留外部编辑的正文。

## V3-M1 · 模板解剖与资产库

两组 Vitest 共 33 项通过，退出 0。30/30 原始文件的 SHA256 匹配清单，30/30 骨架可解析、
有段落与原型，序列化后均在 6,000 字符内。模板资产测试逐字节比对原件，核对蓝图与规则文件，
验证派生、切换默认、重启恢复、删除及 1,500 字符能力卡上限。

## V3-M2 · 原型克隆与保真套版

五份指定真实模板的专项测试 5/5 通过。每份产物逐个比对主文档之外的 ZIP 部件字节，
逐块比对槽位外 XML，核对分节、网格、图形节点数量，并实际转换 PDF 与首页 PNG。
从插入段落读回长草稿逐字相等，首句和后文分别断言 w:b=1 与 w:b=0。

## V3-M3 · 版面遥测、确定性收口与按需视觉终审

`npm run typecheck`、`npm run stylecheck`、`npx vitest run`（7 文件 109 项）与单进程
`e2e_verify_v3.ts` 全部退出 0，新增 `v3_layout_vision.test.ts` 与 `context_hook.test.ts`。
用 render 真实生成末页仅 2 行、落款掉页的 .docx，`pdftohtml -xml` 与 `pdfinfo` 同时报出
`tail_overflow` 与 `orphan_signature`；`compact_pages` 收口后再次遥测 `warnings=[]` 且总页
数减 1，跨页表格按同一 `w:tbl` 单元格在相邻页复现检出。视觉终审在未配置时返回
`skipped_no_vision_model` 且不调用回调，侧车配置返回 sidecar、`LLM_SUPPORTS_VISION=true`
返回 native，审计或遥测未过时返回 `skipped_pending_layout`，采样 PNG 宽度实测 ≤ 960px。
上下文钩子在审阅轮后清除历史 base64 图片块与 details、保留一行摘要，能力卡断言 ≤ 1,500
字符。E2E 以真实 DeepSeek 贯通公文/论文/合同三类模板的 inspect → 内化 → 套版 → 审计 →
遥测 → 视觉降级 → 版面调整，SSE 含 tool、usage、done 且无 error；累计消耗 15,753 tokens。
`.env` 未配置单价与视觉模型，实测 `cost_usd` 为 null、视觉全程 text_only 优雅降级。


## V3-M4 · 极简瑞士双模式前端工作台与真实浏览器视觉验收

- 采用 Vue 3 + Vite 7 + TypeScript + Tailwind CSS v4 构建 `packages/web/`（含 `TopBar.vue`、`DebugSidebar.vue`、`ContentColumn.vue`、`PreviewStage.vue`、`ImportModal.vue`、`workbench.ts`、`api.ts`），直接复用 `@docs-agent/shared` 类型，`npm run build` 与 `npm run stylecheck` 均退出 0，产物输出至 `packages/web/dist/` 且零外部运行期 CDN，`GET /` 返回 200。
- 启动单进程服务并使用无头 Chromium（`1440×900` 及移动端 `390×844`）全链路实测通过：全程零 `console.error`、零 `pageerror`、零 HTTP 异常响应；默认普通模式保持极简两栏（无任何 Token/OOXML/Poppler/能力卡噪音），验证格式选择器浮层、导入真实红头 `.docx` 范例并内化、真实触发末页 2 行孤立落款并弹出浅琥珀「一键压进 1 页」建议条（点击压页后建议条自动消失）、零拷贝套版、SSE 流式对话、A4 翻页与 Word 下载；开启右上角「调试模式」后，平滑展开左侧模板资产与能力卡侧栏、零拷贝段落 ID 映射表、实时 Token 计量、会话分叉与切换恢复、缩放控件及底部三标签双轨诊断抽屉，窄屏自动纵向堆叠无横向溢出。
- 截取并亲自读图核验 `data/visual-check-v3/ui-normal.png` 与 `data/visual-check-v3/ui-debug.png`：初次读图发现调试态预览顶栏三枚徽章窄屏折行，补充 `whitespace-nowrap shrink-0` 并微调中栏宽度比例后重新构建截屏复验，普通模式安静克制、A4 纸张红头与版式清晰自然，调试模式三栏布局与单行状态徽章整齐有序，对齐 `design/swiss_workbench_reference.html` 视觉水准。

## V3-M5 · 跨领域与低成本双维基准评测、遗产清理与全量零回归交付

- 编写并执行 `npx tsx eval/run_benchmark_v3.ts`（退出 0），生成真实 `eval/results_v3.json` 与 `eval/report_v3.md`：
  1. 30/30 锁定真实跨领域文档（16 公文 + 4 论文/规范 + 3 申报表 + 7 合同）SHA256 全部匹配，骨架压缩 30/30 ≤ 6,000 字符（均值 1,707 字符、峰值 5,699 字符、平均压缩比 1.77%），原件留壳保真（`word/media`、页眉页脚、分节、样式表字节一致）与组装渲染及 PNG 生成 30/30（100.00%）；期间定位并修正 `<w:pPr><w:tabs><w:tab>` 制表位标尺节点与正文 `\t` 的区分问题。
  2. 6 份跨领域长草稿（1,677~2,394 字）真实调用 `cmd/deepseek/deepseek-v4.1-flash` 执行零拷贝保真套版，正文逐字保真率 6/6 = 100.00%，单文档平均消耗 Prompt 390 + Completion 1,499 = **1,889 tokens**（论文与申报表样本低至 474~516 tokens）。
  3. 6 份真实溢出与孤立落款样本自动压页收口（补全 `snapToGrid=0` 与段前距 `w:before` 协同收缩），收口前共 10 项警报 → 收口后 6/6 归零且全部成功减页收敛。
  4. 双轨视觉终审实测运行模式 `text_only`（优雅降级零报错），6 份多页/含表模板最多采样 3 页（首/末/表页），最大采样宽度 960px。
- 彻底清理旧双服务遗留目录（旧 Python `engine/`、独立 `agent/`、旧单页 `web/`、`eval/check_style.py` 与 `.venv`），保留全部锁定评测语料、测试夹具与 V2 历史报告 `eval/report.md`、`eval/results.json` 原封不动。
- 更新单进程纯 Node `start.sh`（支持 `PORT` 与兼容 `ENGINE_PORT`，内置端口冲突检测与 `packages/web/dist` 构建检测，运行期零 Python 依赖）、`.env.example` 与 `README.md`。
- 全量门禁复验全部退出 0：`npm run typecheck`、`npm run stylecheck`、`npm run build`、`npm test`（9 个测试文件共 111 项用例 100% PASS）、`npx tsx packages/server/tests/e2e_verify_v3.ts`（公文/论文/合同三类真实 LLM 内化套版 + SSE `/chat` 通过）、30/30 语料 SHA256 校验通过；实测 `./start.sh` 正确拦截 8000 端口冲突，`PORT=18000 ./start.sh` 与 `ENGINE_PORT=18000 ./start.sh` 单进程健康启动且 `GET /` 与 `GET /health` 均返回 200；核验 `data/profiles.db`（仅保留内置国标预设，模板库为空）、`data/template_assets/` 与 `data/sessions.json`（空根节点）处于干净交付状态。

## V3-M6 · 用户实测五项体验与多节实验报告解析升级 — PASS

- **问题 1（上传弹窗防误触关闭）**：移除 `packages/web/src/components/ImportModal.vue` 遮罩层 `@click.self="emit('close')"`，仅允许点击右上角 `✕` 或「取消」按钮关闭（上传内化进行中自动禁用关闭），Chromium 真实派发遮罩外侧 `(20, 20)` 鼠标点击断言弹窗不关闭。
- **问题 2（后端 Pino 结构化日志 + Langfuse v4 遥测）**：新增 `packages/server/src/logger.ts`（`pino` + `pino-pretty` 终端彩色输出与 `data/logs/server.log` JSONL 双写，覆盖 HTTP 请求耗时、骨架解剖、模板内化、Pi-Agent 工具调用与模型 Token 用量）及 `packages/server/src/observability.ts`（接入官方 `@langfuse/tracing` + `@langfuse/otel` v4 SDK，自动追踪 `/chat` 会话工具树与独立模型调用；`.env.example` 预留 `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASE_URL` / `LOG_LEVEL`，未配置密钥时零报错降级至本地 Pino 日志，顶栏调试态展示 `Langfuse 追踪` / `Pino 日志` 状态胶囊）。
- **问题 3（修复 AI 助手无法感知新导入模板）**：升级 `packages/server/src/context_hook.ts`（将历史轮次中的旧 `manage_templates` / `manage_profiles` 空快照显式标记为历史快照，并以最新激活模板能力卡为准，同时在能力卡中自动透出表格原型列数如 `table(4列)`）、`tools_v2.ts`（`manage_profiles` 同步返回 `v3_templates` 与 `active_template_id`）及 `agent.ts` 系统提示词。实测同一会话先在空库状态提问、随后导入桂工实验报告模板再切回对话起草报告，AI 立即识别新激活模板并一次调通 `compose_document` 生成 5 页 Word 文档。
- **问题 4（双侧角色气泡 + Markdown 渲染对话组件）**：重构 `packages/web/src/components/ChatThread.vue`、`ContentColumn.vue` 与 `style.css`（集成 `markdown-it` + `dompurify` 本地打包零外网 CDN），用户消息采用右侧蓝底气泡与「我」头像，助手消息采用左侧白底卡片气泡、头部标识、一键复制、调试态折叠工具轨迹、安全排版 Markdown 与内联 `.docx` 下载卡片，并支持流式与新消息自动滚动到底部。
- **问题 5（多节高校实验报告模板智能解析与防重叠保护）**：升级 `doc_inspector.ts`（在 `<= 6,000` 字符预算内构建 `section_outline`，自动标注 `cover` 全字段采样、`instruction_guide_removable` 不打印说明页、`toc_preserved` 自动目录节与正文区）、`workspace.ts`（多节内化提示词与 `sanitizeBlueprint` 护栏）、`composer.ts`（支持 `remove_ranges` 整节剥离说明页与图表格式示例、封面键值原位填槽保留下划线长度并剔除白色 `###` 占位符、`B48..B84` 整段正文占位替换及 `<w:sdt>` 目录条目同步刷新）、`composition_audit.ts`（适配说明节合法移除审计）与 `layout_adjuster.ts`（多节封面保护与大字号行距下限防重叠）。以真实《桂林理工大学操作系统实习报告模板》端到端实测通过：精准提取 8 个封面槽位 + 正文槽位，完整剥离 `B21-B46` 不打印说明页与旧示例章节，原样保留封面版式、目录罗马页码 `I` 与后续页「课程设计与实习报告」页眉。
- **全量回归门禁**：`npm run stylecheck`、`npm run typecheck`、`npm run build`、`npm test`（10 个测试文件共 112 项用例，含新增 `v3_multi_section_report.test.ts` 与 30 份跨领域真实语料测试）及真实 Chromium 五项联动验收脚本全部退出 0，`npm audit --omit=dev` 生产依赖保持 0 漏洞。
