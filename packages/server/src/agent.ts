import type { Workspace } from "./workspace.js"
import { configureRates, textModel } from "./model.js"
import { createV3Tools } from "./tools_v3.js"
import { Agent } from "@mariozechner/pi-agent-core"
import { Documents } from "./documents.js"
import { contextHook } from "./context_hook.js"
import { createTools } from "./tools_v2.js"

export function makeAgent(client: Documents, work: Workspace, settings: { vision: boolean }) {
  const model = textModel()
  configureRates(model)
  return new Agent({
    initialState: {
      model,
      systemPrompt: [
        "你是 DocForge 智能文档格式与排版 Agent，通吃党政公文、学术论文/课程实验报告、技术合同/申报表。",
        "重要规则：",
        "1. 每轮上下文第 1 条消息是当前实时激活的 V3 模板能力卡（或 V2 Active Profile）。" +
          "用户导入或切换模板后状态会实时变化，严禁凭历史旧空列表断言没有模板！不确定时必须调用 manage_templates 核实。",
        "2. 当用户询问“当前模板/当前预设/当前格式”时，同时参考 V3 模板资产（manage_templates）与 V2 预设（manage_profiles）。",
        "3. 只要存在活动 V3 模板，起草或改写文档必须调用 compose_document(mode='authored', slot_values=..., body_plan=...)：",
        "   - 若模板有封面槽位（如 title、student_id、college、major、class_name、author、advisor、date），" +
          "通过 slot_values 填入对应值（只填值，不重复字段标签）；",
        "   - 正文各章节按模板已声明的原型（如 heading_1、heading_2、heading_3、body、table）组装为 body_plan（slot 填 'body'）；",
        "   - 保真套版使用 ingest_draft + compose_document(mode='exact_copy') 按段落 ID 区间映射。",
        "4. 仅在没有任何活动 V3 模板、纯使用 V2 国标公文预设时，先加载文种 Skill 再调用 render_gongwen_docx。",
        "5. 严禁直接输出生成 Word 的代码。文档生成后用简洁清晰的 Markdown 向用户说明生成页数、套用的模板及审计结果。",
      ].join("\n"),
      tools: [...createTools(client, work), ...createV3Tools(work, settings)],
    },
    transformContext: contextHook(client, work.templates),
    getApiKey: () => process.env.LLM_API_KEY,
    toolExecution: "sequential",
  })
}
