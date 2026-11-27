<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue"
import type { RendererMode, SettingsPatch, SettingsResponse } from "../types"

const props = defineProps<{
  open: boolean
  data: SettingsResponse | null
  saving: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [patch: SettingsPatch]
  refresh: []
}>()

const tab = ref<"llm" | "env">("llm")
const desktop = computed(() => window.docforgeDesktop)
const isWin = computed(() => props.data?.toolchain.platform === "win32")

const form = reactive({
  llm_base_url: "https://api.openai.com/v1",
  llm_api_key: "",
  clear_llm_api_key: false,
  llm_model: "",
  llm_supports_vision: false,
  llm_input_rate: "",
  llm_output_rate: "",
  vision_base_url: "",
  vision_api_key: "",
  clear_vision_api_key: false,
  vision_model: "",
  renderer_mode: "auto" as RendererMode,
  soffice_path: "",
})

function syncFromData(res: SettingsResponse | null) {
  if (!res) return
  const c = res.config
  form.llm_base_url = c.llm_base_url || "https://api.openai.com/v1"
  form.llm_api_key = ""
  form.clear_llm_api_key = false
  form.llm_model = c.llm_model || ""
  form.llm_supports_vision = Boolean(c.llm_supports_vision)
  form.llm_input_rate =
    c.llm_input_usd_per_million !== null ? String(c.llm_input_usd_per_million) : ""
  form.llm_output_rate =
    c.llm_output_usd_per_million !== null ? String(c.llm_output_usd_per_million) : ""
  form.vision_base_url = c.vision_base_url || ""
  form.vision_api_key = ""
  form.clear_vision_api_key = false
  form.vision_model = c.vision_model || ""
  form.renderer_mode = c.renderer_mode || "auto"
  form.soffice_path = c.soffice_path || ""
}

watch(
  () => [props.open, props.data] as const,
  ([isOpen, d]) => {
    if (isOpen && d) syncFromData(d)
  },
  { immediate: true },
)

const activeRendererLabel = computed(() => {
  const r = props.data?.toolchain.active_renderer
  if (r === "word_com") return "Microsoft Word (COM)"
  if (r === "wps_com") return "WPS Office (COM)"
  if (r === "libreoffice") return "LibreOffice"
  return "未就绪"
})

async function pickSoffice() {
  if (!desktop.value) return
  const picked = await desktop.value.pickExecutable("选择 LibreOffice (soffice) 可执行文件")
  if (picked) form.soffice_path = picked
}

function openExternal(url: string) {
  if (desktop.value) {
    void desktop.value.openExternal(url)
  } else {
    window.open(url, "_blank", "noopener")
  }
}

function parseRate(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function submit() {
  const patch: SettingsPatch = {
    llm_base_url: form.llm_base_url.trim(),
    llm_model: form.llm_model.trim(),
    llm_supports_vision: form.llm_supports_vision,
    llm_input_usd_per_million: parseRate(form.llm_input_rate),
    llm_output_usd_per_million: parseRate(form.llm_output_rate),
    vision_base_url: form.vision_base_url.trim(),
    vision_model: form.vision_model.trim(),
    renderer_mode: form.renderer_mode,
    soffice_path: form.soffice_path.trim(),
  }
  if (form.clear_llm_api_key) {
    patch.clear_llm_api_key = true
  } else if (form.llm_api_key.trim()) {
    patch.llm_api_key = form.llm_api_key.trim()
  }
  if (form.clear_vision_api_key) {
    patch.clear_vision_api_key = true
  } else if (form.vision_api_key.trim()) {
    patch.vision_api_key = form.vision_api_key.trim()
  }
  emit("save", patch)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) emit("close")
}

onMounted(() => window.addEventListener("keydown", onKeydown))
onUnmounted(() => window.removeEventListener("keydown", onKeydown))
</script>

<template>
  <div
    v-if="open"
    id="settingsModal"
    class="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
    @click.self="emit('close')"
  >
    <div class="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-[540px] max-h-[88vh] flex flex-col overflow-hidden">
      <div class="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between shrink-0">
        <div>
          <h3 class="text-[14.5px] font-semibold text-[#0F172A]">工作台设置</h3>
          <p class="text-[12px] text-[#64748B] mt-0.5">
            修改后即时热生效，无需重启；桌面端密钥将使用系统密钥环加密存储
          </p>
        </div>
        <button
          id="closeSettingsModal"
          type="button"
          class="w-7 h-7 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] flex items-center justify-center cursor-pointer"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="px-5 pt-3 border-b border-[#F1F5F9] flex items-center gap-2 shrink-0">
        <button
          type="button"
          class="px-3 py-1.5 rounded-t-lg text-[12.5px] font-medium border-b-2 transition cursor-pointer"
          :class="
            tab === 'llm'
              ? 'border-[#2563EB] text-[#1D4ED8]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          "
          @click="tab = 'llm'"
        >
          大模型与视觉
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-t-lg text-[12.5px] font-medium border-b-2 transition cursor-pointer"
          :class="
            tab === 'env'
              ? 'border-[#2563EB] text-[#1D4ED8]'
              : 'border-transparent text-[#64748B] hover:text-[#0F172A]'
          "
          @click="tab = 'env'"
        >
          渲染引擎与本地环境
        </button>
      </div>

      <div class="p-5 overflow-y-auto space-y-4 text-[12.5px] flex-1">
        <template v-if="tab === 'llm'">
          <div class="space-y-3">
            <div>
              <label class="block text-[12px] font-medium text-[#334155] mb-1">
                接口地址（OpenAI 兼容 Base URL）
              </label>
              <input
                v-model="form.llm_base_url"
                type="text"
                placeholder="https://api.deepseek.com/v1"
                class="w-full h-9 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-[12px] font-medium text-[#334155]">API Key</label>
                  <button
                    v-if="data?.config.llm_api_key_configured && !form.clear_llm_api_key"
                    type="button"
                    class="text-[11px] text-[#DC2626] hover:underline cursor-pointer"
                    @click="form.clear_llm_api_key = true"
                  >
                    清除已存密钥
                  </button>
                  <span
                    v-else-if="form.clear_llm_api_key"
                    class="text-[11px] text-[#D97706]"
                  >
                    保存后将清空
                  </span>
                </div>
                <input
                  v-model="form.llm_api_key"
                  type="password"
                  autocomplete="off"
                  :placeholder="
                    data?.config.llm_api_key_configured && !form.clear_llm_api_key
                      ? '已配置 (' + data.config.llm_api_key_hint + ')，留空保持不变'
                      : 'sk-...'
                  "
                  class="w-full h-9 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none"
                  @input="form.clear_llm_api_key = false"
                />
              </div>

              <div>
                <label class="block text-[12px] font-medium text-[#334155] mb-1">主模型名称</label>
                <input
                  v-model="form.llm_model"
                  type="text"
                  placeholder="deepseek-chat / gpt-4o"
                  class="w-full h-9 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none"
                />
              </div>
            </div>

            <label class="flex items-center gap-2 text-[12px] text-[#334155] cursor-pointer pt-0.5">
              <input v-model="form.llm_supports_vision" type="checkbox" class="rounded" />
              <span>主模型原生支持看图（用于排版渲染图视觉自检）</span>
            </label>
          </div>

          <div v-if="!form.llm_supports_vision" class="pt-3 border-t border-[#F1F5F9] space-y-3">
            <div class="text-[12px] font-semibold text-[#0F172A]">
              侧车视觉模型（可选，用于辅助检查页面排版渲染图）
            </div>
            <div>
              <label class="block text-[12px] text-[#475569] mb-1">Vision Base URL</label>
              <input
                v-model="form.vision_base_url"
                type="text"
                placeholder="留空则自动回退纯文本与几何核查"
                class="w-full h-8 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-[12px] text-[#475569]">Vision API Key</label>
                  <button
                    v-if="data?.config.vision_api_key_configured && !form.clear_vision_api_key"
                    type="button"
                    class="text-[11px] text-[#DC2626] hover:underline cursor-pointer"
                    @click="form.clear_vision_api_key = true"
                  >
                    清除
                  </button>
                </div>
                <input
                  v-model="form.vision_api_key"
                  type="password"
                  autocomplete="off"
                  :placeholder="
                    data?.config.vision_api_key_configured && !form.clear_vision_api_key
                      ? '已配置 (' + data.config.vision_api_key_hint + ')'
                      : '可选'
                  "
                  class="w-full h-8 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none"
                  @input="form.clear_vision_api_key = false"
                />
              </div>
              <div>
                <label class="block text-[12px] text-[#475569] mb-1">Vision 模型名称</label>
                <input
                  v-model="form.vision_model"
                  type="text"
                  placeholder="如 qwen-vl-plus / gpt-4o-mini"
                  class="w-full h-8 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none"
                />
              </div>
            </div>
          </div>

          <div class="pt-3 border-t border-[#F1F5F9] grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[11.5px] text-[#64748B] mb-1">
                输入单价（美元 / 百万 Token，可选）
              </label>
              <input
                v-model="form.llm_input_rate"
                type="text"
                placeholder="例如 0.27"
                class="w-full h-8 px-3 rounded-lg border border-[#CBD5E1] outline-none"
              />
            </div>
            <div>
              <label class="block text-[11.5px] text-[#64748B] mb-1">
                输出单价（美元 / 百万 Token，可选）
              </label>
              <input
                v-model="form.llm_output_rate"
                type="text"
                placeholder="例如 1.10"
                class="w-full h-8 px-3 rounded-lg border border-[#CBD5E1] outline-none"
              />
            </div>
          </div>
        </template>

        <template v-else>
          <div class="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] p-3.5 space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-[12px] font-semibold text-[#0F172A]">当前环境检测</span>
              <button
                type="button"
                class="text-[11.5px] text-[#2563EB] hover:underline cursor-pointer"
                @click="emit('refresh')"
              >
                重新检测
              </button>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[11.5px]">
              <div class="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#E2E8F0]">
                <span class="text-[#475569]">激活渲染器</span>
                <span
                  class="font-medium"
                  :class="data?.toolchain.renderer_ready ? 'text-[#059669]' : 'text-[#DC2626]'"
                >
                  {{ activeRendererLabel }}
                </span>
              </div>
              <div class="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#E2E8F0]">
                <span class="text-[#475569]">Poppler 预览</span>
                <span
                  class="font-medium"
                  :class="
                    data?.toolchain.poppler_source !== 'missing'
                      ? 'text-[#059669]'
                      : 'text-[#DC2626]'
                  "
                >
                  {{
                    data?.toolchain.poppler_source === "bundled"
                      ? "已内置"
                      : data?.toolchain.poppler_source === "system"
                        ? "系统就绪"
                        : "缺失"
                  }}
                </span>
              </div>
              <div
                v-if="isWin"
                class="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#E2E8F0]"
              >
                <span class="text-[#475569]">本机 Word / WPS</span>
                <span class="font-medium text-[#0F172A]">
                  {{
                    data?.toolchain.word_com
                      ? "Word ✓"
                      : data?.toolchain.wps_com
                        ? "WPS ✓"
                        : "未检测到"
                  }}
                </span>
              </div>
              <div class="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-[#E2E8F0]">
                <span class="text-[#475569]">LibreOffice</span>
                <span
                  class="font-medium"
                  :class="data?.toolchain.libreoffice ? 'text-[#059669]' : 'text-[#64748B]'"
                >
                  {{ data?.toolchain.libreoffice ? "已检测 ✓" : "未安装" }}
                </span>
              </div>
            </div>
            <div
              v-if="data && !data.toolchain.renderer_ready"
              class="text-[11.5px] text-[#B45309] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-2 flex items-center justify-between gap-2"
            >
              <span>
                {{
                  isWin
                    ? "请安装 Microsoft Word / WPS 或 LibreOffice 以启用文档转 PDF 与预览。"
                    : "未检测到 LibreOffice，请安装后点击重新检测或手动指定 soffice 路径。"
                }}
              </span>
              <button
                type="button"
                class="shrink-0 font-semibold text-[#1D4ED8] hover:underline cursor-pointer"
                @click="openExternal('https://www.libreoffice.org/download/download-libreoffice/')"
              >
                下载 LibreOffice
              </button>
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <label class="block text-[12px] font-medium text-[#334155] mb-1">文档渲染引擎策略</label>
              <select
                v-model="form.renderer_mode"
                class="w-full h-9 px-3 rounded-lg border border-[#CBD5E1] bg-white outline-none"
              >
                <option value="auto">
                  {{
                    isWin
                      ? "自动（优先本机 Word → WPS → LibreOffice）"
                      : "自动（使用 LibreOffice）"
                  }}
                </option>
                <option v-if="isWin" value="word_com">仅使用 Microsoft Word (COM)</option>
                <option v-if="isWin" value="wps_com">仅使用 WPS Office (COM)</option>
                <option value="libreoffice">强制使用 LibreOffice</option>
              </select>
            </div>

            <div>
              <label class="block text-[12px] font-medium text-[#334155] mb-1">
                自定义 LibreOffice (soffice) 路径（可选）
              </label>
              <div class="flex gap-2">
                <input
                  v-model="form.soffice_path"
                  type="text"
                  :placeholder="data?.toolchain.libreoffice_path || '留空自动扫描常见安装位置'"
                  class="flex-1 h-9 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none font-mono text-[11.5px]"
                />
                <button
                  v-if="desktop"
                  type="button"
                  class="h-9 px-3 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[12px] font-medium text-[#334155] cursor-pointer shrink-0"
                  @click="pickSoffice"
                >
                  浏览…
                </button>
              </div>
            </div>

            <div class="pt-2 border-t border-[#F1F5F9]">
              <div class="flex items-center justify-between mb-1">
                <span class="text-[12px] font-medium text-[#334155] flex items-center gap-1.5">
                  <span>本地数据目录</span>
                  <span
                    v-if="data?.is_portable"
                    class="px-1.5 py-0.5 rounded bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] text-[10.5px]"
                  >
                    便携模式
                  </span>
                </span>
                <button
                  v-if="desktop"
                  type="button"
                  class="text-[11.5px] text-[#2563EB] hover:underline cursor-pointer"
                  @click="desktop.openDataDir()"
                >
                  打开文件夹
                </button>
              </div>
              <div class="px-3 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] font-mono text-[11px] text-[#475569] break-all">
                {{ data?.data_dir || "data/" }}
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="px-5 py-3.5 bg-[#F8FAFC] border-t border-[#F1F5F9] flex items-center justify-end gap-2 shrink-0">
        <button
          type="button"
          class="h-8 px-3.5 rounded-lg border border-[#CBD5E1] bg-white text-[12px] font-medium text-[#334155] hover:bg-[#F1F5F9] cursor-pointer"
          @click="emit('close')"
        >
          取消
        </button>
        <button
          id="saveSettingsBtn"
          type="button"
          :disabled="saving"
          class="h-8 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 text-white text-[12px] font-medium cursor-pointer"
          @click="submit"
        >
          {{ saving ? "保存中…" : "保存设置" }}
        </button>
      </div>
    </div>
  </div>
</template>
