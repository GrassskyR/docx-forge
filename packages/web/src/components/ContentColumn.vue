<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue"
import ChatThread from "./ChatThread.vue"
import { SLOT_LABELS, type ChatTurn, type FormatOption, type MappingRow } from "../types.js"

const props = defineProps<{
  debug: boolean
  mode: "copy" | "chat"
  draftText: string
  normalizePunct: boolean
  busy: boolean
  busyLabel: string
  fidelity: number | null | undefined
  lastTokenDelta: number
  mappings: MappingRow[]
  chatMessages: ChatTurn[]
  activeFormat?: FormatOption
  slotValues: Record<string, string>
}>()

const emit = defineEmits<{
  "update:mode": [mode: "copy" | "chat"]
  "update:draftText": [value: string]
  "update:normalizePunct": [value: boolean]
  updateSlot: [key: string, value: string]
  uploadDraft: [file: File]
  applyFormat: []
  sendChat: [prompt: string]
  surgery: [kind: "compact" | "orphan" | "tighten" | "vision"]
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const scrollBox = ref<HTMLElement | null>(null)
const chatInput = ref("")

watch(
  () => [
    props.mode,
    props.chatMessages.length,
    props.chatMessages.at(-1)?.text.length ?? 0,
    props.chatMessages.at(-1)?.steps?.length ?? 0,
    props.chatMessages.at(-1)?.docUrl ?? "",
  ],
  async () => {
    if (props.mode !== "chat") return
    await nextTick()
    if (scrollBox.value) scrollBox.value.scrollTop = scrollBox.value.scrollHeight
  },
)

const extraSlots = computed(() => props.activeFormat?.fields ?? [])

function slotLabel(field: { name: string; label?: string }) {
  return field.label || SLOT_LABELS[field.name] || field.name
}

function onDraftPicked(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit("uploadDraft", file)
  input.value = ""
}

function submitChat() {
  const text = chatInput.value.trim()
  if (!text) return
  chatInput.value = ""
  emit("sendChat", text)
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
    class="w-full shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-[#E2E8F0] flex flex-col min-h-[420px] lg:min-h-0"
    :class="
      debug
        ? 'lg:w-[38%] lg:min-w-[350px] lg:max-w-[460px]'
        : 'lg:w-[44%] lg:min-w-[360px] lg:max-w-[540px]'
    "
  >
    <div class="px-5 pt-4 pb-3 border-b border-[#F1F5F9] flex items-center justify-between gap-2">
      <div class="inline-flex p-1 rounded-[10px] bg-[#F1F5F9] text-[12.5px]">
        <button
          id="tabCopy"
          type="button"
          class="px-3.5 py-1.5 rounded-[7px] font-medium transition cursor-pointer"
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
          class="px-3.5 py-1.5 rounded-[7px] font-medium transition cursor-pointer"
          :class="
            mode === 'chat'
              ? 'bg-white text-[#0F172A] shadow-2xs'
              : 'text-[#64748B] hover:text-[#0F172A]'
          "
          @click="emit('update:mode', 'chat')"
        >
          让 AI 写 / 改
        </button>
      </div>
      <span class="text-[11.5px] text-[#64748B]">
        {{ mode === "copy" ? "仅排格式，不改原文一字" : "像跟助理说话一样起草或微调" }}
      </span>
    </div>

    <div
      ref="scrollBox"
      class="flex-1 min-h-0 overflow-y-auto scroll-thin p-5 flex flex-col gap-4 select-text"
      :class="mode === 'chat' ? 'bg-[#F8FAFC]' : 'bg-white'"
    >
      <template v-if="mode === 'copy'">
        <details
          v-if="extraSlots.length"
          open
          class="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5 text-[12px]"
        >
          <summary class="cursor-pointer font-medium text-[#334155] select-none">
            封面 / 抬头信息填空（共 {{ extraSlots.length }} 项，留空则保持原封面）
          </summary>
          <div class="grid grid-cols-2 gap-2.5 pt-2.5">
            <div v-for="slot in extraSlots" :key="slot.name">
              <label class="block text-[11px] text-[#64748B] mb-0.5">{{ slotLabel(slot) }}</label>
              <input
                type="text"
                :value="slotValues[slot.name] ?? ''"
                :placeholder="'填写' + slotLabel(slot)"
                class="w-full h-8 px-2.5 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] bg-white text-[12px] text-[#0F172A] outline-none"
                @input="emit('updateSlot', slot.name, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </div>
        </details>

        <div class="flex-1 flex flex-col gap-2 min-h-[240px]">
          <div class="flex items-center justify-between text-[12px]">
            <span class="font-medium text-[#334155]">文章正文</span>
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
              导入草稿 .docx / .txt
            </button>
          </div>
          <textarea
            id="draftEditor"
            :value="draftText"
            class="flex-1 w-full rounded-xl border border-[#E2E8F0] focus:border-[#2563EB] focus:ring-2 focus:ring-[#EFF6FF] bg-[#F8FAFC]/50 focus:bg-white p-3.5 text-[13px] leading-[1.8] text-[#0F172A] outline-none resize-none transition"
            placeholder="在此粘贴或输入文章内容…"
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
          <template v-if="mappings.length">
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
            点击下方「套用格式」后，将在此展示 P0..Pn 到模板槽位/原型的精确区间映射。
          </div>
        </div>
      </template>

      <ChatThread
        v-else
        :debug="debug"
        :busy="busy"
        :messages="chatMessages"
        :active-format-name="activeFormat?.name"
        @pick-prompt="chatInput = $event"
      />
    </div>

    <div v-if="debug" id="debugSurgeryBar" class="px-5 py-2.5 border-t border-[#E2E8F0] bg-[#F8FAFC]">
      <div class="text-[10.5px] font-medium text-[#64748B] mb-1.5">调试手术工具（确定性操作）</div>
      <div class="flex flex-wrap gap-1.5 text-[11px]">
        <button
          type="button"
          class="px-2.5 py-1 rounded-full bg-white hover:bg-[#EFF6FF] hover:text-[#1D4ED8] border border-[#E2E8F0] text-[#334155] font-medium cursor-pointer"
          @click="emit('surgery', 'compact')"
        >
          一键压页收口
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-full bg-white hover:bg-[#EFF6FF] hover:text-[#1D4ED8] border border-[#E2E8F0] text-[#334155] font-medium cursor-pointer"
          @click="emit('surgery', 'orphan')"
        >
          防孤立落款
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-full bg-white hover:bg-[#EFF6FF] hover:text-[#1D4ED8] border border-[#E2E8F0] text-[#334155] font-medium cursor-pointer"
          @click="emit('surgery', 'tighten')"
        >
          行距紧缩 -1
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-full bg-white hover:bg-[#EFF6FF] hover:text-[#1D4ED8] border border-[#E2E8F0] text-[#334155] font-medium cursor-pointer"
          @click="emit('surgery', 'vision')"
        >
          强制视觉终审
        </button>
      </div>
    </div>

    <div class="px-5 py-3.5 border-t border-[#E2E8F0] bg-white">
      <div v-if="mode === 'copy'" class="flex items-center justify-between gap-3">
        <label class="flex items-center gap-2 text-[12px] text-[#475569] cursor-pointer">
          <input
            type="checkbox"
            :checked="normalizePunct"
            class="accent-[#2563EB] rounded"
            @change="emit('update:normalizePunct', ($event.target as HTMLInputElement).checked)"
          />
          <span>顺手规范公文标点（〔〕/全角冒号）</span>
        </label>
        <button
          id="applyFormatBtn"
          type="button"
          :disabled="busy"
          class="h-9 px-5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-[13px] font-medium shadow-xs transition cursor-pointer shrink-0"
          @click="emit('applyFormat')"
        >
          {{ busy ? busyLabel || "处理中…" : "套用格式" }}
        </button>
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
          placeholder="说说想写什么，或者想怎么调格式…"
          @keydown="onChatKeydown"
        ></textarea>
        <button
          id="sendChatBtn"
          type="button"
          :disabled="busy"
          class="h-8 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 text-white text-[12.5px] font-medium shrink-0 transition cursor-pointer"
          @click="submitChat"
        >
          {{ busy ? "…" : "发送" }}
        </button>
      </div>
    </div>
  </section>
</template>
