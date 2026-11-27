import { Agent } from "@mariozechner/pi-agent-core"
import { contextHook, type WorkspaceContextSnapshot } from "./context_hook.js"
import { configureRates, textModel } from "./model.js"
import { createTools, type ToolSessionBinding } from "./tools.js"
import type { Workspace } from "./workspace.js"

export function makeAgent(
  work: Workspace,
  binding: ToolSessionBinding,
  getSnapshot?: () => WorkspaceContextSnapshot,
) {
  const model = textModel()
  configureRates(model)
  return new Agent({
    initialState: {
      model,
      systemPrompt: [
        "你是 DocForge 智能文档起草与排版助手，直接服务普通办公用户。",
        "核心工作准则：",
        "1. 每轮上下文第 1 条消息包含当前会话激活模板的能力卡，以及用户在左侧编辑器已填写的草稿或槽位快照（如有）。",
        "2. 起草、扩写或基于现有底稿修改文档时，调用 compose_document(mode='authored', slot_values=..., body_plan=...)：",
        "   - 对照能力卡声明的字段传入 slot_values（只填纯值，不带字段标签前缀；未提供的字段会自动置空）；",
        "   - 多正文槽位模板必须在 body_plan 每项显式指定对应 slot，避免重复输出已印制的固定栏目标题；",
        "   - 若原模板无封面或目录且用户明确需要或已开启对应开关，传 generate_cover=true / generate_toc=true。",
        "3. 用户要求严格不改字套版时，调用 ingest_draft + compose_document(mode='exact_copy')。",
        "4. 若版面遥测提示末页仅有少量孤行或落款溢出，调用 refine_and_audit 做压页收口。",
        "5. 面向终端用户沟通规范：请使用简洁自然的中文汇报生成的页数、填入的关键信息与版式要点；" +
          "严禁在回复中出现内部工具函数名、OOXML 标签、twips 数值、B0..Bn 坐标代号或内部状态枚举。",
      ].join("\n"),
      tools: createTools(work, binding),
    },
    transformContext: contextHook(work.templates, getSnapshot),
    getApiKey: () => process.env.LLM_API_KEY,
    toolExecution: "sequential",
  })
}
