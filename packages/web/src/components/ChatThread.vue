<script setup lang="ts">
import { ref } from "vue"
import MarkdownIt from "markdown-it"
import DOMPurify from "dompurify"
import type { TimelineItem } from "../types.js"

defineProps<{
  debug: boolean
  busy: boolean
  busyLabel: string
  elapsedSec: number
  items: TimelineItem[]
  activeFormatName?: string
  hasDraft: boolean
  suggestedDocxName: string
}>()

const emit = defineEmits<{
  pickPrompt: [text: string]
  downloadDoc: [url?: string]
}>()

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const copiedIdx = ref<number | null>(null)

function renderMd(raw: string) {
  return DOMPurify.sanitize(md.render(raw))
}

function toggleCollapsed(item: Extract<TimelineItem, { kind: "assistant" }>) {
  if (item.streaming) return
  item.collapsed = !item.collapsed
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
  <div class="flex-1 flex flex-col gap-3.5">
    <div
      v-if="!items.length"
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
        基于「{{ activeFormatName || "当前模板" }}」起草或精修
      </div>
      <div class="text-[12px] text-[#64748B] max-w-[330px] leading-relaxed">
        每个文档会话独立保存历史记录；AI 生成的内容会自动同步回左侧编辑器，未填槽位自动置空不残留原件旧信息。
      </div>
      <div class="flex flex-wrap justify-center gap-2 pt-1">
        <button
          type="button"
          class="px-3 py-1.5 rounded-full bg-white hover:bg-[#EFF6FF] hover:border-[#BFDBFE] border border-[#E2E8F0] text-[11.5px] text-[#334155] shadow-2xs transition cursor-pointer"
          @click="emit('pickPrompt', '按当前模板帮我起草一份完整的文档初稿，章节清晰并填入合适标题。')"
        >
          按当前模板起草初稿
        </button>
        <button
          v-if="hasDraft"
          type="button"
          class="px-3 py-1.5 rounded-full bg-white hover:bg-[#EFF6FF] hover:border-[#BFDBFE] border border-[#E2E8F0] text-[11.5px] text-[#334155] shadow-2xs transition cursor-pointer"
          @click="emit('pickPrompt', '请结合我左侧当前的草稿内容进行润色扩充，并按当前模板重新排版。')"
        >
          润色左侧草稿并排版
        </button>
      </div>
    </div>

    <template v-for="(item, idx) in items" :key="idx">
      <!-- 系统事件分隔提示条（如切换格式） -->
      <div
        v-if="item.kind === 'event'"
        class="flex items-center gap-2 py-1 text-[11px] text-[#64748B]"
      >
        <div class="h-px flex-1 bg-[#E2E8F0]"></div>
        <span class="px-2.5 py-0.5 rounded-full bg-white border border-[#E2E8F0]">
          {{ item.text }}
        </span>
        <div class="h-px flex-1 bg-[#E2E8F0]"></div>
      </div>

      <!-- 用户消息气泡 -->
      <div
        v-else-if="item.kind === 'user'"
        class="chat-row-user flex items-start justify-end gap-2.5"
      >
        <div class="chat-bubble-user max-w-[82%] rounded-2xl rounded-tr-xs bg-[#2563EB] text-white px-4 py-2.5 text-[13px] leading-[1.7] shadow-xs whitespace-pre-wrap break-words">
          {{ item.text }}
        </div>
        <div class="w-7 h-7 rounded-full bg-[#DBEAFE] text-[#1D4ED8] text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
          我
        </div>
      </div>

      <!-- AI 助手气泡（含白话阶段卡 + 秒表 + 可折叠摘要） -->
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

        <div class="chat-bubble-assistant w-full max-w-[88%] min-w-0 rounded-2xl rounded-tl-xs bg-white border border-[#E2E8F0] shadow-xs px-4 py-3 space-y-2.5">
          <div class="flex items-center justify-between gap-2 pb-1 border-b border-[#F1F5F9]">
            <div class="flex items-center gap-1.5">
              <span class="text-[11.5px] font-semibold text-[#0F172A]">DocForge 排版助手</span>
              <span
                v-if="item.streaming && busy"
                class="inline-flex items-center gap-1 text-[11px] text-[#2563EB] font-medium tabular"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-[#2563EB] animate-ping"></span>
                <span>生成中 · {{ elapsedSec }}s</span>
              </span>
            </div>
            <button
              v-if="item.text"
              type="button"
              class="text-[11px] text-[#64748B] hover:text-[#0F172A] cursor-pointer"
              @click="copyText(item.text, idx)"
            >
              {{ copiedIdx === idx ? "已复制" : "复制" }}
            </button>
          </div>

          <!-- 执行中实时阶段卡片 -->
          <div
            v-if="item.streaming"
            class="rounded-xl border border-[#DBEAFE] bg-[#F8FAFC] px-3 py-2.5 text-[11.5px] space-y-1.5"
          >
            <div class="flex items-center justify-between gap-2 font-medium text-[#1D4ED8] tabular">
              <span>{{ busyLabel || "正在处理…" }}</span>
              <span>{{ elapsedSec }}s</span>
            </div>
            <div v-if="item.steps.length" class="space-y-1 pt-0.5 text-[#475569]">
              <div v-for="(step, sIdx) in item.steps" :key="sIdx" class="flex items-center gap-1.5">
                <span v-if="step.status === 'running'" class="text-[#2563EB]">●</span>
                <span v-else-if="step.status === 'warn'" class="text-[#D97706]">⚠</span>
                <span v-else class="text-[#059669]">✓</span>
                <span>{{ step.label }}</span>
                <span v-if="debug && step.rawName" class="font-mono text-[10.5px] text-[#94A3B8]">
                  ({{ step.rawName }})
                </span>
              </div>
            </div>
          </div>

          <!-- 完成后自动折叠为单行摘要 -->
          <div
            v-else-if="item.steps.length"
            class="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[11.5px] cursor-pointer select-none"
            @click="toggleCollapsed(item)"
          >
            <div class="flex items-center justify-between gap-2 text-[#475569] tabular">
              <span>
                ✓ 已完成 {{ item.steps.length }} 步排版与版面核查
                <template v-if="item.elapsed"> · 耗时 {{ item.elapsed }}s</template>
              </span>
              <span class="text-[#64748B] shrink-0">
                {{ item.collapsed && !debug ? "详情 ▾" : "收起 ▴" }}
              </span>
            </div>
            <div
              v-if="!item.collapsed || debug"
              class="mt-2 pt-2 border-t border-[#E2E8F0] space-y-1 text-[#334155]"
            >
              <div v-for="(step, sIdx) in item.steps" :key="sIdx" class="flex items-center gap-1.5">
                <span>{{ step.status === "warn" ? "⚠" : "✓" }}</span>
                <span>{{ step.label }}</span>
                <span v-if="debug && step.rawName" class="font-mono text-[10.5px] text-[#94A3B8]">
                  ({{ step.rawName }})
                </span>
              </div>
            </div>
          </div>

          <div
            v-if="item.text"
            class="chat-md"
            v-html="renderMd(item.text)"
          ></div>

          <button
            v-if="item.docUrl"
            type="button"
            class="w-full mt-1 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#EFF6FF]/70 hover:bg-[#EFF6FF] border border-[#BFDBFE] text-[12px] text-[#1D4ED8] font-medium transition cursor-pointer text-left"
            @click="emit('downloadDoc', item.docUrl)"
          >
            <span class="truncate">
              已生成「{{ suggestedDocxName }}」（共 {{ item.docPages || 1 }} 页）
            </span>
            <span class="shrink-0 underline">下载 Word</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
