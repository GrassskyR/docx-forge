import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from "electron"

export function setupAppMenu(win: BrowserWindow, dataDir: string) {
  const sendAction = (action: string) => {
    if (!win.isDestroyed()) win.webContents.send("docforge:menu-action", action)
  }
  const isMac = process.platform === "darwin"

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { label: "关于 DocForge", role: "about" as const },
              { type: "separator" as const },
              {
                label: "设置…",
                accelerator: "Cmd+,",
                click: () => sendAction("open-settings"),
              },
              { type: "separator" as const },
              { label: "隐藏 DocForge", role: "hide" as const },
              { label: "退出 DocForge", role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "文件",
      submenu: [
        {
          label: "新建文档",
          accelerator: "CmdOrCtrl+N",
          click: () => sendAction("new-session"),
        },
        {
          label: "导入范例模板…",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => sendAction("import-template"),
        },
        { type: "separator" },
        {
          label: "打开本地数据目录",
          click: () => void shell.openPath(dataDir),
        },
        ...(!isMac
          ? [
              {
                label: "设置…",
                accelerator: "Ctrl+,",
                click: () => sendAction("open-settings"),
              },
              { type: "separator" as const },
              { label: "退出", role: "quit" as const },
            ]
          : []),
      ],
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo" },
        { label: "重做", role: "redo" },
        { type: "separator" },
        { label: "剪切", role: "cut" },
        { label: "复制", role: "copy" },
        { label: "粘贴", role: "paste" },
        { label: "全选", role: "selectAll" },
      ],
    },
    {
      label: "视图",
      submenu: [
        { label: "重新加载", role: "reload" },
        { label: "强制重新加载", role: "forceReload" },
        { label: "切换开发者工具", role: "toggleDevTools" },
        { type: "separator" },
        { label: "实际大小", role: "resetZoom" },
        { label: "放大", role: "zoomIn" },
        { label: "缩小", role: "zoomOut" },
        { type: "separator" },
        { label: "全屏", role: "togglefullscreen" },
      ],
    },
    {
      label: "窗口",
      submenu: [
        { label: "最小化", role: "minimize" },
        { label: "关闭窗口", role: "close" },
      ],
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "下载 LibreOffice",
          click: () =>
            void shell.openExternal("https://www.libreoffice.org/download/download-libreoffice/"),
        },
        {
          label: "GitHub 仓库",
          click: () => void shell.openExternal("https://github.com/GrassskyR/docx-forge"),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
