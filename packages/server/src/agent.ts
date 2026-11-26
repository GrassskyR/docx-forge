import { Agent } from "@mariozechner/pi-agent-core"
import { contextHook } from "./context_hook.js"
import { Documents } from "./documents.js"
import { configureRates, textModel } from "./model.js"
import { createTools } from "./tools.js"
import type { Workspace } from "./workspace.js"

export function makeAgent(client: Documents, work: Workspace, settings: { vision: boolean }) {
  const model = textModel()
  configureRates(model)
  return new Agent({
    initialState: {
      model,
      systemPrompt: [
        "你是 DocForge 通用文档结构解析与排版 Agent。",
        "核心工作准则：",
        "1. 每轮上下文第 1 条消息是当前激活模板的能力卡。" +
          "若用户提供了新参考文档路径，先调用 learn_reference_doc 学习并激活模板。",
        "2. 起草或改写文档调用 compose_document(mode='authored', slot_values=..., body_plan=...)：",
        "   - 对照能力卡声明的元数据字段传入 slot_values（只填纯值，不带字段标签前缀）；",
        "   - 若模板含多个正文槽位，必须在 body_plan 每一项显式指定对应 slot，避免重复输出已印制的固定栏目标题；",
        "   - 若原参考文档缺少封面或目录且用户明确需要补齐，可传 generate_cover=true / generate_toc=true。",
        "3. 原文零改字套版调用 ingest_draft + compose_document(mode='exact_copy')。",
        "4. 根据返回的每页物理遥测（行数、首尾摘要、空白页或尾部溢出告警），" +
          "必要时调用 refine_and_audit（可按 section 指定分节）做版面收口。",
        "5. 严禁向用户输出拼装 Word 的代码。完成后简明汇报页数、槽位填写、保留结构与审计结果。",
      ].join("\n"),
      tools: createTools(work, settings),
    },
    transformContext: contextHook(work.templates),
    getApiKey: () => process.env.LLM_API_KEY,
    toolExecution: "sequential",
  })
}
