<script setup lang="ts">
import { computed } from "vue"
import type { CategoryId, FormatOption, SessionBranch, UsageSnapshot } from "../types"

const props = defineProps<{
  debug: boolean
  popoverOpen: boolean
  popoverCat: CategoryId
  formats: FormatOption[]
  activeFormat?: FormatOption
  branches: SessionBranch[]
  activeBranchId: string
  usage: UsageSnapshot
  visionEnabled: boolean
  langfuseEnabled?: boolean
}>()

const emit = defineEmits<{
  toggleDebug: []
  togglePopover: []
  changePopoverCat: [cat: CategoryId]
  selectFormat: [fmt: FormatOption]
  openImport: []
  forkBranch: []
  switchBranch: [id: string]
  toggleVision: []
}>()

const categories: { id: CategoryId; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "gongwen", label: "公文" },
  { id: "thesis", label: "论文" },
  { id: "contract", label: "合同/表" },
]

const filteredFormats = computed(() =>
  props.popoverCat === "all"
    ? props.formats
    : props.formats.filter((item) => item.category === props.popoverCat),
)

const tokenSummary = computed(() => {
  const tok = props.usage.total_tokens.toLocaleString() + " tok"
  if (props.usage.cost_usd !== null && props.usage.cost_usd > 0) {
    return tok + " · $" + props.usage.cost_usd.toFixed(4)
  }
  return tok + " · 实时计量"
})
</script>

<template>
  <header class="h-[54px] shrink-0 bg-white border-b border-[#E2E8F0] px-5 flex items-center justify-between gap-4 z-30">
    <div class="flex items-center gap-3.5 min-w-0">
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
        <span class="font-semibold text-[14.5px] tracking-tight text-[#0F172A]">DocForge</span>
      </div>

      <div class="h-4 w-px bg-[#E2E8F0]"></div>

      <div class="relative" @click.stop>
        <button
          id="formatPickerBtn"
          type="button"
          class="h-8 pl-3 pr-2.5 rounded-lg bg-[#F8FAFC] hover:bg-[#F1F5F9] border border-[#E2E8F0] flex items-center gap-2 text-[12.5px] transition cursor-pointer"
          @click="emit('togglePopover')"
        >
          <span class="text-[#64748B]">格式</span>
          <span class="font-medium text-[#0F172A] max-w-[200px] truncate">
            {{ activeFormat?.name ?? "国标公文格式" }}
          </span>
          <span class="text-[10.5px] px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#2563EB] font-medium">
            {{ activeFormat?.categoryLabel ?? "公文" }}
          </span>
          <svg
            class="w-3.5 h-3.5 text-[#64748B]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <div
          v-if="popoverOpen"
          id="formatPopover"
          class="absolute left-0 top-10 w-[340px] bg-white border border-[#E2E8F0] rounded-xl shadow-xl overflow-hidden z-50"
        >
          <div class="p-3 border-b border-[#F1F5F9] flex items-center justify-between">
            <span class="text-[12.5px] font-semibold text-[#0F172A]">选择文档格式</span>
            <button
              id="popoverImportBtn"
              type="button"
              class="text-[12px] font-medium text-[#2563EB] hover:text-[#1D4ED8] flex items-center gap-1 cursor-pointer"
              @click="emit('openImport')"
            >
              <span>+ 导入新范例</span>
            </button>
          </div>
          <div class="px-3 pt-2.5 pb-1.5 flex items-center gap-1 text-[11.5px]">
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
            <button
              v-for="fmt in filteredFormats"
              :key="fmt.kind + ':' + fmt.id"
              type="button"
              class="w-full text-left px-3 py-2.5 rounded-lg transition cursor-pointer"
              :class="
                activeFormat?.id === fmt.id && activeFormat?.kind === fmt.kind
                  ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                  : 'hover:bg-[#F8FAFC]'
              "
              @click="emit('selectFormat', fmt)"
            >
              <div class="flex items-center justify-between gap-2">
                <span
                  class="text-[12.5px] font-medium truncate"
                  :class="
                    activeFormat?.id === fmt.id && activeFormat?.kind === fmt.kind
                      ? 'text-[#1D4ED8]'
                      : 'text-[#0F172A]'
                  "
                >
                  {{ fmt.name }}
                </span>
                <span class="text-[10.5px] text-[#64748B] shrink-0">
                  {{
                    activeFormat?.id === fmt.id && activeFormat?.kind === fmt.kind
                      ? "✓ 使用中"
                      : fmt.categoryLabel
                  }}
                </span>
              </div>
              <div class="text-[11px] text-[#64748B] mt-0.5 truncate">{{ fmt.desc }}</div>
            </button>
            <div
              v-if="!filteredFormats.length"
              class="px-3 py-5 text-center text-[12px] text-[#64748B]"
            >
              该分类暂无模板，可点击右上角「+ 导入新范例」
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2.5 shrink-0 text-[12px]">
      <div v-if="debug" id="debugHeaderTools" class="flex items-center gap-2">
        <div class="flex items-center bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg p-0.5">
          <select
            id="branchSelect"
            :value="activeBranchId"
            class="bg-transparent text-[11.5px] font-medium text-[#0F172A] py-1 pl-2 pr-1 outline-none cursor-pointer"
            @change="emit('switchBranch', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="br in branches" :key="br.id" :value="br.id">
              {{ br.name }} ({{ br.message_count }}条)
            </option>
          </select>
          <button
            id="forkBranchBtn"
            type="button"
            class="px-2 py-1 rounded-md text-[11px] font-medium text-[#475569] hover:bg-white transition cursor-pointer"
            @click="emit('forkBranch')"
          >
            + 分叉
          </button>
        </div>

        <div class="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#ECFDF5] border border-[#A7F3D0] text-[#047857] font-mono text-[11px] tabular">
          <span class="w-1.5 h-1.5 rounded-full bg-[#10B981]"></span>
          <span id="tokenText">{{ tokenSummary }}</span>
        </div>

        <div
          class="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium"
          :class="
            langfuseEnabled
              ? 'bg-[#EEF2FF] border-[#C7D2FE] text-[#4338CA]'
              : 'bg-[#F8FAFC] border-[#E2E8F0] text-[#475569]'
          "
        >
          <span
            class="w-1.5 h-1.5 rounded-full"
            :class="langfuseEnabled ? 'bg-[#4F46E5]' : 'bg-[#64748B]'"
          ></span>
          <span>{{ langfuseEnabled ? "Langfuse 追踪" : "Pino 日志" }}</span>
        </div>

        <button
          id="visionModeToggle"
          type="button"
          class="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] text-[11px] font-medium cursor-pointer"
          @click="emit('toggleVision')"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="visionEnabled ? 'bg-[#2563EB]' : 'bg-[#94A3B8]'"
          ></span>
          <span>{{ visionEnabled ? "文本 + 视觉双轨" : "纯文本模式" }}</span>
        </button>

        <div class="h-4 w-px bg-[#E2E8F0]"></div>
      </div>

      <button
        id="debugToggleBtn"
        type="button"
        class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-[#F8FAFC] transition cursor-pointer"
        title="开启后显示模板能力卡、段落映射、Token 账单与 OOXML/Poppler/视觉诊断"
        @click="emit('toggleDebug')"
      >
        <span class="text-[12px] text-[#64748B] font-medium">调试模式</span>
        <span class="switch-track" :class="{ on: debug }">
          <span class="switch-thumb"></span>
        </span>
      </button>
    </div>
  </header>
</template>
