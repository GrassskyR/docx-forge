<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue"
import TopBar from "./components/TopBar.vue"
import SessionSidebar from "./components/SessionSidebar.vue"
import DebugSidebar from "./components/DebugSidebar.vue"
import ContentColumn from "./components/ContentColumn.vue"
import PreviewStage from "./components/PreviewStage.vue"
import ImportModal from "./components/ImportModal.vue"
import SettingsModal from "./components/SettingsModal.vue"
import { useWorkbench } from "./workbench"

const wb = useWorkbench()
const {
  state,
  activeFormat,
  suggestedDocxName,
  previewUrls,
  samplePreviewUrls,
  chatMessageCount,
} = wb

const isDesktop = computed(() => Boolean(window.docforgeDesktop))
const docPages = computed(
  () => state.currentDoc?.preview_urls?.length || state.currentDoc?.layout?.total_pages || 1,
)
const hasDraft = computed(() => state.draftText.trim().length > 0)

const rendererMissing = computed(
  () => state.health !== null && state.health.renderer_ready === false,
)
const popplerMissing = computed(
  () => state.health !== null && state.health.pdftoppm === false,
)
const llmMissing = computed(
  () => state.health !== null && state.health.llm_configured === false,
)
const needsSetup = computed(
  () => rendererMissing.value || popplerMissing.value || llmMissing.value,
)
const showSetupBanner = computed(() => !state.bannerDismissed && needsSetup.value)

const draggingFile = ref(false)
const droppedWordFile = ref<File | null>(null)
let dragDepth = 0
let unsubMenu: (() => void) | null = null

function closeAllMenus() {
  if (state.openDropdown) state.openDropdown = null
}

function toggleDebug() {
  state.debug = !state.debug
  if (!state.debug) state.debugDrawerOpen = false
  wb.toast(
    state.debug
      ? "已开启调试模式：展开底层诊断与会话分叉"
      : "已切回普通模式：保留全部常用排版功能",
  )
}

function openImport(initialFile: File | null = null) {
  state.openDropdown = null
  state.importInitialFile = initialFile
  state.importOpen = true
}

function closeImport() {
  state.importOpen = false
  state.importInitialFile = null
}

function selectNarrowPane(pane: "edit" | "preview") {
  state.narrowPane = pane
  if (pane === "preview") state.unreadPreview = false
}

function onDuplicateCurrent() {
  if (activeFormat.value) {
    void wb.duplicateFormat(activeFormat.value.id)
  }
}

function openLibreOfficeDownload() {
  const url = "https://www.libreoffice.org/download/download-libreoffice/"
  if (window.docforgeDesktop) {
    void window.docforgeDesktop.openExternal(url)
  } else {
    window.open(url, "_blank", "noopener")
  }
}

function onDragEnter(e: DragEvent) {
  if (!e.dataTransfer?.types?.includes("Files")) return
  e.preventDefault()
  dragDepth++
  draggingFile.value = true
}

function onDragLeave(e: DragEvent) {
  if (!e.dataTransfer?.types?.includes("Files")) return
  dragDepth = Math.max(0, dragDepth - 1)
  if (dragDepth === 0) draggingFile.value = false
}

function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types?.includes("Files")) {
    e.preventDefault()
  }
}

function onDropFile(e: DragEvent) {
  if (!e.dataTransfer?.files?.length) return
  e.preventDefault()
  dragDepth = 0
  draggingFile.value = false
  const file = e.dataTransfer.files[0]
  if (state.importOpen || state.pendingDraftFile) return
  if (/\.(txt|md)$/i.test(file.name)) {
    wb.requestImportDraft(file)
    return
  }
  if (/\.docx?$/i.test(file.name)) {
    droppedWordFile.value = file
    return
  }
  wb.toast("仅支持拖入 .doc / .docx / .txt / .md 文档")
}

function useDroppedAsTemplate() {
  const file = droppedWordFile.value
  droppedWordFile.value = null
  if (file) openImport(file)
}

function useDroppedAsDraft() {
  const file = droppedWordFile.value
  droppedWordFile.value = null
  if (!file) return
  if (/\.doc$/i.test(file.name)) {
    wb.toast("草稿导入仅支持 .docx / .txt / .md；旧版 .doc 请作为模板导入")
    return
  }
  wb.requestImportDraft(file)
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (state.pendingDraftFile) {
      state.pendingDraftFile = null
      return
    }
    if (droppedWordFile.value) {
      droppedWordFile.value = null
      return
    }
  }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n") {
    if (window.docforgeDesktop || e.isComposing) return
    if (state.importOpen || state.settingsOpen || state.pendingDraftFile) return
    const target = e.target as HTMLElement | null
    const tag = target?.tagName
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
    e.preventDefault()
    void wb.createBlankSession()
  }
}

onMounted(() => {
  window.addEventListener("click", closeAllMenus)
  window.addEventListener("keydown", onGlobalKeydown)
  wb.init().catch((e) => wb.toast(e instanceof Error ? e.message : String(e)))
  if (window.docforgeDesktop?.onMenuAction) {
    unsubMenu = window.docforgeDesktop.onMenuAction((action) => {
      if (action === "new-session") void wb.createBlankSession()
      if (action === "open-settings") void wb.openSettings()
      if (action === "import-template") openImport()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener("click", closeAllMenus)
  window.removeEventListener("keydown", onGlobalKeydown)
  if (unsubMenu) unsubMenu()
})
</script>

<template>
  <div
    class="h-screen w-screen overflow-hidden flex flex-col select-none bg-[#F8FAFC] relative"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover="onDragOver"
    @drop="onDropFile"
  >
    <TopBar
      :sidebar-open="state.sidebarOpen"
      :debug="state.debug"
      :open-dropdown="state.openDropdown"
      :popover-cat="state.popoverCat"
      :session-name="state.sessionName"
      :has-doc="Boolean(state.currentDoc)"
      :doc-pages="docPages"
      :has-draft="hasDraft"
      :formats="state.formats"
      :active-format="activeFormat"
      :usage="state.usage"
      :vision-enabled="state.visionEnabled"
      :langfuse-enabled="state.health?.langfuse_enabled"
      :bg-import="state.bgImport"
      :needs-setup="needsSetup"
      @toggle-sidebar="wb.toggleSidebar"
      @toggle-debug="toggleDebug"
      @toggle-debug-drawer="state.debugDrawerOpen = !state.debugDrawerOpen"
      @open-settings="wb.openSettings()"
      @set-dropdown="state.openDropdown = $event"
      @change-popover-cat="state.popoverCat = $event"
      @fork-session="wb.forkCurrentSession"
      @select-format="wb.selectFormat"
      @rename-format="wb.renameFormat"
      @change-format-cat="wb.updateFormatCategory"
      @duplicate-format="wb.duplicateFormat"
      @delete-format="wb.removeFormat"
      @open-import="openImport()"
      @toggle-vision="state.visionEnabled = !state.visionEnabled"
      @cancel-bg-import="wb.cancelOrDismissBgImport"
      @apply-bg-import="wb.applyBgImportedTemplate"
    />

    <!-- 启动环境自检与设置引导条 -->
    <div
      v-if="showSetupBanner"
      id="setupBanner"
      class="shrink-0 px-4 py-2 border-b text-[12px] flex flex-wrap items-center justify-between gap-2"
      :class="
        rendererMissing || popplerMissing
          ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
          : 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF]'
      "
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :class="rendererMissing || popplerMissing ? 'bg-[#F59E0B]' : 'bg-[#2563EB]'"
        ></span>
        <span class="truncate">
          <template v-if="rendererMissing">
            未检测到文档渲染引擎（Word / WPS / LibreOffice），当前无法生成预览图与转换 .doc。
          </template>
          <template v-else-if="popplerMissing">
            未检测到 Poppler 预览组件（pdftoppm），右侧高清预览图将不可用。
          </template>
          <template v-else>
            尚未配置大模型 API Key：离线套格式可直接使用，配置 Key 后即可解锁 AI 写作与模板智能解析。
          </template>
        </span>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button
          v-if="rendererMissing"
          type="button"
          class="px-2.5 py-1 rounded-md bg-white border border-[#FCD34D] text-[#92400E] hover:bg-[#FEF3C7] text-[11.5px] font-medium cursor-pointer"
          @click="openLibreOfficeDownload"
        >
          下载 LibreOffice
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-md bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11.5px] font-medium cursor-pointer"
          @click="wb.openSettings()"
        >
          前往设置
        </button>
        <button
          type="button"
          class="px-1.5 py-1 opacity-70 hover:opacity-100 cursor-pointer"
          title="暂时关闭提示"
          @click="state.bannerDismissed = true"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- 窄屏 (<1024px) 顶部分段单视图切换栏（彻底消除三层嵌套滚动条） -->
    <div
      id="narrowPaneSwitcher"
      class="lg:hidden shrink-0 bg-white border-b border-[#E2E8F0] px-4 py-2 flex items-center justify-between gap-3"
    >
      <div class="inline-flex p-0.5 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] w-full max-w-[340px] text-[12px]">
        <button
          id="narrowEditTab"
          type="button"
          class="flex-1 py-1.5 rounded-md font-medium transition cursor-pointer"
          :class="
            state.narrowPane === 'edit'
              ? 'bg-white text-[#0F172A] shadow-2xs'
              : 'text-[#64748B]'
          "
          @click="selectNarrowPane('edit')"
        >
          编辑与 AI 对话
        </button>
        <button
          id="narrowPreviewTab"
          type="button"
          class="flex-1 py-1.5 rounded-md font-medium transition flex items-center justify-center gap-1.5 cursor-pointer"
          :class="
            state.narrowPane === 'preview'
              ? 'bg-white text-[#0F172A] shadow-2xs'
              : 'text-[#64748B]'
          "
          @click="selectNarrowPane('preview')"
        >
          <span>{{ state.currentDoc ? "成品预览 (" + docPages + "页)" : "样张预览" }}</span>
          <span
            v-if="state.unreadPreview"
            class="w-2 h-2 rounded-full bg-[#2563EB]"
          ></span>
        </button>
      </div>
      <span class="text-[11.5px] text-[#64748B] truncate">
        {{ state.currentDoc ? "已排好 " + docPages + " 页" : "待套用格式" }}
      </span>
    </div>

    <div class="flex-1 min-h-0 flex flex-row overflow-hidden relative">
      <SessionSidebar
        :open="state.sidebarOpen"
        :drawer-open="state.sidebarDrawerOpen"
        :sessions="state.sessions"
        :active-session-id="state.activeSessionId"
        @create-session="wb.createBlankSession"
        @switch-session="wb.switchSession"
        @rename-session="wb.renameSessionById"
        @delete-session="wb.deleteSessionById"
        @close-drawer="state.sidebarDrawerOpen = false"
      />

      <DebugSidebar
        v-if="state.debug"
        :formats="state.formats"
        :active-format="activeFormat"
        :drawer-open="state.debugDrawerOpen"
        @select-format="wb.selectFormat"
        @open-import="openImport()"
        @duplicate-current="onDuplicateCurrent"
        @close-drawer="state.debugDrawerOpen = false"
      />

      <ContentColumn
        :class="state.narrowPane === 'edit' ? 'flex' : 'hidden lg:flex'"
        :debug="state.debug"
        :mode="state.mode"
        :draft-text="state.draftText"
        :slot-values="state.slotValues"
        :generate-cover="state.generateCover"
        :generate-toc="state.generateToc"
        :normalize-punct="state.normalizePunct"
        :busy="state.busy"
        :busy-kind="state.busyKind"
        :busy-label="state.busyLabel"
        :elapsed-sec="state.elapsedSec"
        :fidelity="state.currentDoc?.fidelity"
        :last-token-delta="state.lastTokenDelta"
        :mappings="state.mappings"
        :timeline="state.timeline"
        :chat-message-count="chatMessageCount"
        :template-switch-guard="state.templateSwitchGuard"
        :draft-cleared-notice="state.draftClearedNotice"
        :active-format="activeFormat"
        :suggested-docx-name="suggestedDocxName"
        @update:mode="state.mode = $event"
        @update:draft-text="wb.updateDraftText"
        @update:generate-cover="state.generateCover = $event"
        @update:generate-toc="state.generateToc = $event"
        @update:normalize-punct="state.normalizePunct = $event"
        @update-slot="wb.updateSlotValue"
        @fill-sample="wb.fillStarterDraft"
        @clear-draft="wb.clearDraft"
        @upload-draft="wb.requestImportDraft"
        @apply-format="wb.applyFormat"
        @stop-task="wb.stopActiveTask()"
        @send-chat="wb.sendChat"
        @clear-chat="wb.clearCurrentChat"
        @create-session="wb.createBlankSession"
        @dismiss-template-guard="state.templateSwitchGuard = false"
        @dismiss-draft-cleared="state.draftClearedNotice = false"
        @download-doc="wb.downloadDocx"
      />

      <PreviewStage
        :class="state.narrowPane === 'preview' ? 'flex' : 'hidden lg:flex'"
        :debug="state.debug"
        :zoom="state.zoom"
        :page="state.page"
        :drawer-tab="state.drawerTab"
        :vision-enabled="state.visionEnabled"
        :open-dropdown="state.openDropdown"
        :busy="state.busy"
        :busy-label="state.busyLabel"
        :elapsed-sec="state.elapsedSec"
        :preview-stale="state.previewStale"
        :active-format="activeFormat"
        :current-doc="state.currentDoc"
        :preview-urls="previewUrls"
        :sample-urls="samplePreviewUrls"
        :suggested-docx-name="suggestedDocxName"
        :purged-images="state.purgedImages"
        :isolated-pages="state.isolatedPages"
        :is-desktop="isDesktop"
        @update:zoom="state.zoom = $event"
        @update:page="state.page = $event"
        @update:drawer-tab="state.drawerTab = $event"
        @set-dropdown="state.openDropdown = $event"
        @surgery="wb.runSurgery"
        @reapply-format="wb.applyFormat"
        @download="wb.downloadDocx()"
        @open-in-app="wb.openDocInLocalApp()"
        @reveal-in-folder="wb.revealDocInLocalFolder()"
      />
    </div>

    <ImportModal
      :open="state.importOpen"
      :initial-file="state.importInitialFile"
      @close="closeImport"
      @confirm="wb.startBackgroundImport"
    />

    <SettingsModal
      :open="state.settingsOpen"
      :data="state.settingsData"
      :saving="state.settingsSaving"
      @close="state.settingsOpen = false"
      @save="wb.saveSettings"
      @refresh="wb.loadSettings()"
    />

    <!-- 导入新草稿时的防上下文污染确认弹窗 -->
    <div
      v-if="state.pendingDraftFile"
      id="importGuardModal"
      class="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
      @click.self="state.pendingDraftFile = null"
    >
      <div class="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-[440px] p-5 space-y-4">
        <div>
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-[#2563EB]"></span>
            <h3 class="text-[14.5px] font-semibold text-[#0F172A]">
              检测到当前会话已有历史上下文
            </h3>
          </div>
          <p class="text-[12px] text-[#64748B] mt-1.5 leading-relaxed">
            即将导入新草稿
            <span class="font-semibold text-[#0F172A]">
              《{{ state.pendingDraftFile.name }}》
            </span>
            。为避免 AI 继续沿用上一篇文章的聊天记忆，请选择导入方式：
          </p>
        </div>

        <div class="space-y-2 text-[12px]">
          <button
            id="importAsNewSessionBtn"
            type="button"
            class="w-full text-left p-3 rounded-xl border-2 border-[#2563EB] bg-[#EFF6FF]/65 hover:bg-[#EFF6FF] transition cursor-pointer"
            @click="wb.confirmPendingDraftImport('new_session')"
          >
            <div class="flex items-center justify-between">
              <span class="font-semibold text-[#0F172A]">新建独立对话导入</span>
              <span class="px-1.5 py-0.5 rounded bg-[#2563EB] text-white text-[10.5px] font-medium">
                推荐
              </span>
            </div>
            <div class="text-[#64748B] mt-1">
              自动在左侧列表新建一条干净会话装入新文章，原文章和旧对话完整保留不丢失。
            </div>
          </button>

          <button
            id="importOverwriteClearBtn"
            type="button"
            class="w-full text-left p-3 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB] bg-white hover:bg-[#F8FAFC] transition cursor-pointer"
            @click="wb.confirmPendingDraftImport('overwrite_clear')"
          >
            <div class="font-semibold text-[#0F172A]">覆盖当前草稿，并清空旧对话</div>
            <div class="text-[#64748B] mt-1">
              留在当前会话内替换正文并重置填槽，同时清空 AI 记忆避免上下文串台。
            </div>
          </button>

          <button
            id="importOverwriteKeepBtn"
            type="button"
            class="w-full text-left p-3 rounded-xl border border-[#E2E8F0] hover:border-[#2563EB] bg-white hover:bg-[#F8FAFC] transition cursor-pointer"
            @click="wb.confirmPendingDraftImport('overwrite_keep')"
          >
            <div class="font-semibold text-[#0F172A]">仅覆盖正文，保留当前对话</div>
            <div class="text-[#64748B] mt-1">
              适合导入同一篇文章的修订版继续聊。
            </div>
          </button>
        </div>

        <div class="flex justify-end">
          <button
            id="cancelImportGuardBtn"
            type="button"
            class="h-8 px-3.5 rounded-lg border border-[#CBD5E1] text-[12px] text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
            @click="state.pendingDraftFile = null"
          >
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- 全局文件拖拽浮层 -->
    <div
      v-if="draggingFile && !state.importOpen && !state.pendingDraftFile"
      class="fixed inset-0 bg-[#0F172A]/35 backdrop-blur-[2px] flex items-center justify-center p-6 z-50 pointer-events-none"
    >
      <div class="bg-white border-2 border-dashed border-[#2563EB] rounded-2xl px-10 py-8 text-center shadow-2xl">
        <div class="text-[15px] font-semibold text-[#0F172A]">松开鼠标即可导入文档</div>
        <div class="text-[12px] text-[#64748B] mt-1">
          支持 .doc / .docx（作为格式模板或正文草稿）以及 .txt / .md 草稿
        </div>
      </div>
    </div>

    <!-- 拖入 Word 文档后的用途选择弹窗 -->
    <div
      v-if="droppedWordFile"
      class="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
      @click.self="droppedWordFile = null"
    >
      <div class="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-[380px] p-5 space-y-4">
        <div>
          <h3 class="text-[14.5px] font-semibold text-[#0F172A]">选择导入方式</h3>
          <p class="text-[12px] text-[#64748B] mt-1 truncate">{{ droppedWordFile.name }}</p>
        </div>
        <div class="space-y-2">
          <button
            type="button"
            class="w-full text-left px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] hover:border-[#2563EB] hover:bg-[#EFF6FF]/60 transition cursor-pointer"
            @click="useDroppedAsTemplate"
          >
            <div class="text-[13px] font-medium text-[#0F172A]">导入为排版模板</div>
            <div class="text-[11.5px] text-[#64748B]">提取页眉校徽、样式链与填空槽位</div>
          </button>
          <button
            type="button"
            class="w-full text-left px-3.5 py-2.5 rounded-xl border border-[#CBD5E1] hover:border-[#2563EB] hover:bg-[#EFF6FF]/60 transition cursor-pointer"
            @click="useDroppedAsDraft"
          >
            <div class="text-[13px] font-medium text-[#0F172A]">导入为当前正文草稿</div>
            <div class="text-[11.5px] text-[#64748B]">读取正文段落到左侧编辑器，零改字套版</div>
          </button>
        </div>
        <div class="flex justify-end">
          <button
            type="button"
            class="h-8 px-3 rounded-lg border border-[#CBD5E1] text-[12px] text-[#475569] hover:bg-[#F8FAFC] cursor-pointer"
            @click="droppedWordFile = null"
          >
            取消
          </button>
        </div>
      </div>
    </div>

    <div
      id="toast"
      class="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[#0F172A] text-white text-[12px] font-medium shadow-lg pointer-events-none transition-opacity z-50"
      :class="state.toastText ? 'opacity-100' : 'opacity-0'"
    >
      {{ state.toastText }}
    </div>
  </div>
</template>
