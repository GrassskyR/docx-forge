<script setup lang="ts">
import { onMounted, onUnmounted } from "vue"
import TopBar from "./components/TopBar.vue"
import DebugSidebar from "./components/DebugSidebar.vue"
import ContentColumn from "./components/ContentColumn.vue"
import PreviewStage from "./components/PreviewStage.vue"
import ImportModal from "./components/ImportModal.vue"
import { useWorkbench } from "./workbench"

const wb = useWorkbench()
const { state, activeFormat, previewUrls } = wb

function closePopover() {
  if (state.popoverOpen) state.popoverOpen = false
}

function toggleDebug() {
  state.debug = !state.debug
  wb.toast(state.debug ? "已开启调试模式：展开全部诊断面板" : "已切回普通模式：极简专注视图")
}

function openImport() {
  state.popoverOpen = false
  state.importOpen = true
}

function onDraftUpdate(text: string) {
  state.draftText = text
  state.draftEdited = true
}

onMounted(() => {
  window.addEventListener("click", closePopover)
  wb.init().catch((e) => wb.toast(e instanceof Error ? e.message : String(e)))
})

onUnmounted(() => {
  window.removeEventListener("click", closePopover)
})
</script>

<template>
  <div class="h-screen w-screen overflow-hidden flex flex-col select-none bg-[#F8FAFC]">
    <TopBar
      :debug="state.debug"
      :popover-open="state.popoverOpen"
      :popover-cat="state.popoverCat"
      :formats="state.formats"
      :active-format="activeFormat"
      :branches="state.branches"
      :active-branch-id="state.activeBranchId"
      :usage="state.usage"
      :vision-enabled="state.visionEnabled"
      :langfuse-enabled="state.health?.langfuse_enabled"
      @toggle-debug="toggleDebug"
      @toggle-popover="state.popoverOpen = !state.popoverOpen"
      @change-popover-cat="state.popoverCat = $event"
      @select-format="wb.selectFormat"
      @open-import="openImport"
      @fork-branch="wb.forkBranch"
      @switch-branch="wb.switchBranch"
      @toggle-vision="state.visionEnabled = !state.visionEnabled"
    />

    <div class="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
      <DebugSidebar
        v-if="state.debug"
        :formats="state.formats"
        :active-format="activeFormat"
        @select-format="wb.selectFormat"
        @open-import="openImport"
        @fork-current="wb.forkCurrentFormat"
      />

      <ContentColumn
        :debug="state.debug"
        :mode="state.mode"
        :draft-text="state.draftText"
        :normalize-punct="state.normalizePunct"
        :busy="state.busy"
        :busy-label="state.busyLabel"
        :fidelity="state.currentDoc?.fidelity"
        :last-token-delta="state.lastTokenDelta"
        :mappings="state.mappings"
        :chat-messages="state.chatMessages"
        :active-format="activeFormat"
        :slot-values="state.slotValues"
        @update:mode="state.mode = $event"
        @update:draft-text="onDraftUpdate"
        @update:normalize-punct="state.normalizePunct = $event"
        @update-slot="(k, v) => (state.slotValues[k] = v)"
        @upload-draft="wb.uploadDraft"
        @apply-format="wb.applyFormat"
        @send-chat="wb.sendChat"
        @surgery="wb.runSurgery"
      />

      <PreviewStage
        :debug="state.debug"
        :zoom="state.zoom"
        :page="state.page"
        :drawer-tab="state.drawerTab"
        :vision-enabled="state.visionEnabled"
        :draft-text="state.draftText"
        :active-format="activeFormat"
        :current-doc="state.currentDoc"
        :preview-urls="previewUrls"
        :purged-images="state.purgedImages"
        :isolated-pages="state.isolatedPages"
        @update:zoom="state.zoom = $event"
        @update:page="state.page = $event"
        @update:drawer-tab="state.drawerTab = $event"
        @compact-fit="wb.runSurgery('compact')"
        @download="wb.downloadDocx"
      />
    </div>

    <ImportModal
      :open="state.importOpen"
      :busy="state.busy"
      :busy-label="state.busyLabel"
      @close="state.importOpen = false"
      @confirm="wb.importTemplate"
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
