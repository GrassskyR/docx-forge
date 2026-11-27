<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue"
import TopBar from "./components/TopBar.vue"
import DebugSidebar from "./components/DebugSidebar.vue"
import ContentColumn from "./components/ContentColumn.vue"
import PreviewStage from "./components/PreviewStage.vue"
import ImportModal from "./components/ImportModal.vue"
import { useWorkbench } from "./workbench"

const wb = useWorkbench()
const { state, activeFormat, suggestedDocxName, previewUrls, samplePreviewUrls } = wb

const docPages = computed(
  () => state.currentDoc?.preview_urls?.length || state.currentDoc?.layout?.total_pages || 1,
)
const hasDraft = computed(() => state.draftText.trim().length > 0)

function closeAllMenus() {
  if (state.openDropdown) state.openDropdown = null
}

function toggleDebug() {
  state.debug = !state.debug
  if (!state.debug) state.debugDrawerOpen = false
  wb.toast(state.debug ? "已开启调试模式：展开底层诊断与会话分叉" : "已切回普通模式：保留全部常用排版功能")
}

function openImport() {
  state.openDropdown = null
  state.importOpen = true
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

onMounted(() => {
  window.addEventListener("click", closeAllMenus)
  wb.init().catch((e) => wb.toast(e instanceof Error ? e.message : String(e)))
})

onUnmounted(() => {
  window.removeEventListener("click", closeAllMenus)
})
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col select-none bg-[#F8FAFC]">
    <TopBar
      :debug="state.debug"
      :open-dropdown="state.openDropdown"
      :popover-cat="state.popoverCat"
      :sessions="state.sessions"
      :active-session-id="state.activeSessionId"
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
      @toggle-debug="toggleDebug"
      @toggle-debug-drawer="state.debugDrawerOpen = !state.debugDrawerOpen"
      @set-dropdown="state.openDropdown = $event"
      @change-popover-cat="state.popoverCat = $event"
      @create-session="wb.createBlankSession"
      @switch-session="wb.switchSession"
      @fork-session="wb.forkCurrentSession"
      @rename-session="wb.renameSessionById"
      @delete-session="wb.deleteSessionById"
      @select-format="wb.selectFormat"
      @rename-format="wb.renameFormat"
      @change-format-cat="wb.updateFormatCategory"
      @duplicate-format="wb.duplicateFormat"
      @delete-format="wb.removeFormat"
      @open-import="openImport"
      @toggle-vision="state.visionEnabled = !state.visionEnabled"
      @cancel-bg-import="wb.cancelOrDismissBgImport"
      @apply-bg-import="wb.applyBgImportedTemplate"
    />

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
      <DebugSidebar
        v-if="state.debug"
        :formats="state.formats"
        :active-format="activeFormat"
        :drawer-open="state.debugDrawerOpen"
        @select-format="wb.selectFormat"
        @open-import="openImport"
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
        :active-format="activeFormat"
        :suggested-docx-name="suggestedDocxName"
        @update:mode="state.mode = $event"
        @update:draft-text="wb.updateDraftText"
        @update:generate-cover="state.generateCover = $event"
        @update:generate-toc="state.generateToc = $event"
        @update:normalize-punct="state.normalizePunct = $event"
        @update-slot="wb.updateSlotValue"
        @fill-sample="wb.fillStarterDraft"
        @upload-draft="wb.uploadDraft"
        @apply-format="wb.applyFormat"
        @stop-task="wb.stopActiveTask()"
        @send-chat="wb.sendChat"
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
        @update:zoom="state.zoom = $event"
        @update:page="state.page = $event"
        @update:drawer-tab="state.drawerTab = $event"
        @set-dropdown="state.openDropdown = $event"
        @surgery="wb.runSurgery"
        @reapply-format="wb.applyFormat"
        @download="wb.downloadDocx()"
      />
    </div>

    <ImportModal
      :open="state.importOpen"
      @close="state.importOpen = false"
      @confirm="wb.startBackgroundImport"
    />

    <div
      id="toast"
      class="fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[#0F172A] text-white text-[12px] font-medium shadow-lg pointer-events-none transition-opacity z-50"
      :class="state.toastText ? 'opacity-100' : 'opacity-0'"
    >
      {{ state.toastText }}
    </div>
  </div>
</template>
