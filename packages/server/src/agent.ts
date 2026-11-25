import type { Workspace } from "./workspace.js"
import { configureRates } from "./model.js"
import { createV3Tools } from "./tools_v3.js"
import { Agent } from "@mariozechner/pi-agent-core"
import { Documents } from "./documents.js"
import { textModel } from "./model.js"
import { contextHook } from "./context_hook.js"
import { createTools } from "./tools_v2.js"

export function makeAgent(client: Documents, work: Workspace) {
  const model = textModel()
  configureRates(model)
  return new Agent({
    initialState: {
      model,
      systemPrompt: [
        "你是智能公文格式与生成 Agent。写公文时先加载文种 Skill 再用 DocContentAST 调用 render_gongwen_docx。",
        "改写也重新编译 AST。所有格式以每轮 Active Profile 为准。有活动模板时优先使用 compose_document。按本地段落 ID 区间映射原文。",
        "不得直接生成 Word 代码。生成成功须向用户说明文件与审计结果。",
      ].join("\n"),
      tools: [...createTools(client), ...createV3Tools(work)],
    },
    transformContext: contextHook(client, work.templates),
    getApiKey: () => process.env.LLM_API_KEY,
    toolExecution: "sequential",
  })
}
