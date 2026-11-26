<script setup lang="ts">
import { ref } from "vue"

const props = defineProps<{
  open: boolean
  busy: boolean
  busyLabel?: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [file: File, name: string, category: string, rules: string]
}>()

const pickedFile = ref<File | null>(null)
const tplName = ref("单位红头通知格式")
const tplCat = ref("gongwen")
const tplRules = ref("")
const fileInput = ref<HTMLInputElement | null>(null)

function setFile(file: File | undefined) {
  if (!file) return
  pickedFile.value = file
  const base = file.name.replace(/\.docx?$/i, "")
  if (base) tplName.value = base
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  if (props.busy) return
  setFile(e.dataTransfer?.files?.[0])
}

function handleClose() {
  if (props.busy) return
  emit("close")
}

function submit() {
  if (!pickedFile.value || props.busy) return
  emit(
    "confirm",
    pickedFile.value,
    tplName.value.trim() || "自定义格式",
    tplCat.value,
    tplRules.value.trim(),
  )
}
</script>

<template>
  <div
    v-if="open"
    id="importModal"
    class="fixed inset-0 bg-[#0F172A]/35 backdrop-blur-[2px] flex items-center justify-center p-4 z-50"
  >
    <div class="bg-white border border-[#E2E8F0] rounded-2xl shadow-2xl w-full max-w-[440px] overflow-hidden">
      <div class="px-5 py-4 border-b border-[#F1F5F9] flex items-center justify-between">
        <div>
          <h3 class="text-[14.5px] font-semibold text-[#0F172A]">导入范例文档</h3>
          <p class="text-[12px] text-[#64748B] mt-0.5">
            上传一份标准 .doc / .docx，系统自动识别封面槽位、剔除说明页并记住版式
          </p>
        </div>
        <button
          id="closeImportModal"
          type="button"
          :disabled="busy"
          class="w-7 h-7 rounded-lg hover:bg-[#F1F5F9] disabled:opacity-40 text-[#64748B] flex items-center justify-center cursor-pointer"
          @click="handleClose"
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
          @click="!busy && fileInput?.click()"
        >
          <div class="font-medium text-[#0F172A]">
            {{ pickedFile ? "已选择：" + pickedFile.name : "拖拽 .doc / .docx 文件到此处，或点击选择" }}
          </div>
          <div class="text-[11.5px] text-[#64748B] mt-1">
            自动保留封面、页眉页脚与媒体图片，智能剥离不打印的说明示例页
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2">
            <label class="block text-[12px] font-medium text-[#334155] mb-1">格式名称</label>
            <input
              id="newTplName"
              v-model="tplName"
              :disabled="busy"
              type="text"
              class="w-full h-9 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none"
            />
          </div>
          <div>
            <label class="block text-[12px] font-medium text-[#334155] mb-1">分类</label>
            <select
              id="newTplCat"
              v-model="tplCat"
              :disabled="busy"
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
            :disabled="busy"
            type="text"
            class="w-full h-9 px-3 rounded-lg border border-[#CBD5E1] focus:border-[#2563EB] outline-none"
            placeholder="例如：保留封面与实习报告页眉，去除说明页"
          />
        </div>
      </div>

      <div class="px-5 py-3.5 bg-[#F8FAFC] border-t border-[#F1F5F9] flex items-center justify-between gap-2">
        <span class="text-[11.5px] text-[#64748B] truncate">
          {{ busy ? busyLabel || "正在解剖骨架并内化模板…" : "仅点击取消或右上角关闭窗口" }}
        </span>
        <div class="flex items-center gap-2 shrink-0">
          <button
            id="cancelImportBtn"
            type="button"
            :disabled="busy"
            class="h-8 px-3.5 rounded-lg border border-[#CBD5E1] bg-white disabled:opacity-40 text-[12px] font-medium text-[#334155] hover:bg-[#F1F5F9] cursor-pointer"
            @click="handleClose"
          >
            取消
          </button>
          <button
            id="confirmImportBtn"
            type="button"
            :disabled="!pickedFile || busy"
            class="h-8 px-4 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-50 text-white text-[12px] font-medium cursor-pointer"
            @click="submit"
          >
            {{ busy ? "正在内化…" : "保存为格式" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
