<script setup lang="ts">
import { computed } from "vue"
import type { FormatOption } from "../types"

const props = defineProps<{
  formats: FormatOption[]
  activeFormat?: FormatOption
}>()

const emit = defineEmits<{
  selectFormat: [fmt: FormatOption]
  openImport: []
  forkCurrent: []
}>()

const cardStats = computed(() => {
  const card = props.activeFormat?.capabilityCard ?? ""
  const chars = card.length
  const estTok = Math.max(40, Math.ceil(chars * 0.6))
  return "~" + estTok + " tok · " + chars + " 字"
})
</script>

<template>
  <aside
    id="debugSidebar"
    class="w-full lg:w-[268px] shrink-0 bg-[#F4F6F9] border-b lg:border-b-0 lg:border-r border-[#E2E8F0] flex flex-col min-h-0"
  >
    <div class="p-3 border-b border-[#E2E8F0] flex items-center justify-between gap-2">
      <span class="text-[12px] font-semibold text-[#0F172A]">模板资产库（调试视图）</span>
      <div class="flex items-center gap-2 text-[11.5px]">
        <button
          type="button"
          class="font-medium text-[#475569] hover:text-[#0F172A] cursor-pointer"
          @click="emit('forkCurrent')"
        >
          派生
        </button>
        <button
          id="sidebarImportBtn"
          type="button"
          class="font-medium text-[#2563EB] hover:underline cursor-pointer"
          @click="emit('openImport')"
        >
          + 导入
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto scroll-thin p-3 space-y-2 max-h-[220px] lg:max-h-none">
      <div
        v-for="fmt in formats"
        :key="fmt.id"
        class="p-2.5 rounded-[10px] border cursor-pointer transition"
        :class="
          activeFormat?.id === fmt.id
            ? 'bg-white border-[#2563EB] ring-2 ring-[#EFF6FF]'
            : 'bg-white/70 border-[#E2E8F0] hover:bg-white'
        "
        @click="emit('selectFormat', fmt)"
      >
        <div class="flex items-center justify-between gap-1.5">
          <span class="text-[12px] font-semibold text-[#0F172A] truncate">{{ fmt.name }}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-[#F1F5F9] text-[#475569] shrink-0">
            {{ fmt.categoryLabel }}
          </span>
        </div>
        <div class="text-[10.5px] font-mono text-[#64748B] mt-1">
          {{ fmt.fields.length }} 填空 · {{ fmt.contentSlots.length }} 内容槽 · {{ fmt.prototypes.length }} 原型
        </div>
      </div>
    </div>

    <div class="p-3 border-t border-[#E2E8F0] bg-white">
      <div class="flex items-center justify-between text-[11px] font-semibold text-[#0F172A] mb-1.5">
        <span>上下文能力卡</span>
        <span id="capTokenBadge" class="font-mono font-normal text-[#64748B] tabular">
          {{ cardStats }}
        </span>
      </div>
      <div class="text-[11px] text-[#475569] space-y-1.5 leading-relaxed">
        <div>
          <strong class="text-[#0F172A]">保留壳：</strong>
          <span>
            {{
              activeFormat?.preserved.length
                ? activeFormat.preserved.join(" · ")
                : "母版节属性与原件样式"
            }}
          </span>
        </div>
        <div class="flex flex-wrap gap-1 pt-0.5">
          <span
            v-for="f in activeFormat?.fields ?? []"
            :key="f.name"
            class="px-1.5 py-0.5 rounded bg-[#F1F5F9] border border-[#E2E8F0] text-[10px]"
            v-text="'{{' + f.name + '}}'"
          ></span>
          <span
            v-for="s in activeFormat?.contentSlots ?? []"
            :key="'c:' + s"
            class="px-1.5 py-0.5 rounded bg-[#EFF6FF] border border-[#BFDBFE] text-[#1D4ED8] text-[10px]"
            v-text="'[' + s + ']'"
          ></span>
        </div>
      </div>
    </div>
  </aside>
</template>
