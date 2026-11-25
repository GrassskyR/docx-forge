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
