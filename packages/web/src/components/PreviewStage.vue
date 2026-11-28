<script setup lang="ts">
import { computed } from "vue"
import type { DocumentResult, DropdownId, FormatOption } from "../types"

const props = defineProps<{
  debug: boolean
  zoom: number
  page: number
  drawerTab: "telemetry" | "ooxml" | "vision"
  visionEnabled: boolean
  openDropdown: DropdownId
  busy: boolean
  busyLabel: string
  elapsedSec: number
  previewStale: boolean
  activeFormat?: FormatOption
  currentDoc: DocumentResult | null
  previewUrls: string[]
  sampleUrls: string[]
  suggestedDocxName: string
  purgedImages: number
  isolatedPages: number
  isDesktop?: boolean
}>()

const emit = defineEmits<{
  "update:zoom": [zoom: number]
  "update:page": [page: number]
  "update:drawerTab": [tab: "telemetry" | "ooxml" | "vision"]
  setDropdown: [menu: DropdownId]
  surgery: [kind: "compact" | "orphan" | "tighten" | "vision"]
  reapplyFormat: []
  download: []
  openInApp: []
  revealInFolder: []
}>()

const activeImages = computed(() =>
  props.previewUrls.length ? props.previewUrls : props.sampleUrls,
)

const totalPages = computed(() =>
  Math.max(1, activeImages.value.length || props.currentDoc?.layout?.total_pages || 1),
)

const warnings = computed(() => props.currentDoc?.layout?.warnings ?? [])
const hasWarnings = computed(() => Boolean(props.currentDoc) && warnings.value.length > 0)

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
      "，可微调跨页收口"
    )
  }
  return warnings.value[0].message
})

const fitButtonLabel = computed(() =>
  hasCompressibleOverflow.value && totalPages.value > 1
    ? "一键压进 " + (totalPages.value - 1) + " 页"
    : "优化跨页排版",
)

const paperMaxWidth = computed(() => Math.round(540 * props.zoom) + "px")

const ooxmlScore = computed(() => {
  const report = props.currentDoc?.lint_report
  if (!report) return "OOXML 待审"
  return "OOXML " + Math.round(report.score) + "%"
})

const visionBadge = computed(() => {
  const v = props.currentDoc?.vision
  if (!props.visionEnabled || v?.mode === "text_only") return "几何核查"
  if (v?.status === "passed") return "视觉 ✓"
  if (v?.status === "issues") return "视觉 ⚠"
  return "视觉待审"
})

function toggleLayoutMenu() {
  emit("setDropdown", props.openDropdown === "layout" ? null : "layout")
}
</script>

<template>
  <main class="flex-1 min-w-0 lg:min-w-[320px] flex flex-col min-h-0 bg-[#EEF2F6] relative">
    <!-- 顶部预览控制栏（自适应防挤压，缩放与版面微调常驻） -->
    <div class="min-h-[52px] shrink-0 bg-white/95 backdrop-blur border-b border-[#E2E8F0] px-4 py-1.5 flex flex-wrap items-center justify-between gap-2">
      <div id="previewStatusArea" class="flex items-center gap-2 text-[12px] min-w-0 flex-1">
        <template v-if="!debug">
          <template v-if="!currentDoc">
            <span class="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0"></span>
            <span class="font-medium text-[#475569] truncate">
              模板原件样张预览 · 填写左侧内容并点击「套用格式」生成专属 Word
            </span>
          </template>
          <template v-else-if="hasWarnings">
            <span class="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0"></span>
            <span class="font-medium text-[#92400E] truncate">
              共 {{ totalPages }} 页 · 建议微调末页版面
            </span>
          </template>
          <template v-else>
            <span class="w-2 h-2 rounded-full bg-[#10B981] shrink-0"></span>
            <span class="font-medium text-[#0F172A] truncate">
              共 {{ totalPages }} 页 · 格式已排好，可直接打印或下载
            </span>
          </template>
        </template>

        <template v-else>
          <span
            class="px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap tabular"
            :class="
              currentDoc?.lint_report?.passed !== false
                ? 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
                : 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]'
            "
          >
            {{ ooxmlScore }}
          </span>
          <span
            class="px-2 py-0.5 rounded-full text-[11px] font-medium border truncate max-w-[180px] tabular"
            :class="
              hasWarnings
                ? 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]'
                : 'bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]'
            "
          >
            {{
              !currentDoc
                ? "模板样张 " + totalPages + "页"
                : hasWarnings
                  ? "⚠ " + warnings[0].message
                  : "✓ 版面 " + totalPages + "页"
            }}
          </span>
          <span
            class="hidden sm:inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap"
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

      <div class="flex items-center gap-2 shrink-0">
        <!-- 普通模式常驻：布局级宽度缩放（无 CSS scale 裁切） -->
        <div
          id="zoomWrap"
          class="hidden sm:flex items-center bg-[#F1F5F9] border border-[#E2E8F0] rounded-lg p-0.5 text-[11px] tabular text-[#475569]"
        >
          <button
            v-for="z in [0.88, 1, 1.12]"
            :key="z"
            type="button"
            class="px-2 py-0.5 rounded-md cursor-pointer"
            :class="zoom === z ? 'bg-white text-[#0F172A] font-medium shadow-2xs' : ''"
            @click="emit('update:zoom', z)"
          >
            {{ Math.round(z * 100) }}%
          </button>
        </div>

        <!-- 普通模式常驻：版面微调下拉菜单 -->
        <div class="relative" @click.stop>
          <button
            id="layoutTweakBtn"
            type="button"
            :disabled="!currentDoc || busy"
            :title="currentDoc ? '微调跨页收口与行距' : '生成文档后可微调版面'"
            class="h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] disabled:opacity-45 disabled:cursor-not-allowed text-[12px] font-medium text-[#334155] cursor-pointer"
            @click="toggleLayoutMenu"
          >
            版面微调 ▾
          </button>

          <div
            v-if="openDropdown === 'layout'"
            id="layoutPopover"
            class="absolute right-0 top-10 w-[176px] bg-white border border-[#E2E8F0] rounded-xl shadow-xl p-1.5 z-40 text-[12px] space-y-0.5"
          >
            <button
              type="button"
              class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F8FAFC] text-[#0F172A] cursor-pointer"
              @click="emit('surgery', 'compact')"
            >
              一键压页收口
            </button>
            <button
              type="button"
              class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F8FAFC] text-[#0F172A] cursor-pointer"
              @click="emit('surgery', 'orphan')"
            >
              防孤立落款
            </button>
            <button
              type="button"
              class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F8FAFC] text-[#0F172A] cursor-pointer"
              @click="emit('surgery', 'tighten')"
            >
              行距紧缩 -1pt
            </button>
            <button
              v-if="debug"
              type="button"
              class="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-[#F8FAFC] text-[#2563EB] cursor-pointer"
              @click="emit('surgery', 'vision')"
            >
              强制视觉终审
            </button>
          </div>
        </div>

        <!-- 翻页器 -->
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

        <!-- 桌面端本地联动：用本机 Word/WPS 打开 & 打开所在文件夹 -->
        <template v-if="isDesktop">
          <button
            id="openLocalWordBtn"
            type="button"
            :disabled="!currentDoc?.docx_url || busy"
            :title="currentDoc ? '用本机默认 Word / WPS 打开' : '生成文档后可用本机应用打开'"
            class="h-8 px-2.5 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] disabled:opacity-45 disabled:cursor-not-allowed text-[12px] font-medium text-[#334155] cursor-pointer"
            @click="emit('openInApp')"
          >
            本地打开
          </button>
          <button
            id="revealFolderBtn"
            type="button"
            :disabled="!currentDoc?.docx_url || busy"
            title="在文件管理器中定位该文档"
            class="h-8 w-8 rounded-lg border border-[#E2E8F0] bg-white hover:bg-[#F8FAFC] disabled:opacity-45 disabled:cursor-not-allowed text-[#475569] flex items-center justify-center cursor-pointer"
            @click="emit('revealInFolder')"
          >
            <svg
              class="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        </template>

        <!-- 下载按钮（未生成成品前严格禁用，生成后按文档标题命名） -->
        <button
          id="downloadBtn"
          type="button"
          :disabled="!currentDoc?.docx_url || busy"
          :title="currentDoc ? '保存 ' + suggestedDocxName : '请先套用格式或通过 AI 生成文档后再下载'"
          class="h-8 px-3.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 disabled:cursor-not-allowed text-white text-[12px] font-medium flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          @click="emit('download')"
        >
          <svg
            class="w-3.5 h-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>{{ isDesktop ? "另存为" : "下载 Word" }}</span>
        </button>
      </div>
    </div>

    <!-- 顶栏切换格式后的旧预览过期提示横幅 -->
    <div
      v-if="currentDoc && previewStale"
      id="stalePreviewBanner"
      class="shrink-0 bg-[#FFFBEB] border-b border-[#FDE68A] px-4 py-2 flex items-center justify-between gap-3 text-[12px]"
    >
      <span class="text-[#92400E]">
        ⚠ 当前文档已切换为「{{ activeFormat?.name }}」格式，下方展示的仍是旧格式预览。
      </span>
      <button
        type="button"
        class="h-7 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11.5px] font-medium shrink-0 cursor-pointer"
        @click="emit('reapplyFormat')"
      >
        立即按新格式重排
      </button>
    </div>

    <!-- 末页溢出自动收口建议条 -->
    <div
      v-else-if="hasWarnings"
      id="suggestionBanner"
      class="shrink-0 bg-[#FFFBEB] border-b border-[#FDE68A] px-4 py-2 flex items-center justify-between gap-3 text-[12px]"
    >
      <div class="flex items-center gap-2 text-[#92400E]">
        <span class="w-2 h-2 rounded-full bg-[#F59E0B] shrink-0"></span>
        <span>{{ suggestionText }}</span>
      </div>
      <button
        id="oneClickFitBtn"
        type="button"
        class="h-7 px-3 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-[11.5px] font-medium shrink-0 transition cursor-pointer"
        @click="emit('surgery', 'compact')"
      >
        {{ fitButtonLabel }}
      </button>
    </div>

    <!-- 生成期间半透明加载胶囊浮层 -->
    <div
      v-if="busy"
      class="absolute inset-x-0 top-[54px] bottom-0 bg-[#0F172A]/10 backdrop-blur-[1px] z-10 flex items-start justify-center pt-8 pointer-events-none"
    >
      <div class="px-4 py-2 rounded-full bg-white border border-[#E2E8F0] shadow-lg flex items-center gap-2 text-[12px] font-medium text-[#0F172A] tabular">
        <span class="w-2 h-2 rounded-full bg-[#2563EB] animate-ping"></span>
        <span>{{ busyLabel || "正在处理…" }} ({{ elapsedSec }}s)</span>
      </div>
    </div>

    <!-- 纸张滚动视口 -->
    <div class="flex-1 min-h-0 overflow-y-auto scroll-thin dot-grid p-5 lg:p-6 flex justify-center items-start">
      <div
        id="paperMount"
        :style="{ maxWidth: paperMaxWidth }"
        class="paper-a4 w-full rounded-[2px] relative overflow-hidden transition-all duration-150"
        :class="activeImages.length ? 'p-0' : 'px-10 py-12 min-h-[680px] flex flex-col justify-center items-center'"
      >
        <div
          v-if="!currentDoc && activeImages.length"
          class="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-[#FFFBEB]/95 text-[#92400E] border border-[#FDE68A] text-[11px] font-sans font-medium shadow-2xs z-10"
        >
          模板原件样张 · 第 {{ page }}/{{ totalPages }} 页
        </div>

        <img
          v-if="activeImages.length"
          :src="activeImages[page - 1] || activeImages[0]"
          :alt="currentDoc ? '第 ' + page + ' 页成品预览' : '模板原件样张'"
          class="w-full h-auto block select-none"
        />

        <div v-else class="text-center space-y-3 font-sans max-w-[320px]">
          <div class="w-11 h-11 mx-auto rounded-2xl bg-[#EFF6FF] text-[#2563EB] flex items-center justify-center font-semibold">
            A4
          </div>
          <div class="text-[14px] font-semibold text-[#0F172A]">
            当前所选：{{ activeFormat?.name || "通用标准文档格式" }}
          </div>
          <div class="text-[12px] text-[#64748B] leading-relaxed">
            正在准备模板原件样张预览…您可以直接在左侧输入正文并点击「套用格式」，或切换到「让 AI 写 / 改」生成正式 Word 文档。
          </div>
        </div>
      </div>
    </div>

    <!-- 调试模式专属底部三标签诊断抽屉 -->
    <div v-if="debug" id="debugDrawer" class="shrink-0 bg-white border-t border-[#E2E8F0]">
      <div class="px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#F1F5F9]">
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
                ? warnings.length + " 项版面提示"
                : "0 违规 · 双轨通过"
          }}
        </span>
      </div>

      <div class="px-4 py-2.5 text-[12px] max-h-[132px] overflow-y-auto scroll-thin">
        <template v-if="drawerTab === 'telemetry'">
          <div v-if="currentDoc?.layout?.pages?.length" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
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
                <span class="font-mono tabular text-[#64748B]">
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
            生成文档后输出每页物理行数与页底占空比。
          </div>
        </template>

        <template v-else-if="drawerTab === 'ooxml'">
          <div v-if="currentDoc?.lint_report" class="space-y-2">
            <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
              <div class="p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                ✓ 已核查 {{ currentDoc.lint_report.checked }} 项
              </div>
              <div class="p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                ✓ 中西文字体分离
              </div>
              <div class="p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                ✓ 未填槽位干净擦除
              </div>
              <div class="p-2 rounded bg-[#F8FAFC] border border-[#E2E8F0]">
                ✓ 页眉媒体与分节守恒
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
            生成文档后自动独立解压 OOXML 校验留壳媒体、分节守恒与逐字保真度。
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
              历史图已清理 ✓
            </span>
          </div>
          <div
            v-else
            class="p-2.5 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] text-[11.5px] flex justify-between items-center gap-2"
          >
            <span>当前使用 Poppler 几何遥测 + OOXML 结构双轨核验。</span>
            <span class="font-mono text-[10.5px] text-[#475569] shrink-0 tabular">
              已清理历史图 {{ purgedImages }} · 隔离 {{ isolatedPages }} 页
            </span>
          </div>
        </template>
      </div>
    </div>
  </main>
</template>
