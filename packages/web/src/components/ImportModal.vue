<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue"
import { CATEGORY_LABELS, normalizeCategory, type CategoryId } from "../types"

const props = defineProps<{
  open: boolean
  initialFile?: File | null
}>()

const emit = defineEmits<{
  close: []
  confirm: [file: File, name: string, category: Exclude<CategoryId, "all">, rules: string]
}>()

const pickedFile = ref<File | null>(null)
const tplName = ref("")
const tplCat = ref<Exclude<CategoryId, "all">>("gongwen")
const tplRules = ref("")
const autoMatched = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

watch(
  () => [props.open, props.initialFile] as const,
  ([isOpen, initFile]) => {
    if (isOpen) {
      pickedFile.value = null
      tplName.value = ""
      tplCat.value = "gongwen"
      tplRules.value = ""
      autoMatched.value = false
      if (initFile) setFile(initFile)
    }
  },
)

function setFile(file: File | undefined) {
  if (!file) return
  pickedFile.value = file
  const base = file.name.replace(/\.docx?$/i, "").trim()
  if (base) tplName.value = base
  tplCat.value = normalizeCategory(file.name)
  autoMatched.value = true
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  setFile(e.dataTransfer?.files?.[0])
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) {
    emit("close")
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown)
})

onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown)
})

function submit() {
  if (!pickedFile.value) return
  const base = pickedFile.value.name.replace(/\.docx?$/i, "").trim()
  emit(
    "confirm",
    pickedFile.value,
    tplName.value.trim() || base || "自定义格式",
    tplCat.value,
    tplRules.value.trim(),
  )
}
</script>

<template>
  <div
    v-if="open"
    id="importModal"
    class="fixed inset-0 bg-[#0F172A]/40 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
    @click.self="emit('close')"
  >
    <div class="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden">
      <div class="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between">
        <div>
          <h3 class="text-[14.5px] font-semibold text-[#0F172A]">导入范例文档</h3>
          <p class="text-[12px] text-[#64748B] mt-0.5">
            上传 .doc / .docx，提交后将在后台自检入库，不耽误当前文档编写
          </p>
        </div>
        <button
          id="closeImportModal"
          type="button"
          class="w-7 h-7 rounded-lg hover:bg-[#F1F5F9] text-[#64748B] flex items-center justify-center cursor-pointer"
          @click="emit('close')"
        >
          ✕
        </button>
      </div>

      <div class="p-5 space-y-4 text-[12.5px]">
        <input
          ref="fileInput"
          type="file"
          accept=".doc,.docx"
          class="hidden"
          @change="setFile(($event.target as HTMLInputElement).files?.[0])"
        />
        <div
          class="border-2 border-dashed border-[#CBD5E1] hover:border-[#2563EB] bg-[#F8FAFC] rounded-xl p-6 text-center transition cursor-pointer"
          @dragover.prevent
          @drop="onDrop"
          @click="fileInput?.click()"
        >
          <div class="font-medium text-[#0F172A]">
            {{
              pickedFile
                ? "✓ 已选择：" + pickedFile.name
                : "拖拽 .doc / .docx 文件到此处，或点击选择"
            }}
          </div>
          <div class="text-[11.5px] text-[#64748B] mt-1">
            自动保留封面、页眉校徽与样式链，智能剥离不打印的填表说明页
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2">
            <label class="block text-[12px] font-medium text-[#334155] mb-1">格式名称</label>
            <input
              id="newTplName"
              v-model="tplName"
              type="text"
              placeholder="选择文件后自动填入，可修改"
              class="w-full h-9 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] placeholder-[#94A3B8] outline-none"
            />
          </div>
          <div>
            <label class="block text-[12px] font-medium text-[#334155] mb-1">分类</label>
            <select
              id="newTplCat"
              v-model="tplCat"
              class="w-full h-9 px-2.5 rounded-lg border border-[#CBD5E1] bg-white outline-none"
            >
              <option value="gongwen">公文</option>
              <option value="thesis">论文/报告</option>
              <option value="contract">合同/表</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-[12px] font-medium text-[#334155] mb-1">额外要求（可选）</label>
          <input
            v-model="tplRules"
            type="text"
            class="w-full h-9 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] placeholder-[#94A3B8] outline-none"
            placeholder="例如：保留页眉校徽，剥离第 2 页撰写规范说明"
          />
        </div>
      </div>

      <div class="px-5 py-3.5 bg-[#F8FAFC] border-t border-[#F1F5F9] flex items-center justify-between gap-2">
        <span class="text-[11.5px] text-[#64748B] truncate">
          {{
            pickedFile && autoMatched
              ? "已自动匹配为「" + CATEGORY_LABELS[tplCat] + "」分类"
              : "请先选择一份 .doc / .docx 范例文档"
          }}
        </span>
        <div class="flex items-center gap-2 shrink-0">
          <button
            id="cancelImportBtn"
            type="button"
            class="h-8 px-3.5 rounded-lg border border-[#CBD5E1] bg-white text-[12px] font-medium text-[#334155] hover:bg-[#F1F5F9] cursor-pointer"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            id="confirmImportBtn"
            type="button"
            :disabled="!pickedFile"
            :title="pickedFile ? '在后台提取版式并自检入库' : '请先选择 .doc / .docx 文件'"
            class="h-8 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 disabled:cursor-not-allowed text-white text-[12px] font-medium cursor-pointer"
            @click="submit"
          >
            开始后台导入
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
