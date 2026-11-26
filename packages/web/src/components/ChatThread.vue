<script setup lang="ts">
import { ref } from "vue"
import MarkdownIt from "markdown-it"
import DOMPurify from "dompurify"
import type { ChatTurn } from "../types.js"

defineProps<{
  debug: boolean
  busy: boolean
  messages: ChatTurn[]
  activeFormatName?: string
}>()

const emit = defineEmits<{
  pickPrompt: [text: string]
}>()

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const copiedIdx = ref<number | null>(null)

function renderMd(raw: string) {
  return DOMPurify.sanitize(md.render(raw))
}

async function copyText(text: string, idx: number) {
  await navigator.clipboard?.writeText(text).catch(() => {})
  copiedIdx.value = idx
  setTimeout(() => {
    if (copiedIdx.value === idx) copiedIdx.value = null
  }, 1500)
}
</script>

<template>
  <div class="flex-1 flex flex-col gap-4">
    <div
      v-if="!messages.length"
      class="flex-1 flex flex-col justify-center items-center text-center px-4 py-8 gap-3"
    >
      <div class="w-10 h-10 rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center">
        <svg
          class="w-5 h-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <div class="text-[13.5px] font-semibold text-[#0F172A]">
        基于「{{ activeFormatName || "当前模板" }}」起草或微调
      </div>
      <div class="text-[12px] text-[#64748B] max-w-[320px] leading-relaxed">
        直接描述你要写的主题、封面信息或版式调整要求，AI 会自动调用当前激活模板完成留壳排版。
      </div>
      <div class="flex flex-wrap justify-center gap-2 pt-1">
        <button
          type="button"
          class="px-3 py-1.5 rounded-full bg-white hover:bg-[#EFF6FF] hover:border-[#BFDBFE] border border-[#E2E8F0] text-[11.5px] text-[#334155] shadow-2xs transition cursor-pointer"
          @click="emit('pickPrompt', '按当前模板帮我起草一份完整的文档，章节结构清晰并填入标题。')"
        >
          按当前模板起草初稿
        </button>
        <button
          type="button"
          class="px-3 py-1.5 rounded-full bg-white hover:bg-[#EFF6FF] hover:border-[#BFDBFE] border border-[#E2E8F0] text-[11.5px] text-[#334155] shadow-2xs transition cursor-pointer"
          @click="emit('pickPrompt', '查看当前已激活的模板资产与槽位详情，并总结排版要点。')"
        >
          查看当前激活模板要点
        </button>
      </div>
    </div>

    <template v-for="(msg, idx) in messages" :key="idx">
      <!-- User Bubble (Right) -->
      <div v-if="msg.role === 'user'" class="chat-row-user flex items-start justify-end gap-2.5">
        <div class="chat-bubble-user max-w-[80%] rounded-2xl rounded-tr-xs bg-[#2563EB] text-white px-4 py-2.5 text-[13px] leading-[1.7] shadow-xs whitespace-pre-wrap break-words">
          {{ msg.text }}
        </div>
        <div class="w-7 h-7 rounded-full bg-[#DBEAFE] text-[#1D4ED8] text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
          我
        </div>
      </div>

      <!-- Assistant Bubble (Left) -->
      <div v-else class="chat-row-assistant flex items-start gap-2.5">
        <div class="w-7 h-7 rounded-lg bg-[#0F172A] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
          <svg
            class="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path class="fill-none" d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" />
          </svg>
        </div>

        <div class="chat-bubble-assistant max-w-[86%] min-w-[200px] rounded-2xl rounded-tl-xs bg-white border border-[#E2E8F0] shadow-xs px-4 py-3 space-y-2.5">
          <div class="flex items-center justify-between gap-2 pb-1 border-b border-[#F1F5F9]">
            <div class="flex items-center gap-1.5">
              <span class="text-[11.5px] font-semibold text-[#0F172A]">DocForge 排版助手</span>
              <span
                v-if="busy && idx === messages.length - 1"
                class="inline-flex items-center gap-1 text-[10.5px] text-[#2563EB] font-medium"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-pulse"></span>
                <span>生成中</span>
              </span>
            </div>
            <button
              v-if="msg.text"
              type="button"
              class="text-[11px] text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              @click="copyText(msg.text, idx)"
            >
              {{ copiedIdx === idx ? "已复制" : "复制" }}
            </button>
          </div>

          <details
            v-if="debug && msg.steps?.length"
            open
            class="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 text-[11px]"
          >
            <summary class="cursor-pointer font-medium text-[#475569]">
              [调试] Pi-Agent 工具执行与双轨检查轨迹 ({{ msg.steps.length }}步)
            </summary>
            <div class="mt-2 space-y-1">
              <div
                v-for="(step, sIdx) in msg.steps"
                :key="sIdx"
                class="px-2 py-1 rounded bg-white border border-[#E2E8F0] text-[#334155]"
              >
                {{ step.status === "ok" ? "✓" : step.status === "warn" ? "⚠" : "●" }}
                {{ step.text }}
              </div>
            </div>
          </details>

          <div
            v-if="msg.text"
            class="chat-md"
            v-html="renderMd(msg.text)"
          ></div>
          <div v-else-if="busy" class="text-[12.5px] text-[#64748B] py-1">
            正在调用模板引擎排版并执行审计…
          </div>

          <a
            v-if="msg.docUrl"
            :href="msg.docUrl"
            download
            class="mt-1 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#EFF6FF]/70 hover:bg-[#EFF6FF] border border-[#BFDBFE] text-[12px] text-[#1D4ED8] font-medium transition no-underline"
          >
            <span>已生成 Word 成品（共 {{ msg.docPages || 1 }} 页，右侧可预览）</span>
            <span class="shrink-0 underline">下载 .docx</span>
          </a>
        </div>
      </div>
    </template>
  </div>
</template>
