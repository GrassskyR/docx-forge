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
  const cfg = work.docs.config.current()
  const model = textModel(cfg)
  configureRates(model, "LLM", cfg)
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
        "4. 当模板存在格式缺陷（如正文误带下划线/加粗、缺少标题层级原型、页边距不当、槽位或清理项有误）" +
          "或用户要求调整/定制模板样式时：",
        "   - 先调用 manage_templates(action='inspect') 查看模板底层地图、各节点与原型的真实字符/段落属性及蓝图；",
        "   - 再调用 update_template 执行微调：用 format_paragraphs 修改指定坐标段的字体/字号/bold/underline/" +
          "缩进/行距/对齐/outline_lvl（如设 underline='none'、bold=false），必要时用 insert_paragraphs " +
          "增补独立标题/正文原型段并同步更新 blueprint.prototypes，或调整 page_setup、fields、content_slots、" +
          "remove_targets 与 rules_md（自定义模板默认就地更新，仅当用户要求另存/派生时传 save_as_new=true）；",
        "   - 模板更新成功后，若当前会话已有草稿或已生成成品，立即按新模板调用 compose_document 重新生成以刷新右侧预览。",
        "5. 若版面遥测提示末页仅有少量孤行或落款溢出，调用 refine_and_audit 做压页收口。",
        "6. 面向终端用户沟通规范：请使用简洁自然的中文汇报生成的页数、填入的关键信息与版式要点；" +
          "严禁在回复中出现内部工具函数名、OOXML 标签、twips 数值、B0..Bn 坐标代号或内部状态枚举。",
      ].join("\n"),
      tools: createTools(work, binding),
    },
    transformContext: contextHook(work.templates, getSnapshot),
    getApiKey: () => work.docs.config.current().llm_api_key,
    toolExecution: "sequential",
  })
}
