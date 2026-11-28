<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import ChatThread from "./ChatThread.vue"
import type { FormatOption, MappingRow, TimelineItem } from "../types.js"

const props = defineProps<{
  debug: boolean
  mode: "copy" | "chat"
  draftText: string
  slotValues: Record<string, string>
  generateCover: boolean
  generateToc: boolean
  normalizePunct: boolean
  busy: boolean
  busyKind: "copy" | "chat" | "surgery" | null
  busyLabel: string
  elapsedSec: number
  fidelity: number | null | undefined
  lastTokenDelta: number
  mappings: MappingRow[]
  timeline: TimelineItem[]
  chatMessageCount: number
  templateSwitchGuard: boolean
  draftClearedNotice: boolean
  activeFormat?: FormatOption
  suggestedDocxName: string
}>()

const emit = defineEmits<{
  "update:mode": [mode: "copy" | "chat"]
  "update:draftText": [value: string]
  "update:generateCover": [value: boolean]
  "update:generateToc": [value: boolean]
  "update:normalizePunct": [value: boolean]
  updateSlot: [key: string, value: string]
  fillSample: []
  clearDraft: []
  uploadDraft: [file: File]
  applyFormat: []
  stopTask: []
  sendChat: [prompt: string]
  clearChat: []
  createSession: []
  dismissTemplateGuard: []
  dismissDraftCleared: []
  downloadDoc: [url?: string]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const scrollBox = ref<HTMLElement | null>(null)
const chatInput = ref("")

const lastAssistantStepCount = computed(() => {
  const last = props.timeline.at(-1)
  return last && last.kind === "assistant" ? last.steps.length : 0
})

const lastAssistantTextLen = computed(() => {
  const last = props.timeline.at(-1)
  return last && last.kind === "assistant" ? last.text.length : 0
})

watch(
  () => [
    props.mode,
    props.timeline.length,
    lastAssistantTextLen.value,
    lastAssistantStepCount.value,
  ],
  async () => {
    if (props.mode !== "chat") return
    await nextTick()
    if (scrollBox.value) scrollBox.value.scrollTop = scrollBox.value.scrollHeight
  },
)

const extraSlots = computed(() => props.activeFormat?.fields ?? [])
const hasDraft = computed(() => props.draftText.trim().length > 0)

const filledSlotCount = computed(
  () => Object.values(props.slotValues).filter((v) => v?.trim()).length,
)

const contextBannerText = computed(() => {
  const chars = props.draftText.trim().length
  const totalSlots = extraSlots.value.length
  if (chars > 0 || filledSlotCount.value > 0) {
    return (
      "已实时关联当前底稿：正文 " +
      chars +
      " 字" +
      (totalSlots ? ` · 已填 ${filledSlotCount.value}/${totalSlots} 项信息` : "")
    )
  }
  return "当前底稿为空，AI 起草后将自动同步回「原文字套格式」"
})

function slotPlaceholder(slot: { label: string; sample?: string }) {
  if (slot.sample) return `例：${slot.sample}（留空则置空）`
  return `填写${slot.label}（留空则置空）`
}

function onDraftPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit("uploadDraft", file)
  input.value = ""
}

function submitChat() {
  const text = chatInput.value.trim()
  if (!text || props.busy) return
  chatInput.value = ""
  emit("sendChat", text)
}

function onPickPrompt(promptText: string) {
  chatInput.value = promptText
  submitChat()
}

function onChatKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    submitChat()
  }
}
</script>

<template>
  <section
    id="contentCol"
    class="w-full lg:w-[42%] lg:min-w-[310px] lg:max-w-[510px] lg:shrink bg-white lg:border-r border-[#E2E8F0] flex flex-col flex-1 lg:flex-none min-h-0"
  >
    <div class="px-4 pt-3 pb-2.5 border-b border-[#F1F5F9] flex items-center justify-between gap-2 shrink-0">
      <div class="inline-flex p-1 rounded-[10px] bg-[#F1F5F9] text-[12px]">
        <button
          id="tabCopy"
          type="button"
          class="px-3 py-1.5 rounded-[7px] font-medium transition cursor-pointer"
          :class="
            mode === 'copy'
              ? 'bg-white text-[#0F172A] shadow-2xs'
              : 'text-[#64748B] hover:text-[#0F172A]'
          "
          @click="emit('update:mode', 'copy')"
        >
          原文字套格式
        </button>
        <button
          id="tabChat"
          type="button"
          class="px-3 py-1.5 rounded-[7px] font-medium transition cursor-pointer flex items-center gap-1.5"
          :class="
            mode === 'chat'
              ? 'bg-white text-[#0F172A] shadow-2xs'
              : 'text-[#64748B] hover:text-[#0F172A]'
          "
          @click="emit('update:mode', 'chat')"
        >
          <span>让 AI 写 / 改</span>
          <span
            id="chatCountPill"
            class="px-1.5 py-0.25 rounded-full text-[10.5px] tabular"
            :class="
              mode === 'chat'
                ? 'bg-[#EFF6FF] text-[#2563EB]'
                : 'bg-[#E2E8F0]/80 text-[#475569]'
            "
          >
            {{ chatMessageCount }}
          </span>
        </button>
      </div>

      <!-- 聊天快捷操作：清空对话 / + 新对话 -->
      <div v-if="mode === 'chat'" id="chatTopActions" class="flex items-center gap-1.5 shrink-0">
        <button
          id="clearChatBtn"
          type="button"
          :disabled="chatMessageCount === 0 || busy"
          title="仅清空当前 AI 对话记忆，保留左侧底稿与模板"
          class="h-7 px-2.5 rounded-md border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed text-[11.5px] text-[#475569] hover:text-[#0F172A] transition cursor-pointer"
          @click="emit('clearChat')"
        >
          清空对话
        </button>
        <button
          id="quickNewChatBtn"
          type="button"
          title="开启一条全新的空白对话与文档"
          class="h-7 px-2.5 rounded-md bg-[#EFF6FF] hover:bg-[#DBEAFE] border border-[#BFDBFE] text-[11.5px] font-medium text-[#1D4ED8] transition cursor-pointer"
          @click="emit('createSession')"
        >
          + 新对话
        </button>
      </div>
      <span v-else class="text-[11.5px] text-[#64748B] truncate">
        共用同一份底稿，无缝接力
      </span>
    </div>

    <!-- 对话模式下顶部底稿联动状态条 -->
    <div
      v-if="mode === 'chat'"
      class="px-4 py-2 bg-[#F8FAFC] border-b border-[#E2E8F0] flex items-center justify-between gap-2 text-[11.5px] shrink-0"
    >
      <span class="text-[#475569] truncate">{{ contextBannerText }}</span>
      <button
        type="button"
        class="text-[#2563EB] hover:underline font-medium shrink-0 cursor-pointer"
        @click="emit('update:mode', 'copy')"
      >
        查看底稿 →
      </button>
    </div>

    <!-- 已有对话时切换模板的防上下文污染提示条 -->
    <div
      v-if="mode === 'chat' && templateSwitchGuard && chatMessageCount > 0"
      id="tplGuardBanner"
      class="px-4 py-2.5 bg-[#FFFBEB] border-b border-[#FDE68A] flex flex-wrap items-center justify-between gap-2 text-[11.5px] shrink-0"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span class="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0"></span>
        <span class="text-[#92400E]">
          已切换为「{{ activeFormat?.name ?? "新格式" }}」· 若准备写新文章，建议开新对话避免旧上下文干扰
        </span>
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          id="guardNewSessionBtn"
          type="button"
          class="px-2.5 py-1 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium cursor-pointer"
          @click="emit('createSession')"
        >
          用新模板开新对话
        </button>
        <button
          id="guardClearChatBtn"
          type="button"
          class="px-2 py-1 rounded-md bg-white border border-[#FCD34D] text-[#92400E] hover:bg-[#FEF3C7] cursor-pointer"
          @click="emit('clearChat')"
        >
          仅清空旧对话
        </button>
        <button
          id="guardDismissBtn"
          type="button"
          title="忽略提示"
          class="px-1.5 py-1 text-[#92400E]/70 hover:text-[#92400E] cursor-pointer"
          @click="emit('dismissTemplateGuard')"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- 清空正文时的同步清空上下文提示条 -->
    <div
      v-if="draftClearedNotice && chatMessageCount > 0"
      id="draftClearedBanner"
      class="px-4 py-2 bg-[#EFF6FF] border-b border-[#BFDBFE] flex flex-wrap items-center justify-between gap-2 text-[11.5px] shrink-0"
    >
      <span class="text-[#1E40AF]">
        已清空正文，当前会话仍有历史 AI 对话，是否同步清空上下文？
      </span>
      <div class="flex items-center gap-1.5 shrink-0">
        <button
          id="syncClearChatBtn"
          type="button"
          class="px-2.5 py-1 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium cursor-pointer"
          @click="emit('clearChat')"
        >
          同步清空对话
        </button>
        <button
          id="dismissDraftClearedBtn"
          type="button"
          class="px-2 py-1 text-[#475569] hover:text-[#0F172A] cursor-pointer"
          @click="emit('dismissDraftCleared')"
        >
          保留
        </button>
      </div>
    </div>

    <div
      ref="scrollBox"
      class="flex-1 min-h-0 overflow-y-auto scroll-thin p-4 flex flex-col gap-3.5 select-text"
      :class="mode === 'chat' ? 'bg-[#F8FAFC]' : 'bg-white'"
    >
      <template v-if="mode === 'copy'">
        <details
          v-if="extraSlots.length"
          open
          class="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-[12px]"
        >
          <summary class="cursor-pointer font-medium text-[#334155] flex items-center justify-between select-none">
            <span>文档信息填空（共 {{ extraSlots.length }} 项，留空项将自动置空）</span>
          </summary>
          <div class="grid grid-cols-2 gap-2.5 pt-2.5">
            <div
              v-for="slot in extraSlots"
              :key="slot.name"
              :class="extraSlots.length === 1 ? 'col-span-2' : ''"
            >
              <label class="block text-[11px] text-[#64748B] mb-0.5">{{ slot.label }}</label>
              <input
                type="text"
                :value="slotValues[slot.name] ?? ''"
                :placeholder="slotPlaceholder(slot)"
                class="w-full h-8 px-2.5 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] bg-white text-[12px] text-[#0F172A] placeholder-[#94A3B8] outline-none"
                @input="emit('updateSlot', slot.name, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </details>

        <div class="flex-1 flex flex-col gap-2 min-h-[220px]">
          <div class="flex items-center justify-between text-[12px]">
            <span class="font-medium text-[#334155]">文章正文</span>
            <div class="flex items-center gap-2.5">
              <button
                v-if="!hasDraft"
                id="fillSampleBtn"
                type="button"
                class="text-[#2563EB] hover:underline font-medium cursor-pointer"
                @click="emit('fillSample')"
              >
                填入示例正文
              </button>
              <button
                v-else
                id="clearDraftBtn"
                type="button"
                class="text-[#64748B] hover:text-[#0F172A] cursor-pointer"
                @click="emit('clearDraft')"
              >
                清空正文
              </button>
              <input
                ref="fileInput"
                type="file"
                accept=".docx,.txt,.md"
                class="hidden"
                @change="onDraftPicked"
              />
              <button
                id="uploadDraftBtn"
                type="button"
                class="text-[#2563EB] hover:underline font-medium cursor-pointer"
                @click="fileInput?.click()"
              >
                导入草稿 .docx/.txt
              </button>
            </div>
          </div>
          <textarea
            id="draftEditor"
            :value="draftText"
            class="flex-1 w-full rounded-xl border border-[#E2E8F0] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EFF6FF] bg-[#F8FAFC]/50 focus:bg-white p-3.5 text-[13px] leading-[1.8] text-[#0F172A] placeholder-[#94A3B8] outline-none resize-none transition"
            placeholder="在此粘贴或输入正文内容…（也可切到「让 AI 写 / 改」由 AI 起草后自动回填此处）"
            @input="emit('update:draftText', ($event.target as HTMLTextAreaElement).value)"
          ></textarea>
        </div>

        <div v-if="debug" id="debugMappingBox" class="space-y-1.5 pt-2 border-t border-[#F1F5F9]">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-semibold text-[#0F172A]">[调试] 零拷贝段落 ID 映射</span>
            <span class="font-mono text-[#059669] tabular">
              {{ fidelity === 1 || mappings.length ? "100% 逐字保真" : "待执行套版" }}
              <template v-if="lastTokenDelta > 0"> · {{ lastTokenDelta }} tok</template>
            </span>
          </div>
          <template v-if="mappings.length && hasDraft">
            <div
              v-for="row in mappings"
              :key="row.id + row.target"
              class="px-2.5 py-1.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-between gap-2 text-[11px]"
            >
              <span class="font-mono text-[#334155] shrink-0">
                {{ row.id }} → <span class="text-[#2563EB]">{{ row.target }}</span>
              </span>
              <span class="text-[#64748B] truncate">{{ row.text }}</span>
            </div>
          </template>
          <div
            v-else
            class="px-2.5 py-2 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[11px] text-[#64748B]"
          >
            填写正文并点击「套用格式」后，将在此展示 P0..Pn 段落区间映射。
          </div>
        </div>
      </template>

      <ChatThread
        v-else
        :debug="debug"
        :busy="busy && busyKind === 'chat'"
        :busy-label="busyLabel"
        :elapsed-sec="elapsedSec"
        :items="timeline"
        :active-format-name="activeFormat?.name"
        :has-draft="hasDraft"
        :suggested-docx-name="suggestedDocxName"
        @pick-prompt="onPickPrompt"
        @download-doc="emit('downloadDoc', $event)"
      />
    </div>

    <div class="px-4 py-3 border-t border-[#E2E8F0] bg-white shrink-0">
      <div v-if="mode === 'copy'" class="space-y-2.5">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-[#475569]">
          <label
            v-if="!activeFormat?.hasCover"
            class="inline-flex items-center gap-1.5 cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="generateCover"
              class="accent-[#2563EB] rounded"
              @change="emit('update:generateCover', ($event.target as HTMLInputElement).checked)"
            />
            <span>自动生成独立封面</span>
          </label>
          <label
            v-if="!activeFormat?.hasToc"
            class="inline-flex items-center gap-1.5 cursor-pointer"
          >
            <input
              type="checkbox"
              :checked="generateToc"
              class="accent-[#2563EB] rounded"
              @change="emit('update:generateToc', ($event.target as HTMLInputElement).checked)"
            />
            <span>自动生成目录</span>
          </label>
          <label class="inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              :checked="normalizePunct"
              class="accent-[#2563EB] rounded"
              @change="emit('update:normalizePunct', ($event.target as HTMLInputElement).checked)"
            />
            <span>规范公文标点</span>
          </label>
        </div>

        <div class="flex items-center justify-between gap-2">
          <div class="text-[12px] min-w-0 truncate tabular">
            <span
              v-if="busy && busyKind === 'copy'"
              class="inline-flex items-center gap-1.5 text-[#2563EB] font-medium"
            >
              <span class="w-2 h-2 rounded-full bg-[#2563EB] animate-ping"></span>
              <span>{{ busyLabel || "正在排版…" }} ({{ elapsedSec }}s)</span>
            </span>
            <span v-else class="text-[#64748B]">
              {{ hasDraft ? "就绪，点击右侧按当前格式生成 Word" : "请先粘贴、输入或导入正文内容" }}
            </span>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="busy && busyKind === 'copy'"
              id="stopCopyBtn"
              type="button"
              class="h-9 px-3.5 rounded-lg border border-[#DC2626] text-[#DC2626] hover:bg-[#FEF2F2] text-[12.5px] font-medium transition cursor-pointer"
              @click="emit('stopTask')"
            >
              ■ 停止
            </button>
            <button
              id="applyFormatBtn"
              type="button"
              :disabled="!hasDraft || busy"
              :title="hasDraft ? '按当前格式排版生成 Word' : '请先输入或导入正文内容'"
              class="h-9 px-5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 disabled:cursor-not-allowed text-white text-[13px] font-medium shadow-xs transition cursor-pointer shrink-0"
              @click="emit('applyFormat')"
            >
              套用格式
            </button>
          </div>
        </div>
      </div>

      <div
        v-else
        class="rounded-xl border border-[#CBD5E1] focus-within:border-[#2563EB] focus-within:ring-2 focus-within:ring-[#EFF6FF] bg-white px-3 py-2 flex items-end gap-2 transition"
      >
        <textarea
          id="chatInput"
          v-model="chatInput"
          rows="2"
          class="w-full text-[13px] leading-relaxed text-[#0F172A] placeholder-[#94A3B8] outline-none resize-none bg-transparent"
          placeholder="说说想写什么，或让 AI 润色/微调左侧底稿…"
          @keydown="onChatKeydown"
        ></textarea>
        <button
          v-if="busy && busyKind === 'chat'"
          id="stopChatBtn"
          type="button"
          class="h-8 px-3.5 rounded-lg border border-[#DC2626] text-[#DC2626] hover:bg-[#FEF2F2] text-[12px] font-medium shrink-0 transition cursor-pointer"
          @click="emit('stopTask')"
        >
          ■ 停止
        </button>
        <button
          v-else
          id="sendChatBtn"
          type="button"
          :disabled="!chatInput.trim() || busy"
          :title="chatInput.trim() ? '发送 (Enter)' : '请输入对话指令'"
          class="h-8 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 disabled:cursor-not-allowed text-white text-[12.5px] font-medium shrink-0 transition cursor-pointer"
          @click="submitChat"
        >
          发送
        </button>
      </div>
    </div>
  </section>
</template>
