<script setup lang="ts">
import { computed, nextTick, ref } from "vue"
import type { SessionSummary } from "@docs-agent/shared"

const props = defineProps<{
  open: boolean
  drawerOpen: boolean
  sessions: SessionSummary[]
  activeSessionId: string
}>()

const emit = defineEmits<{
  createSession: []
  switchSession: [id: string]
  renameSession: [id: string, name: string]
  deleteSession: [id: string]
  closeDrawer: []
}>()

const searchQuery = ref("")
const renamingId = ref<string | null>(null)
const renamingVal = ref("")
const confirmDelId = ref<string | null>(null)
const renameInputRef = ref<HTMLInputElement[] | null>(null)

const shortcutHint =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent)
    ? "⌘N"
    : "Ctrl+N"

function isSameLocalDay(ts: number, refDate: Date): boolean {
  const d = new Date(ts)
  return (
    d.getFullYear() === refDate.getFullYear() &&
    d.getMonth() === refDate.getMonth() &&
    d.getDate() === refDate.getDate()
  )
}

function formatRelativeTime(ts: number): string {
  const now = Date.now()
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000))
  if (diffSec < 60) return "刚刚"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return diffMin + "分钟前"
  const nowDate = new Date(now)
  if (isSameLocalDay(ts, nowDate)) {
    return Math.max(1, Math.floor(diffMin / 60)) + "小时前"
  }
  const yesterday = new Date(nowDate)
  yesterday.setDate(nowDate.getDate() - 1)
  if (isSameLocalDay(ts, yesterday)) return "昨天"
  const diffDay = Math.max(1, Math.floor(diffSec / 86400))
  if (diffDay < 30) return diffDay + "天前"
  const d = new Date(ts)
  return d.getMonth() + 1 + "月" + d.getDate() + "日"
}

function sessionStatusLabel(sess: SessionSummary): string {
  if (sess.doc_pages) return sess.doc_pages + "页成品"
  if (sess.has_draft) return "含草稿"
  return "空白"
}

const groupedSessions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const sorted = [...props.sessions].sort((a, b) => b.updated_at - a.updated_at)
  const filtered = q
    ? sorted.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.template_name.toLowerCase().includes(q),
      )
    : sorted
  const nowDate = new Date()
  const today: SessionSummary[] = []
  const earlier: SessionSummary[] = []
  for (const s of filtered) {
    if (isSameLocalDay(s.updated_at, nowDate)) today.push(s)
    else earlier.push(s)
  }
  const groups: { label: string; items: SessionSummary[] }[] = []
  if (today.length) groups.push({ label: "今天", items: today })
  if (earlier.length) groups.push({ label: "更早", items: earlier })
  return groups
})

async function startRename(sess: SessionSummary) {
  renamingId.value = sess.id
  renamingVal.value = sess.name
  confirmDelId.value = null
  await nextTick()
  const inp = renameInputRef.value?.[0]
  if (inp) {
    inp.focus()
    inp.select()
  }
}

function commitRename(id: string) {
  const clean = renamingVal.value.trim()
  if (clean) emit("renameSession", id, clean)
  renamingId.value = null
}

function confirmDelete(id: string) {
  confirmDelId.value = null
  emit("deleteSession", id)
}

function onSelectSession(id: string) {
  confirmDelId.value = null
  emit("switchSession", id)
}
</script>

<template>
  <!-- 窄屏 (<1024px) 抽屉遮罩 -->
  <div
    v-if="drawerOpen"
    class="lg:hidden fixed inset-0 bg-[#0F172A]/35 z-30"
    @click="emit('closeDrawer')"
  ></div>

  <aside
    id="sessionSidebar"
    class="bg-[#F4F6F9] border-[#E2E8F0] flex-col min-h-0 overflow-hidden z-40 lg:flex lg:static lg:shadow-none lg:shrink-0 transition-[width,opacity] duration-200 ease-out"
    :class="[
      drawerOpen
        ? 'fixed inset-y-0 left-0 w-[260px] border-r shadow-2xl flex'
        : 'hidden',
      open
        ? 'lg:w-[248px] lg:opacity-100 lg:border-r'
        : 'lg:w-0 lg:opacity-0 lg:border-r-0 lg:pointer-events-none',
    ]"
  >
    <div class="w-[260px] lg:w-[248px] flex-1 min-h-0 flex flex-col">
      <!-- 顶部新建与搜索 -->
      <div class="p-3 space-y-2 border-b border-[#E2E8F0] shrink-0">
        <div class="flex items-center gap-1.5">
          <button
            id="sidebarNewBtn"
            type="button"
            class="flex-1 h-9 px-3 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[12px] font-semibold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
            @click="emit('createSession')"
          >
            <svg
              class="w-4 h-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>新建对话 / 文档</span>
            <span class="ml-auto text-[11px] opacity-80 font-mono">{{ shortcutHint }}</span>
          </button>

          <button
            type="button"
            title="收起侧边栏"
            class="lg:hidden w-9 h-9 rounded-lg border border-[#E2E8F0] bg-white text-[#64748B] hover:text-[#0F172A] flex items-center justify-center shrink-0 cursor-pointer"
            @click="emit('closeDrawer')"
          >
            ✕
          </button>
        </div>

        <div class="relative">
          <input
            id="sessionSearch"
            v-model="searchQuery"
            type="text"
            placeholder="搜索对话或模板…"
            class="w-full h-8 pl-7 pr-6 rounded-lg bg-white border border-[#E2E8F0] focus:border-[#2563EB] text-[12px] text-[#0F172A] placeholder-[#94A3B8] outline-none transition"
          />
          <svg
            class="w-3.5 h-3.5 text-[#94A3B8] absolute left-2.5 top-2.25 pointer-events-none"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <button
            v-if="searchQuery"
            type="button"
            class="absolute right-1.5 top-1.5 w-5 h-5 rounded text-[#94A3B8] hover:text-[#475569] text-[11px] flex items-center justify-center cursor-pointer"
            @click="searchQuery = ''"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- 分组会话列表 -->
      <div id="sessionList" class="flex-1 min-h-0 overflow-y-auto scroll-thin p-2 space-y-1">
        <template v-for="group in groupedSessions" :key="group.label">
          <div class="px-2 pt-2 pb-1 text-[11px] font-semibold text-[#64748B]">
            {{ group.label }}
          </div>

          <div
            v-for="sess in group.items"
            :key="sess.id"
            :data-session-id="sess.id"
            class="group rounded-xl border px-2.5 py-2 transition cursor-pointer"
            :class="
              sess.id === activeSessionId
                ? 'bg-white border-[#2563EB] shadow-2xs'
                : 'border-transparent hover:bg-white/75'
            "
            @click="onSelectSession(sess.id)"
          >
            <!-- 行内改名态 -->
            <div
              v-if="renamingId === sess.id"
              class="flex items-center gap-1"
              @click.stop
            >
              <input
                ref="renameInputRef"
                v-model="renamingVal"
                type="text"
                class="flex-1 min-w-0 h-7 px-2 rounded border border-[#2563EB] bg-white text-[12px] text-[#0F172A] outline-none"
                @keydown.enter="commitRename(sess.id)"
                @keydown.esc="renamingId = null"
              />
              <button
                type="button"
                class="px-2 py-1 rounded bg-[#2563EB] text-white text-[11px] font-medium shrink-0 cursor-pointer"
                @click="commitRename(sess.id)"
              >
                存
              </button>
              <button
                type="button"
                class="px-1 py-1 text-[11px] text-[#64748B] hover:text-[#0F172A] shrink-0 cursor-pointer"
                @click="renamingId = null"
              >
                ✕
              </button>
            </div>

            <!-- 常规展示态 -->
            <div v-else class="flex items-start justify-between gap-1.5">
              <div class="min-w-0 flex-1">
                <div
                  class="text-[12.5px] font-medium truncate"
                  :class="sess.id === activeSessionId ? 'text-[#0F172A]' : 'text-[#1E293B]'"
                >
                  {{ sess.name }}
                </div>
                <div class="flex items-center gap-1.5 mt-1 text-[11px] text-[#64748B] truncate">
                  <span class="px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] truncate max-w-[122px]">
                    {{ sess.template_name }}
                  </span>
                  <span class="shrink-0 tabular">{{ sess.message_count }}条对话</span>
                </div>
                <div class="mt-1 flex items-center justify-between text-[11px] text-[#64748B] tabular">
                  <span>{{ sessionStatusLabel(sess) }}</span>
                  <span>{{ formatRelativeTime(sess.updated_at) }}</span>
                </div>
              </div>

              <!-- 悬停行内操作：改名 + 二次确认删除 -->
              <div
                class="flex flex-col gap-0.5 transition shrink-0"
                :class="
                  confirmDelId === sess.id
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                "
                @click.stop
              >
                <template v-if="confirmDelId === sess.id">
                  <button
                    type="button"
                    class="px-1.5 py-0.5 rounded bg-[#DC2626] text-white text-[11px] font-medium cursor-pointer"
                    @click="confirmDelete(sess.id)"
                  >
                    确认删
                  </button>
                  <button
                    type="button"
                    class="px-1.5 py-0.5 rounded hover:bg-[#F1F5F9] text-[#64748B] text-[11px] cursor-pointer"
                    @click="confirmDelId = null"
                  >
                    取消
                  </button>
                </template>
                <template v-else>
                  <button
                    type="button"
                    title="重命名"
                    class="px-1.5 py-0.5 rounded hover:bg-[#F1F5F9] text-[#64748B] hover:text-[#0F172A] text-[11.5px] cursor-pointer"
                    @click="startRename(sess)"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    title="删除对话"
                    class="px-1.5 py-0.5 rounded hover:bg-[#FEF2F2] text-[#DC2626] text-[11.5px] cursor-pointer"
                    @click="confirmDelId = sess.id"
                  >
                    ✕
                  </button>
                </template>
              </div>
            </div>
          </div>
        </template>

        <div
          v-if="!groupedSessions.length"
          class="px-3 py-8 text-center text-[12px] text-[#64748B]"
        >
          没有匹配的对话或模板
        </div>
      </div>

      <!-- 底部轻量状态栏 -->
      <div class="px-3 py-2.5 border-t border-[#E2E8F0] text-[11px] text-[#64748B] flex items-center justify-between shrink-0 tabular">
        <span id="sessionCountText">共 {{ sessions.length }} 个独立会话</span>
        <span>独立上下文隔离</span>
      </div>
    </div>
  </aside>
</template>
