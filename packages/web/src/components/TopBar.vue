<script setup lang="ts">
import { computed, ref } from "vue"
import type { SessionSummary } from "@docs-agent/shared"
import {
  CATEGORY_LABELS,
  type BackgroundImportState,
  type CategoryId,
  type DropdownId,
  type FormatOption,
  type UsageSnapshot,
} from "../types"

const props = defineProps<{
  debug: boolean
  openDropdown: DropdownId
  popoverCat: CategoryId
  sessions: SessionSummary[]
  activeSessionId: string
  sessionName: string
  hasDoc: boolean
  docPages: number
  hasDraft: boolean
  formats: FormatOption[]
  activeFormat?: FormatOption
  usage: UsageSnapshot
  visionEnabled: boolean
  langfuseEnabled?: boolean
  bgImport: BackgroundImportState | null
}>()

const emit = defineEmits<{
  toggleDebug: []
  toggleDebugDrawer: []
  setDropdown: [menu: DropdownId]
  changePopoverCat: [cat: CategoryId]
  createSession: []
  switchSession: [id: string]
  forkSession: []
  renameSession: [id: string, name: string]
  deleteSession: [id: string]
  selectFormat: [fmt: FormatOption]
  renameFormat: [id: string, name: string]
  changeFormatCat: [id: string, cat: Exclude<CategoryId, "all">]
  duplicateFormat: [id: string]
  deleteFormat: [id: string]
  openImport: []
  toggleVision: []
  cancelBgImport: []
  applyBgImport: []
}>()

const categories: { id: CategoryId; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "gongwen", label: "公文" },
  { id: "thesis", label: "论文/报告" },
  { id: "contract", label: "合同/表" },
]

const editingSessionId = ref<string | null>(null)
const editingSessionVal = ref("")
const confirmDelSessionId = ref<string | null>(null)

const editingFormatId = ref<string | null>(null)
const editingFormatVal = ref("")
const confirmDelFormatId = ref<string | null>(null)

const filteredFormats = computed(() =>
  props.popoverCat === "all"
    ? props.formats
    : props.formats.filter((item) => item.category === props.popoverCat),
)

const sessionStatusTag = computed(() => {
  if (props.hasDoc) return props.docPages + "页"
  if (props.hasDraft) return "草稿"
  return "空白"
})

const tokenSummary = computed(() => {
  const tok = props.usage.total_tokens.toLocaleString() + " tok"
  if (props.usage.cost_usd !== null && props.usage.cost_usd > 0) {
    return tok + " · $" + props.usage.cost_usd.toFixed(4)
  }
  return tok
})

function toggleMenu(target: Exclude<DropdownId, null>) {
  editingSessionId.value = null
  confirmDelSessionId.value = null
  editingFormatId.value = null
  confirmDelFormatId.value = null
  emit("setDropdown", props.openDropdown === target ? null : target)
}

function startRenameSession(s: SessionSummary) {
  editingSessionId.value = s.id
  editingSessionVal.value = s.name
  confirmDelSessionId.value = null
}

function commitRenameSession(id: string) {
  if (editingSessionVal.value.trim()) {
    emit("renameSession", id, editingSessionVal.value.trim())
  }
  editingSessionId.value = null
}

function startRenameFormat(f: FormatOption) {
  editingFormatId.value = f.id
  editingFormatVal.value = f.name
  confirmDelFormatId.value = null
}

function commitRenameFormat(id: string) {
  if (editingFormatVal.value.trim()) {
    emit("renameFormat", id, editingFormatVal.value.trim())
  }
  editingFormatId.value = null
}

function nextCat(cur: Exclude<CategoryId, "all">): Exclude<CategoryId, "all"> {
  if (cur === "gongwen") return "thesis"
  if (cur === "thesis") return "contract"
  return "gongwen"
}
</script>

<template>
  <header class="h-[54px] shrink-0 bg-white border-b border-[#E2E8F0] px-4 flex items-center justify-between gap-2.5 z-30">
    <div class="flex items-center gap-2 min-w-0">
      <div class="flex items-center gap-2 shrink-0">
        <div class="w-7 h-7 rounded-lg bg-[#2563EB] text-white flex items-center justify-center">
          <svg
            class="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="13" y2="17" />
          </svg>
        </div>
        <span class="hidden sm:inline font-semibold text-[14px] tracking-tight text-[#0F172A]">
          DocForge
        </span>
      </div>

      <div class="h-4 w-px bg-[#E2E8F0]"></div>

      <!-- 当前文档会话下拉器 -->
      <div class="relative" @click.stop>
        <button
          id="sessionPickerBtn"
          type="button"
          class="h-8 pl-2.5 pr-2 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] flex items-center gap-1.5 text-[12px] transition cursor-pointer"
          @click="toggleMenu('session')"
        >
          <span class="text-[#64748B] shrink-0">文档</span>
          <span class="font-semibold text-[#0F172A] max-w-[130px] sm:max-w-[170px] truncate">
            {{ sessionName }}
          </span>
          <span class="text-[10.5px] px-1.5 py-0.5 rounded bg-white border border-[#E2E8F0] text-[#475569] shrink-0">
            {{ sessionStatusTag }}
          </span>
          <span class="text-[#64748B] text-[11px]">▾</span>
        </button>

        <div
          v-if="openDropdown === 'session'"
          id="sessionPopover"
          class="absolute left-0 top-10 w-[350px] max-w-[92vw] bg-white border border-[#E2E8F0] rounded-xl shadow-xl overflow-hidden z-50"
        >
          <div class="px-3.5 py-2.5 border-b border-[#F1F5F9] flex items-center justify-between">
            <span class="text-[12px] font-semibold text-[#0F172A]">
              文档会话（独立隔离草稿 / 对话 / 预览）
            </span>
            <button
              type="button"
              class="text-[12px] font-medium text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
              @click="emit('createSession')"
            >
              + 新建空白
            </button>
          </div>
          <div class="p-2 max-h-[300px] overflow-y-auto scroll-thin space-y-1">
            <div
              v-for="sess in sessions"
              :key="sess.id"
              class="px-3 py-2 rounded-lg border transition"
              :class="
                sess.id === activeSessionId
                  ? 'bg-[#EFF6FF]/70 border-[#BFDBFE]'
                  : 'border-transparent hover:bg-[#F8FAFC]'
              "
            >
              <div v-if="editingSessionId === sess.id" class="flex items-center gap-1.5">
                <input
                  v-model="editingSessionVal"
                  type="text"
                  class="flex-1 h-7 px-2 rounded border border-[#2563EB] text-[12px] outline-none bg-white"
                  @keydown.enter="commitRenameSession(sess.id)"
                  @keydown.esc="editingSessionId = null"
                />
                <button
                  type="button"
                  class="px-2 py-1 rounded bg-[#2563EB] text-white text-[11px] cursor-pointer"
                  @click="commitRenameSession(sess.id)"
                >
                  保存
                </button>
                <button
                  type="button"
                  class="px-1.5 py-1 text-[11px] text-[#64748B] cursor-pointer"
                  @click="editingSessionId = null"
                >
                  取消
                </button>
              </div>

              <div v-else class="flex items-center justify-between gap-2">
                <div
                  class="min-w-0 flex-1 cursor-pointer"
                  @click="emit('switchSession', sess.id)"
                >
                  <div class="flex items-center gap-1.5 text-[12.5px] font-medium text-[#0F172A]">
                    <span class="truncate">{{ sess.name }}</span>
                    <span
                      v-if="sess.id === activeSessionId"
                      class="text-[10.5px] text-[#2563EB] shrink-0"
                    >
                      · 当前
                    </span>
                  </div>
                  <div class="text-[11px] text-[#64748B] truncate mt-0.5">
                    {{ sess.template_name }} ·
                    {{ sess.doc_pages ? sess.doc_pages + "页成品" : sess.has_draft ? "含草稿" : "空白" }}
                    · {{ sess.message_count }}条对话
                  </div>
                </div>

                <div class="flex items-center gap-1 shrink-0 text-[11px]">
                  <template v-if="confirmDelSessionId === sess.id">
                    <button
                      type="button"
                      class="px-2 py-0.5 rounded bg-[#DC2626] text-white font-medium cursor-pointer"
                      @click="emit('deleteSession', sess.id)"
                    >
                      确认删
                    </button>
                    <button
                      type="button"
                      class="px-1.5 py-0.5 text-[#64748B] cursor-pointer"
                      @click="confirmDelSessionId = null"
                    >
                      取消
                    </button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="px-1.5 py-0.5 rounded hover:bg-white text-[#475569] cursor-pointer"
                      @click="startRenameSession(sess)"
                    >
                      改名
                    </button>
                    <button
                      type="button"
                      class="px-1.5 py-0.5 rounded hover:bg-white text-[#DC2626] cursor-pointer"
                      @click="confirmDelSessionId = sess.id"
                    >
                      删除
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 显眼独立「+ 新建文档」按钮 -->
      <button
        id="newSessionBtn"
        type="button"
        class="h-8 px-2.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-medium flex items-center gap-1 shrink-0 shadow-2xs transition cursor-pointer"
        @click="emit('createSession')"
      >
        <span>+ 新建文档</span>
      </button>

      <div class="hidden md:block h-4 w-px bg-[#E2E8F0]"></div>

      <!-- 格式模板选择器 -->
      <div class="relative" @click.stop>
        <button
          id="formatPickerBtn"
          type="button"
          class="h-8 pl-2.5 pr-2 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] flex items-center gap-1.5 text-[12px] transition cursor-pointer"
          @click="toggleMenu('format')"
        >
          <span class="text-[#64748B] shrink-0">格式</span>
          <span class="font-medium text-[#0F172A] max-w-[125px] sm:max-w-[165px] truncate">
            {{ activeFormat?.name ?? "通用标准文档格式" }}
          </span>
          <span class="hidden sm:inline text-[10.5px] px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] font-medium shrink-0">
            {{ activeFormat?.categoryLabel ?? "公文" }}
          </span>
          <span class="text-[#64748B] text-[11px]">▾</span>
        </button>

        <div
          v-if="openDropdown === 'format'"
          id="formatPopover"
          class="absolute left-0 top-10 w-[370px] max-w-[92vw] bg-white border border-[#E2E8F0] rounded-xl shadow-xl overflow-hidden z-50"
        >
          <div class="px-3.5 py-2.5 border-b border-[#F1F5F9] flex items-center justify-between">
            <span class="text-[12px] font-semibold text-[#0F172A]">切换当前文档的排版格式</span>
            <button
              id="popoverImportBtn"
              type="button"
              class="text-[12px] font-medium text-[#2563EB] hover:text-[#1D4ED8] cursor-pointer"
              @click="emit('openImport')"
            >
              + 导入新范例
            </button>
          </div>

          <div class="px-3 pt-2 pb-1 flex items-center gap-1 text-[11.5px]">
            <button
              v-for="cat in categories"
              :key="cat.id"
              type="button"
              class="px-2.5 py-1 rounded-md font-medium cursor-pointer"
              :class="
                popoverCat === cat.id
                  ? 'bg-[#EFF6FF] text-[#2563EB]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              "
              @click="emit('changePopoverCat', cat.id)"
            >
              {{ cat.label }}
            </button>
          </div>

          <div class="p-2 max-h-[300px] overflow-y-auto scroll-thin space-y-1">
            <div
              v-for="fmt in filteredFormats"
              :key="fmt.id"
              class="px-3 py-2 rounded-lg border transition"
              :class="
                activeFormat?.id === fmt.id
                  ? 'bg-[#EFF6FF]/70 border-[#BFDBFE]'
                  : 'border-transparent hover:bg-[#F8FAFC]'
              "
            >
              <div v-if="editingFormatId === fmt.id" class="flex items-center gap-1.5">
                <input
                  v-model="editingFormatVal"
                  type="text"
                  class="flex-1 h-7 px-2 rounded border border-[#2563EB] text-[12px] outline-none bg-white"
                  @keydown.enter="commitRenameFormat(fmt.id)"
                  @keydown.esc="editingFormatId = null"
                />
                <button
                  type="button"
                  class="px-2 py-1 rounded bg-[#2563EB] text-white text-[11px] cursor-pointer"
                  @click="commitRenameFormat(fmt.id)"
                >
                  保存
                </button>
                <button
                  type="button"
                  class="px-1.5 py-1 text-[11px] text-[#64748B] cursor-pointer"
                  @click="editingFormatId = null"
                >
                  取消
                </button>
              </div>

              <template v-else>
                <div
                  class="flex items-center justify-between gap-2 cursor-pointer"
                  @click="emit('selectFormat', fmt)"
                >
                  <span
                    class="text-[12.5px] font-medium truncate"
                    :class="activeFormat?.id === fmt.id ? 'text-[#1D4ED8]' : 'text-[#0F172A]'"
                  >
                    {{ fmt.name }}
                  </span>
                  <span class="text-[10.5px] text-[#64748B] shrink-0">
                    {{ activeFormat?.id === fmt.id ? "✓ 当前使用" : fmt.categoryLabel }}
                  </span>
                </div>

                <div class="flex items-center justify-between gap-2 mt-1 text-[11px]">
                  <span class="text-[#64748B] truncate">{{ fmt.desc }}</span>
                  <div class="flex items-center gap-1.5 shrink-0">
                    <template v-if="confirmDelFormatId === fmt.id">
                      <button
                        type="button"
                        class="px-2 py-0.5 rounded bg-[#DC2626] text-white font-medium cursor-pointer"
                        @click="emit('deleteFormat', fmt.id)"
                      >
                        确认删
                      </button>
                      <button
                        type="button"
                        class="text-[#64748B] cursor-pointer"
                        @click="confirmDelFormatId = null"
                      >
                        取消
                      </button>
                    </template>
                    <template v-else>
                      <button
                        type="button"
                        class="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                        @click="startRenameFormat(fmt)"
                      >
                        改名
                      </button>
                      <button
                        type="button"
                        class="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                        :title="'点击切换分类（当前：' + CATEGORY_LABELS[fmt.category] + '）'"
                        @click="emit('changeFormatCat', fmt.id, nextCat(fmt.category))"
                      >
                        改类
                      </button>
                      <button
                        type="button"
                        class="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                        @click="emit('duplicateFormat', fmt.id)"
                      >
                        复制
                      </button>
                      <button
                        v-if="!fmt.builtin"
                        type="button"
                        class="text-[#DC2626] hover:underline cursor-pointer"
                        @click="confirmDelFormatId = fmt.id"
                      >
                        删除
                      </button>
                    </template>
                  </div>
                </div>
              </template>
            </div>

            <div
              v-if="!filteredFormats.length"
              class="px-3 py-5 text-center text-[12px] text-[#64748B]"
            >
              该分类暂无模板，可点击右上角「+ 导入新范例」或修改已有模板分类
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧：后台异步导入胶囊 + 调试工具 + 调试开关 -->
    <div class="flex items-center gap-2 shrink-0 text-[12px]">
      <!-- 后台异步导入胶囊 -->
      <div
        v-if="bgImport"
        id="bgImportPill"
        class="flex items-center gap-2 px-3 py-1 rounded-full border text-[11.5px] tabular"
        :class="
          bgImport.error
            ? 'bg-[#FEF2F2] border-[#FECACA] text-[#DC2626]'
            : bgImport.done
              ? 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
              : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
        "
      >
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :class="
            bgImport.error
              ? 'bg-[#DC2626]'
              : bgImport.done
                ? 'bg-[#10B981]'
                : 'bg-[#2563EB] animate-ping'
          "
        ></span>
        <span class="max-w-[200px] truncate">
          <template v-if="bgImport.error">导入失败：{{ bgImport.error }}</template>
          <template v-else-if="bgImport.done">「{{ bgImport.name }}」已入库</template>
          <template v-else>
            导入「{{ bgImport.name }}」· {{ bgImport.phase }} ({{ bgImport.elapsedSec }}s)
          </template>
        </span>
        <button
          v-if="bgImport.done && bgImport.templateId"
          type="button"
          class="font-semibold underline cursor-pointer shrink-0"
          @click="emit('applyBgImport')"
        >
          应用
        </button>
        <button
          type="button"
          class="opacity-75 hover:opacity-100 cursor-pointer shrink-0"
          @click="emit('cancelBgImport')"
        >
          {{ bgImport.done ? "✕" : "取消" }}
        </button>
      </div>

      <div v-if="debug" id="debugHeaderTools" class="flex items-center gap-2">
        <button
          id="debugDrawerToggleBtn"
          type="button"
          class="xl:hidden px-2 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[11px] font-medium text-[#334155] cursor-pointer"
          @click="emit('toggleDebugDrawer')"
        >
          能力卡
        </button>

        <button
          id="forkBranchBtn"
          type="button"
          class="px-2.5 py-1 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[11px] font-medium text-[#334155] cursor-pointer"
          title="克隆当前会话全部上下文做对比实验"
          @click="emit('forkSession')"
        >
          + 分叉会话
        </button>

        <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] font-mono text-[11px] tabular">
          <span class="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
          <span id="tokenText">{{ tokenSummary }}</span>
        </div>

        <!-- 纯静态状态指示（去除伪按钮边框） -->
        <span class="hidden xl:inline-flex items-center gap-1 text-[11px] text-[#64748B] px-1">
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="langfuseEnabled ? 'bg-[#4F46E5]' : 'bg-[#10B981]'"
          ></span>
          <span>{{ langfuseEnabled ? "Langfuse 追踪" : "Pino 日志" }}</span>
        </span>

        <button
          id="visionModeToggle"
          type="button"
          class="hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] text-[11px] font-medium cursor-pointer"
          @click="emit('toggleVision')"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="visionEnabled ? 'bg-[#2563EB]' : 'bg-[#94A3B8]'"
          ></span>
          <span>{{ visionEnabled ? "文本+视觉" : "纯文本" }}</span>
        </button>

        <div class="h-4 w-px bg-[#E2E8F0]"></div>
      </div>

      <button
        id="debugToggleBtn"
        type="button"
        class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[#F8FAFC] transition cursor-pointer"
        title="开启后显示会话分叉、段落映射、Token 账单与底层诊断"
        @click="emit('toggleDebug')"
      >
        <span class="hidden sm:inline text-[12px] text-[#64748B] font-medium">调试模式</span>
        <span class="switch-track" :class="{ on: debug }">
          <span class="switch-thumb"></span>
        </span>
      </button>
    </div>
  </header>
</template>
