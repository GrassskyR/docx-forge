<script setup lang="ts">
import { computed } from "vue"
import type { DocumentResult, FormatOption } from "../types"

const props = defineProps<{
  debug: boolean
  zoom: number
  page: number
  drawerTab: "telemetry" | "ooxml" | "vision"
  visionEnabled: boolean
  draftText: string
  activeFormat?: FormatOption
  currentDoc: DocumentResult | null
  previewUrls: string[]
  purgedImages: number
  isolatedPages: number
}>()

const emit = defineEmits<{
  "update:zoom": [zoom: number]
  "update:page": [page: number]
  "update:drawerTab": [tab: "telemetry" | "ooxml" | "vision"]
  compactFit: []
  download: []
}>()

const totalPages = computed(() =>
  Math.max(1, props.previewUrls.length || props.currentDoc?.layout?.total_pages || 1),
)

const warnings = computed(() => props.currentDoc?.layout?.warnings ?? [])
const hasWarnings = computed(() => warnings.value.length > 0)

const hasCompressibleOverflow = computed(() =>
  warnings.value.some((w) => w.code === "orphan_signature" || w.code === "tail_overflow"),
)

const suggestionText = computed(() => {
  if (!warnings.value.length) return ""
  const last = props.currentDoc?.layout?.pages.at(-1)
  const orphan = warnings.value.some((w) => w.code === "orphan_signature")
  const tail = warnings.value.some((w) => w.code === "tail_overflow")
  if (last && (orphan || tail)) {
    return (
      "第 " +
      last.number +
      " 页仅多出 " +
      last.lines +
      " 行" +
      (orphan ? "落款" : "内容") +
      "，可能影响打印美观"
    )
  }
  return warnings.value[0].message
})

const fitButtonLabel = computed(() =>
  hasCompressibleOverflow.value && totalPages.value > 1
    ? "一键压进 " + (totalPages.value - 1) + " 页"
    : "优化跨页排版",
)

const draftLines = computed(() =>
  props.draftText
    .split(/\r\n|\r|\n/)
    .map((s) => s.trim())
    .filter(Boolean),
)

const ooxmlScore = computed(() => {
  const report = props.currentDoc?.lint_report
  if (!report) return "OOXML 待审"
  return "OOXML " + Math.round(report.score) + "%"
})

const visionBadge = computed(() => {
  const v = props.currentDoc?.vision
  if (!props.visionEnabled || v?.mode === "text_only") return "纯文本"
  if (v?.status === "passed") return "视觉 ✓"
  if (v?.status === "issues") return "视觉 ⚠"
  return "视觉待审"
})
</script>

<template>
  <main class="flex-1 min-w-0 flex flex-col min-h-[540px] lg:min-h-0 bg-[#EEF2F6]">
    <div class="h-[52px] shrink-0 bg-white/90 backdrop-blur border-b border-[#E2E8F0] px-5 flex items-center justify-between gap-3">
      <div id="previewStatusArea" class="flex items-center gap-2 text-[12.5px] min-w-0">
        <template v-if="!debug">
          <template v-if="!currentDoc">
            <span class="w-2 h-2 rounded-full bg-[#94A3B8] shrink-0"></span>
            <span class="font-medium text-[#475569] truncate">
              草稿排样预览 · 点击左侧「套用格式」生成可打印 Word
            </span>
          </template>
          <template v-else-if="hasWarnings">
            <span class="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0"></span>
            <span class="font-medium text-[#92400E] truncate">
              {{
                hasCompressibleOverflow
                  ? "共 " + totalPages + " 页 · 建议优化末页排版"
                  : "共 " + totalPages + " 页 · 检测到跨页表格，可微调版面"
              }}
            </span>
          </template>
          <template v-else>
            <span class="w-2 h-2 rounded-full bg-[#10B981] shrink-0"></span>
            <span class="font-medium text-[#0F172A] truncate">
              共 {{ totalPages }} 页 · 格式已排好，可直接打印
            </span>
          </template>
        </template>

        <template v-else>
          <span
            class="px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0 tabular"
            :class="
              currentDoc?.lint_report?.passed !== false
                ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
                : 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]'
            "
          >
            {{ ooxmlScore }}
          </span>
          <span
            class="px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0 tabular"
            :class="
              hasWarnings
                ? 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]'
                : 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
            "
          >
            {{ hasWarnings ? "⚠ " + warnings[0].message : "✓ 版面 " + totalPages + "页" }}
          </span>
          <span
            class="px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0"
            :class="
              visionEnabled && currentDoc?.vision?.mode !== 'text_only'
                ? 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]'
                : 'bg-[#F1F5F9] text-[#64748B] border-[#E2E8F0]'
            "
          >
            {{ visionBadge }}
          </span>
        </template>
      </div>

      <div class="flex items-center gap-2.5 shrink-0">
        <div
          v-if="debug"
          id="debugZoomWrap"
          class="flex items-center bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg p-0.5 text-[11px] tabular text-[#475569]"
        >
          <button
            v-for="z in [0.88, 1, 1.12]"
            :key="z"
            type="button"
            class="px-2 py-0.5 rounded-md cursor-pointer"
            :class="zoom === z ? 'bg-white text-[#0F172A] font-medium' : ''"
            @click="emit('update:zoom', z)"
          >
            {{ Math.round(z * 100) }}%
          </button>
        </div>

        <div class="flex items-center bg-[#F1F5F9] rounded-lg p-0.5 text-[12px] text-[#475569] tabular">
          <button
            id="prevPage"
            type="button"
            class="w-7 h-7 flex items-center justify-center hover:bg-white rounded-md transition cursor-pointer"
            @click="page > 1 && emit('update:page', page - 1)"
          >
            ‹
          </button>
          <span id="pageIndicator" class="px-2 text-[11.5px] font-medium text-[#0F172A]">
            {{ page }} / {{ totalPages }}
          </span>
          <button
            id="nextPage"
            type="button"
            class="w-7 h-7 flex items-center justify-center hover:bg-white rounded-md transition cursor-pointer"
            @click="page < totalPages && emit('update:page', page + 1)"
          >
            ›
          </button>
        </div>

        <button
          id="downloadBtn"
          type="button"
          class="h-8 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12.5px] font-medium flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          @click="emit('download')"
        >
          <svg
            class="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>下载 Word</span>
        </button>
      </div>
    </div>

    <div
      v-if="hasWarnings"
      id="suggestionBanner"
      class="shrink-0 bg-[#FFFBEB] border-b border-[#FDE68A] px-5 py-2.5 flex items-center justify-between gap-3 text-[12.5px]"
    >
      <div class="flex items-center gap-2 text-[#92400E]">
        <span class="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0"></span>
        <span>{{ suggestionText }}</span>
      </div>
      <button
        id="oneClickFitBtn"
        type="button"
        class="h-7 px-3 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-[12px] font-medium shrink-0 transition cursor-pointer"
        @click="emit('compactFit')"
      >
        {{ fitButtonLabel }}
      </button>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scroll-thin dot-grid p-6 lg:p-7 flex justify-center items-start">
      <div
        id="paperMount"
        class="paper-a4 w-full max-w-[540px] min-h-[740px] rounded-[2px] relative overflow-hidden"
        :class="previewUrls.length ? 'p-0' : 'px-12 py-11 flex flex-col justify-between'"
        :style="{ transform: 'scale(' + (debug ? zoom : 1) + ')' }"
      >
        <img
          v-if="previewUrls.length"
          :src="previewUrls[page - 1]"
          :alt="'第 ' + page + ' 页预览'"
          class="w-full h-auto block select-none"
        />

        <template v-else>
          <div class="space-y-4">
            <div
              v-if="activeFormat?.category === 'gongwen'"
              class="text-center pt-1"
            >
              <div class="text-[#C81E1E] font-bold text-[22px] tracking-[0.2em]">
                {{ activeFormat.name }}
              </div>
              <div class="mt-3 flex items-center gap-1.5">
                <div class="h-[2px] bg-[#DC2626] flex-1"></div>
                <span class="text-[#DC2626] text-[11px] leading-none">★</span>
                <div class="h-[2px] bg-[#DC2626] flex-1"></div>
              </div>
            </div>
            <div
              v-else
              class="flex justify-between text-[10.5px] text-[#64748B] border-b border-[#E2E8F0] pb-1.5"
            >
              <span>{{ activeFormat?.name }}</span>
              <span>{{ activeFormat?.categoryLabel }}</span>
            </div>

            <div class="text-center font-bold text-[17px] leading-relaxed pt-2 text-[#0F172A]">
              {{ draftLines[0] || "请在左侧输入文章标题与正文" }}
            </div>

            <div class="text-[13px] leading-[1.95] space-y-2.5 text-justify text-[#1E293B]">
              <div
                v-for="(line, i) in draftLines.slice(1, 9)"
                :key="i"
                :class="
                  /^[一二三四五六七八九十]+、|^\d+\./.test(line)
                    ? 'indent-[2em] font-bold text-[#0F172A]'
                    : /[：:]$/.test(line) && i === 0
                      ? ''
                      : 'indent-[2em]'
                "
              >
                {{ line }}
              </div>
            </div>
          </div>

          <div class="text-center text-[11px] text-[#64748B] pt-6 tabular">— 1 —</div>
        </template>
      </div>
    </div>

    <div v-if="debug" id="debugDrawer" class="shrink-0 bg-white border-t border-[#E2E8F0]">
      <div class="px-4 h-9 flex items-center justify-between border-b border-[#F1F5F9]">
        <div class="flex items-center gap-1 text-[11.5px]">
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer"
            :class="
              drawerTab === 'telemetry'
                ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                : 'text-[#64748B] hover:text-[#0F172A]'
            "
            @click="emit('update:drawerTab', 'telemetry')"
          >
            版面遥测 (Poppler)
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer"
            :class="
              drawerTab === 'ooxml'
                ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                : 'text-[#64748B] hover:text-[#0F172A]'
            "
            @click="emit('update:drawerTab', 'ooxml')"
          >
            OOXML 审计
          </button>
          <button
            type="button"
            class="px-2.5 py-1 rounded-md font-medium cursor-pointer"
            :class="
              drawerTab === 'vision'
                ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                : 'text-[#64748B] hover:text-[#0F172A]'
            "
            @click="emit('update:drawerTab', 'vision')"
          >
            视觉终审
          </button>
        </div>
        <span class="text-[11px] text-[#64748B] font-mono tabular">
          {{
            !currentDoc
              ? "等待生成产物"
              : hasWarnings
                ? warnings.length + " 项版面警报"
                : "0 违规 · 双轨通过"
          }}
        </span>
      </div>

      <div class="px-4 py-3 text-[12px] max-h-[144px] overflow-y-auto scroll-thin">
        <template v-if="drawerTab === 'telemetry'">
          <div v-if="currentDoc?.layout?.pages?.length" class="grid grid-cols-3 gap-2.5">
            <div
              v-for="p in currentDoc.layout.pages"
              :key="p.number"
              class="p-2 rounded-lg border"
              :class="
                warnings.some((w) => w.page === p.number)
                  ? 'bg-[#FFFBEB] border-[#FDE68A]'
                  : 'bg-[#F8FAFC] border-[#E2E8F0]'
              "
            >
              <div class="flex justify-between text-[11px] mb-1">
                <span class="font-semibold">第 {{ p.number }} 页</span>
                <span
                  class="font-mono tabular"
                  :class="
                    warnings.some((w) => w.page === p.number)
                      ? 'text-[#B45309]'
                      : 'text-[#64748B]'
                  "
                >
                  {{ p.lines }}行 · {{ Math.round(p.bottom_occupancy * 100) }}%
                </span>
              </div>
              <div class="h-1.5 rounded-full bg-[#E2E8F0] overflow-hidden">
                <div
                  class="h-full"
                  :class="
                    warnings.some((w) => w.page === p.number) ? 'bg-[#F59E0B]' : 'bg-[#2563EB]'
                  "
                  :style="{ width: Math.min(100, Math.round(p.bottom_occupancy * 100)) + '%' }"
                ></div>
              </div>
            </div>
          </div>
          <div v-else class="text-[11.5px] text-[#64748B]">
            点击「套用格式」后，将调用 pdftohtml -xml 与 pdfinfo 输出每页行数与页底占空比。
          </div>
        </template>

        <template v-else-if="drawerTab === 'ooxml'">
          <div v-if="currentDoc?.lint_report" class="space-y-2">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div class="p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                ✓ 已核查 {{ currentDoc.lint_report.checked }} 项
              </div>
              <div class="p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                ✓ rFonts 四属性分离
              </div>
              <div class="p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                ✓ jc="both" + 双缩进
              </div>
              <div class="p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                ✓ 留壳与逐段字符核对
              </div>
            </div>
            <div
              v-for="(v, idx) in currentDoc.lint_report.violations"
              :key="idx"
              class="text-[11px] text-[#DC2626] font-mono"
            >
              [{{ v.location }}] {{ v.field }}: 期望 {{ v.expected }} / 实际 {{ v.actual }}
            </div>
          </div>
          <div v-else class="text-[11.5px] text-[#64748B]">
            生成文档后自动独立解压 OOXML 逐项校验字体、缩进、留壳图片与分节结构。
          </div>
        </template>

        <template v-else>
          <div
            v-if="
              visionEnabled &&
              currentDoc?.vision &&
              currentDoc.vision.status !== 'skipped_no_vision_model'
            "
            class="p-2.5 rounded-lg bg-[#EFF6FF]/60 border border-[#BFDBFE] text-[11.5px] flex justify-between items-center gap-2"
          >
            <span>
              模式 {{ currentDoc.vision.mode }} · 采样页
              [{{ currentDoc.vision.pages.join(", ") || "待采样" }}] · 状态
              {{ currentDoc.vision.status }}
            </span>
            <span class="font-mono text-[10.5px] text-[#1D4ED8] bg-white px-2 py-0.5 rounded border border-[#BFDBFE] shrink-0">
              历史图片已阅后即焚 ✓
            </span>
          </div>
          <div
            v-else
            class="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] text-[11.5px] flex justify-between items-center gap-2"
          >
            <span>
              未配置视觉模型（或已关闭视觉开关），已优雅降级为 Poppler 纯文本遥测 + OOXML 审计模式。
            </span>
            <span class="font-mono text-[10.5px] text-[#475569] shrink-0 tabular">
              已清理历史图 {{ purgedImages }} · 隔离 {{ isolatedPages }} 页
            </span>
          </div>
        </template>
      </div>
    </div>
  </main>
</template>
