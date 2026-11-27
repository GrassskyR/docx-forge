import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { Worker } from "node:worker_threads"

interface KoffiLib {
  func(sig: string): (...args: unknown[]) => number
}

interface KoffiModule {
  load(name: string): KoffiLib
}

const COM_WORKER_SCRIPT = `
const { parentPort, workerData } = require("node:worker_threads");
const koffi = require(workerData.koffiPath);

const ole32 = koffi.load("ole32.dll");
const oleaut32 = koffi.load("oleaut32.dll");

const VARIANT = koffi.struct("VARIANT", {
  vt: "uint16",
  wReserved1: "uint16",
  wReserved2: "uint16",
  wReserved3: "uint16",
  val: "uintptr_t",
  pad: "uintptr_t",
});

const DISPPARAMS = koffi.struct("DISPPARAMS", {
  rgvarg: koffi.pointer(VARIANT),
  rgdispidNamedArgs: "int32 *",
  cArgs: "uint32",
  cNamedArgs: "uint32",
});

const EXCEPINFO = koffi.struct("EXCEPINFO", {
  wCode: "uint16",
  wReserved: "uint16",
  bstrSource: "void *",
  bstrDescription: "void *",
  bstrHelpFile: "void *",
  dwHelpContext: "uint32",
  pvReserved: "void *",
  pfnDeferredFillIn: "void *",
  scode: "int32",
});

const CoInitializeEx = ole32.func(
  "int __stdcall CoInitializeEx(void *pvReserved, uint32 dwCoInit)"
);
const CoUninitialize = ole32.func("void __stdcall CoUninitialize()");
const CLSIDFromProgID = ole32.func(
  "int __stdcall CLSIDFromProgID(str16 lpszProgID, _Out_ uint8 *lpclsid)"
);
const CoCreateInstance = ole32.func(
  "int __stdcall CoCreateInstance(" +
    "const uint8 *rclsid, void *pUnkOuter, uint32 dwClsContext, " +
    "const uint8 *riid, _Out_ void **ppv)"
);

const SysAllocString = oleaut32.func("void * __stdcall SysAllocString(str16 psz)");
const SysFreeString = oleaut32.func("void __stdcall SysFreeString(void *bstr)");
const SysStringLen = oleaut32.func("uint32 __stdcall SysStringLen(void *bstr)");
const VariantClear = oleaut32.func("int __stdcall VariantClear(_Inout_ VARIANT *pvarg)");

const ReleaseProto = koffi.proto("uint32 __stdcall Release(void *This)");
const GetIDsOfNamesProto = koffi.proto(
  "int __stdcall GetIDsOfNames(" +
    "void *This, const uint8 *riid, void **rgszNames, " +
    "uint32 cNames, uint32 lcid, _Out_ int32 *rgDispId)"
);
const InvokeProto = koffi.proto(
  "int __stdcall Invoke(" +
    "void *This, int32 dispIdMember, const uint8 *riid, uint32 lcid, " +
    "uint16 wFlags, DISPPARAMS *pDispParams, _Inout_ VARIANT *pVarResult, " +
    "_Out_ EXCEPINFO *pExcepInfo, _Out_ uint32 *puArgErr)"
);

const IID_NULL = new Uint8Array(16);
const IID_IDISPATCH = new Uint8Array([
  0x00, 0x04, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00,
  0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
]);

function vtblOf(pDisp) {
  const lpVtbl = koffi.decode(pDisp, "void *");
  const slots = koffi.decode(lpVtbl, koffi.array("void *", 7));
  return {
    release: koffi.decode(slots[2], ReleaseProto),
    getIds: koffi.decode(slots[5], GetIDsOfNamesProto),
    invoke: koffi.decode(slots[6], InvokeProto),
  };
}

function getDispId(pDisp, name) {
  const { getIds } = vtblOf(pDisp);
  const buf = Buffer.from(name + "\\0", "utf16le");
  const out = [0];
  const hr = getIds(pDisp, IID_NULL, [buf], 1, 0x0400, out);
  if (hr < 0) {
    throw new Error("GetIDsOfNames(" + name + ") failed: 0x" + (hr >>> 0).toString(16));
  }
  return out[0];
}

function makeVar(v) {
  if (typeof v === "boolean") {
    return {
      vt: 11,
      wReserved1: 0,
      wReserved2: 0,
      wReserved3: 0,
      val: v ? 0xffffn : 0n,
      pad: 0n,
    };
  }
  if (typeof v === "number") {
    return {
      vt: 3,
      wReserved1: 0,
      wReserved2: 0,
      wReserved3: 0,
      val: BigInt(v >>> 0),
      pad: 0n,
    };
  }
  if (typeof v === "string") {
    const bstr = SysAllocString(v);
    return {
      vt: 8,
      wReserved1: 0,
      wReserved2: 0,
      wReserved3: 0,
      val: koffi.address(bstr),
      pad: 0n,
    };
  }
  return { vt: 0, wReserved1: 0, wReserved2: 0, wReserved3: 0, val: 0n, pad: 0n };
}

function freeExcep(excep) {
  if (excep.bstrSource) SysFreeString(excep.bstrSource);
  if (excep.bstrDescription) SysFreeString(excep.bstrDescription);
  if (excep.bstrHelpFile) SysFreeString(excep.bstrHelpFile);
}

function dispInvoke(pDisp, name, flags, args = []) {
  const dispId = getDispId(pDisp, name);
  const { invoke } = vtblOf(pDisp);
  const revArgs = [...args].reverse().map(makeVar);
  const namedPropPut = [-3];
  const isPut = (flags & 4) !== 0;
  const params = {
    rgvarg: revArgs.length ? revArgs : null,
    rgdispidNamedArgs: isPut ? namedPropPut : null,
    cArgs: revArgs.length,
    cNamedArgs: isPut ? 1 : 0,
  };
  const result = { vt: 0, wReserved1: 0, wReserved2: 0, wReserved3: 0, val: 0n, pad: 0n };
  const excep = {};
  const argErr = [0];
  try {
    const hr = invoke(pDisp, dispId, IID_NULL, 0x0400, flags, params, result, excep, argErr);
    if (hr < 0) {
      let msg = "COM Invoke(" + name + ") failed: 0x" + (hr >>> 0).toString(16);
      if (excep.bstrDescription) {
        const len = SysStringLen(excep.bstrDescription);
        if (len > 0) {
          msg += " - " + koffi.decode(excep.bstrDescription, "char16", len);
        }
      }
      freeExcep(excep);
      throw new Error(msg);
    }
    if (result.vt === 9 && result.val) return result.val;
    VariantClear(result);
    return null;
  } finally {
    for (const a of revArgs) VariantClear(a);
  }
}

function runConvert() {
  const { progId, src, dst, ext } = workerData;
  const initHr = CoInitializeEx(null, 2);
  let app = null;
  let docs = null;
  let doc = null;
  try {
    const clsid = new Uint8Array(16);
    const clsHr = CLSIDFromProgID(progId, clsid);
    if (clsHr < 0) {
      throw new Error("未找到 COM 组件 " + progId + " (0x" + (clsHr >>> 0).toString(16) + ")");
    }
    const out = [null];
    const createHr = CoCreateInstance(clsid, null, 5, IID_IDISPATCH, out);
    if (createHr < 0 || !out[0]) {
      throw new Error(
        "无法启动 COM 服务 " + progId + " (0x" + (createHr >>> 0).toString(16) + ")"
      );
    }
    app = out[0];
    try {
      dispInvoke(app, "Visible", 4, [false]);
    } catch {}
    try {
      dispInvoke(app, "DisplayAlerts", 4, [0]);
    } catch {}
    try {
      dispInvoke(app, "AutomationSecurity", 4, [3]);
    } catch {}
    docs = dispInvoke(app, "Documents", 2);
    if (!docs) throw new Error(progId + ".Documents 返回为空");
    doc = dispInvoke(docs, "Open", 1, [src, false, true, false]);
    if (!doc) throw new Error(progId + " 无法打开文档: " + src);
    if (ext === "pdf") {
      try {
        dispInvoke(doc, "ExportAsFixedFormat", 1, [dst, 17]);
      } catch {
        try {
          dispInvoke(doc, "SaveAs2", 1, [dst, 17]);
        } catch {
          dispInvoke(doc, "SaveAs", 1, [dst, 17]);
        }
      }
    } else {
      const wdFormat = ext === "doc" ? 0 : 16;
      try {
        dispInvoke(doc, "SaveAs2", 1, [dst, wdFormat]);
      } catch {
        dispInvoke(doc, "SaveAs", 1, [dst, wdFormat]);
      }
    }
  } finally {
    if (doc) {
      try {
        dispInvoke(doc, "Close", 1, [0]);
      } catch {}
      vtblOf(doc).release(doc);
    }
    if (docs) {
      vtblOf(docs).release(docs);
    }
    if (app) {
      try {
        dispInvoke(app, "Quit", 1, [0]);
      } catch {
        try {
          dispInvoke(app, "Quit", 1, []);
        } catch {}
      }
      vtblOf(app).release(app);
    }
    if (initHr >= 0) CoUninitialize();
  }
}

try {
  runConvert();
  parentPort.postMessage({ ok: true });
} catch (err) {
  parentPort.postMessage({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
}
`

let cachedKoffiPath: string | null = null
let cachedClsidFn: ((progId: string, out: Uint8Array) => number) | null = null

function resolveKoffiBinaryPath(): string {
  if (cachedKoffiPath) return cachedKoffiPath
  const resPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resPath) {
    const bundled = join(resPath, "koffi", `win32_${process.arch}`, "koffi.node")
    if (existsSync(bundled)) {
      cachedKoffiPath = bundled
      return bundled
    }
  }
  const req = createRequire(import.meta.url)
  const scopedPkg = `@koromix/koffi-win32-${process.arch}/win32_${process.arch}/koffi.node`
  try {
    const resolved = req.resolve(scopedPkg)
    cachedKoffiPath = resolved
    return resolved
  } catch {
    const fallback = req.resolve("koffi")
    cachedKoffiPath = fallback
    return fallback
  }
}

function getClsidLookup(): (progId: string, out: Uint8Array) => number {
  if (cachedClsidFn) return cachedClsidFn
  const req = createRequire(import.meta.url)
  const koffi = req(resolveKoffiBinaryPath()) as KoffiModule
  const ole32 = koffi.load("ole32.dll")
  const fn = ole32.func("int __stdcall CLSIDFromProgID(str16 lpszProgID, _Out_ uint8 *lpclsid)")
  cachedClsidFn = (progId: string, out: Uint8Array) => fn(progId, out)
  return cachedClsidFn
}

export function hasWinProgId(progId: string): boolean {
  if (process.platform !== "win32") return false
  try {
    const lookup = getClsidLookup()
    return lookup(progId, new Uint8Array(16)) >= 0
  } catch {
    return false
  }
}

export async function convertViaWinCom(
  progId: string,
  src: string,
  dst: string,
  ext: "docx" | "pdf" | "doc",
  timeoutMs = 90_000,
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("Windows COM 渲染仅支持 Windows 平台")
  }
  const koffiPath = resolveKoffiBinaryPath()
  await new Promise<void>((resolvePromise, rejectPromise) => {
    let settled = false
    const worker = new Worker(COM_WORKER_SCRIPT, {
      eval: true,
      workerData: { koffiPath, progId, src, dst, ext },
    })
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      void worker.terminate()
      rejectPromise(new Error(`${progId} COM 文档转换超时 (${timeoutMs}ms)`))
    }, timeoutMs)

    worker.once("message", (msg: { ok: boolean; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (msg.ok) resolvePromise()
      else rejectPromise(new Error(msg.error || `${progId} COM 转换失败`))
    })

    worker.once("error", (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(err)
    })

    worker.once("exit", (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rejectPromise(new Error(`${progId} COM 工作线程异常退出 (code ${code})`))
    })
  })
}
