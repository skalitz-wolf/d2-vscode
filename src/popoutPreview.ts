import * as path from "path";
import { readFileSync } from "fs";
import { commands, TextDocument, Uri, ViewColumn, WebviewPanel, window } from "vscode";
import { parseTopLevelBoards } from "./boardParser";
import { extContext, taskRunner } from "./extension";
import { RefreshTimer } from "./refreshTimer";
import { util } from "./utility";

/**
 * PopoutTab - 预览浮窗里的一个页签，对应一个 d2 文档。
 *
 * 与主窗口预览（D2P.outputDoc）完全独立：浮窗同一时刻只渲染激活页签的图，
 * 其余页签的状态全部缓存在扩展端（SVG、board 路径、场景列表、busy/toast），
 * 切换页签时重发；zoom/pan 则按页签缓存在 webview 端（tabId 机制）。
 **/
class PopoutTab {
  doc: TextDocument;
  // 页签 id，发给 webview 做页签条与 zoom 状态的键
  id: string;
  // 最近一次渲染的 SVG（空串 = 尚无画面，切换到该页签时清空画布）
  lastSvg: string = "";
  // 当前渲染的 board 路径（空串 = 主板），语义同 D2P.currentTarget
  board: string = "";
  // 顶层场景名列表，随 render 消息发给 webview 渲染面包屑
  scenarioList: string[] = [];
  busy: boolean = false;
  toastVisible: boolean = false;
  toastMsg: string = "";
  toastList: string = "";
  // autoUpdate 的防抖定时器（编辑触发，超时后重新编译本页签）
  timer: RefreshTimer;

  constructor(doc: TextDocument, id: string) {
    this.doc = doc;
    this.id = id;
    this.timer = new RefreshTimer(() => {
      popoutPreview.compile(this);
    });
  }
}

/**
 * PopoutPreviewManager - 预览浮窗的单例管理器（见 ADR 0001）。
 *
 * 浮窗 = 单例 WebviewPanel + webview 内自绘页签条。之所以自建而不是复用
 * VS Code 内置「移到新窗口」，是因为扩展无法把面板挂进一个已存在的分离窗口；
 * 单面板被用户手动分离时天然就是"唯一那个窗口"，页签条随之共用。
 **/
export class PopoutPreviewManager {
  private tabs: Map<TextDocument, PopoutTab> = new Map();
  // 页签条显示顺序（新页签追加到尾部）
  private order: PopoutTab[] = [];
  private activeTab?: PopoutTab;
  private panel?: WebviewPanel;
  private tabCounter: number = 0;
  // 是否已把面板移进独立 OS 窗口。VS Code 没有 API 创建分离窗口，只能
  // 创建面板后调内置命令 moveEditorToNewWindow（Copilot Chat 同款技巧）；
  // 该命令作用于"当前活动编辑器"，所以只在面板首次创建后紧跟着 reveal
  // 时执行一次，避免把别的编辑器或已分离的面板再移一次
  private detached: boolean = false;

  has(doc: TextDocument): boolean {
    return this.tabs.has(doc);
  }

  /**
   * 预览浮窗按钮入口：激活该文档的页签并重新编译。
   * 文档已在浮窗 → 激活 + 重编译（保证"最新"画面，语义同 Markdown 预览按钮）；
   * 不在 → 新建页签（主板起步）。面板不存在则创建。
   **/
  open(doc: TextDocument): void {
    let tab = this.tabs.get(doc);
    if (!tab) {
      tab = new PopoutTab(doc, `tab${++this.tabCounter}`);
      this.tabs.set(doc, tab);
      this.order.push(tab);
      // 新页签先亮出 "Loading..."，编译完成由回调接管
      tab.toastVisible = true;
      tab.toastMsg = "Loading...";
    }
    if (!this.panel) {
      this.createPanel();
    }
    this.activeTab = tab;
    this.panel?.reveal();
    this.detachIfNeeded();
    this.pushView(tab);
    this.compile(tab);
  }

  /**
   * 面板首次创建后，立即用内置命令把它移进独立 OS 窗口（弹窗）。
   * reveal() 默认不 preserveFocus，此时活动编辑器就是浮窗面板，
   * moveEditorToNewWindow 移的就是它。移入新窗口会重置 webview 上下文，
   * 由 onDidChangeViewState 的恢复逻辑重推画面。
   * 命令不存在（老版本 VS Code）则面板留在编辑区，页签照常可用。
   */
  private detachIfNeeded(): void {
    if (!this.panel || this.detached) {
      return;
    }
    this.detached = true;
    commands.executeCommand("workbench.action.moveEditorToNewWindow").then(
      () => {
        // 移进新窗口后顺手开 compact 模式：去掉浮窗顶部的 VS Code 原生
        // 页签条与状态栏，只留极简标题栏——页签只留 webview 里自绘的那一套
        // （Copilot Chat "在新窗口打开"的浮窗同款形态，≥1.100）。
        // 浮窗每次重建都会重发此命令；compact 是"开启"型命令非开关，重复发无害
        commands
          .executeCommand("workbench.action.enableCompactAuxiliaryWindow")
          .then(undefined, () => {
            // 老版本（<1.100）无此命令：浮窗保持普通模式，原生页签仍在
          });
      },
      () => {
        this.detached = false;
      },
    );
  }

  /** 文档关闭 → 页签随之关闭（文档没了页签没有存在意义） */
  removeTab(doc: TextDocument): void {
    const tab = this.tabs.get(doc);
    if (tab) {
      this.closeTabObject(tab);
    }
  }

  /** 编辑触发：防抖后重新编译（autoUpdate） */
  refresh(doc: TextDocument): void {
    this.tabs.get(doc)?.timer.reset();
  }

  /** 保存触发 / 主动刷新：立即重新编译 */
  compileNow(doc: TextDocument): void {
    const tab = this.tabs.get(doc);
    if (tab) {
      this.compile(tab);
    }
  }

  /** 预览设置（layout/theme/sketch）变化 → 重编译所有页签 */
  compileAll(): void {
    this.order.forEach((tab) => this.compile(tab));
  }

  dispose(): void {
    this.panel?.dispose();
  }

  /**
   * 编译一个页签。target === undefined 表示沿用 tab.board
   * （编辑触发的自动刷新）；显式传入表示页签内 board 跳转。
   * preserveZoom = 该页签已有画面且 board 未变——即 Recompile 场景，
   * webview 保留缩放/平移；board 变了视为新图，重新 fit。
   **/
  compile(tab: PopoutTab, target?: string): void {
    const boardBefore = tab.board;
    if (target !== undefined) {
      tab.board = target;
    }
    const board = tab.board;
    const preserveZoom = tab.lastSvg.length > 0 && boardBefore === board;

    const text = tab.doc.getText();
    if (!text) {
      // 空文档：不动缓存也不发消息，避免冲掉页签已有画面
      return;
    }
    // 每次编译前重新解析场景列表（源码可能刚增删场景），失败最多少显示几个
    tab.scenarioList = parseTopLevelBoards(text, "scenarios");

    tab.busy = true;
    if (this.activeTab === tab) {
      this.postMessage({ command: "showBusy" });
    }

    taskRunner.genTask(
      tab.doc.fileName,
      text,
      (data, error) => {
        tab.busy = false;
        if (!this.panel) {
          // 面板在编译期间被关掉：缓存仍更新，画面待下次打开时重建
          return;
        }
        if (data.length > 0) {
          tab.lastSvg = data;
          tab.toastVisible = false;
          if (this.activeTab === tab) {
            this.postMessage({
              command: "render",
              data: data,
              preserveZoom: preserveZoom,
              board: board,
              scenarios: tab.scenarioList,
              tabId: tab.id,
            });
            this.postMessage({ command: "hideToast" });
            this.postMessage({ command: "hideBusy" });
          }
        } else if (error.length > 0) {
          tab.toastMsg = "Errors";
          tab.toastList = error
            .split("\n")
            .map((s) => `<li>${s}</li>`)
            .join("");
          tab.toastVisible = true;
          if (this.activeTab === tab) {
            this.pushToast(tab);
            this.postMessage({ command: "hideBusy" });
          }
        }
      },
      board,
    );
  }

  private createPanel(): void {
    this.panel = window.createWebviewPanel(
      "d2PreviewPopout",
      "Preview",
      ViewColumn.Beside,
      {
        enableFindWidget: true,
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [Uri.file(path.join(extContext.extensionPath, "pages"))],
      },
    );
    const onDiskPath = path.join(extContext.extensionPath, "pages/previewPage.html");
    // 预览页用同一个 HTML；浮窗模式靠占位符注入，随面板创建固化，
    // 上下文重置（分离到新窗口）后依然生效。用正则容忍占位符后的
    // 空白差异（重排版工具会在 */ 和 false 之间插空格，字符串 replace 失配
    // 会导致 popoutMode 置不上、页签条整个不出现）
    this.panel.webview.html = readFileSync(onDiskPath, "utf-8").replace(
      /\/\*__POPOUT__\*\/\s*false/,
      "/*__POPOUT__*/true",
    );

    this.panel.onDidDispose(() => {
      // 浮窗关闭即清空（不记页签集合，见 ADR 0001）
      this.tabs.forEach((tab) => tab.timer.stop());
      this.tabs.clear();
      this.order = [];
      this.activeTab = undefined;
      this.panel = undefined;
      // 下次重新创建面板时需要再次移入新窗口
      this.detached = false;
    });

    // 上下文重置恢复：分离到新窗口 / 隐藏再显示后，webview JS 状态清零，
    // 重发页签条与激活页签的全部画面状态
    this.panel.onDidChangeViewState((e) => {
      if (e.webviewPanel === this.panel && e.webviewPanel.visible && this.activeTab) {
        this.pushView(this.activeTab);
      }
    });

    this.panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case "activateTab": {
          const tab = this.order.find((t) => t.id === message.id);
          if (tab) {
            this.activeTab = tab;
            this.pushView(tab);
          }
          break;
        }
        case "closeTab": {
          const tab = this.order.find((t) => t.id === message.id);
          if (tab) {
            this.closeTabObject(tab);
          }
          break;
        }
        case "refreshPage": {
          if (this.activeTab) {
            this.compile(this.activeTab);
          }
          break;
        }
        case "selectBoard": {
          // 面包屑切换 board，语义同主窗口预览；历史栈已删除，回退靠面包屑上一段
          const tab = this.activeTab;
          const target = (message.board ?? "").trim();
          if (tab && target !== tab.board) {
            this.compile(tab, target);
          }
          break;
        }
        case "clickOnTag_A": {
          const tab = this.activeTab;
          if (!tab) {
            break;
          }
          const link = message.link.trim();
          // root.* 是 d2 给 .link: layers.xxx 生成的 board 路由路径，
          // 用对应的 --target 重新编译实现预览内跳转（必须保留原始大小写）
          if (link === "root" || link.startsWith("root.")) {
            const boardPath = link === "root" ? "" : link.slice("root.".length);
            if (boardPath !== tab.board) {
              this.compile(tab, boardPath);
            }
            break;
          }
          const baseDir = path.parse(tab.doc.fileName).dir;
          util.openPreviewLink(link, baseDir);
          break;
        }
      }
    });
  }

  /** 关闭一个页签：最后一个页签关闭时整个浮窗面板随之销毁 */
  private closeTabObject(tab: PopoutTab): void {
    tab.timer.stop();
    this.tabs.delete(tab.doc);
    const idx = this.order.indexOf(tab);
    if (idx >= 0) {
      this.order.splice(idx, 1);
    }
    if (this.order.length === 0) {
      this.panel?.dispose();
      return;
    }
    if (this.activeTab === tab) {
      // 优先接住同位置的下一个，没有则取最后一个
      this.activeTab = this.order[Math.min(idx, this.order.length - 1)];
      this.pushView(this.activeTab);
    } else {
      this.pushTabs();
    }
  }

  /** 把激活页签的全部画面状态推给 webview（初次打开 / 切换页签 / 上下文重置恢复共用） */
  private pushView(tab: PopoutTab): void {
    if (!this.panel) {
      return;
    }
    this.panel.title = `${path.parse(tab.doc.fileName).base} - Preview`;
    this.pushTabs();
    this.postMessage({
      command: "render",
      data: tab.lastSvg,
      // 切换页签恢复缓存：board 未变，保留（webview 端已恢复的）缩放/平移
      preserveZoom: true,
      board: tab.board,
      scenarios: tab.scenarioList,
      tabId: tab.id,
    });
    this.pushToast(tab);
    this.postMessage({ command: tab.busy ? "showBusy" : "hideBusy" });
  }

  private pushToast(tab: PopoutTab): void {
    if (!this.panel) {
      return;
    }
    if (tab.toastVisible) {
      this.postMessage({ command: "setToastMsg", data: tab.toastMsg });
      this.postMessage({ command: "setToastList", data: tab.toastList });
      this.postMessage({ command: "showToast" });
    } else {
      this.postMessage({ command: "hideToast" });
    }
  }

  private pushTabs(): void {
    if (!this.panel) {
      return;
    }
    this.postMessage({
      command: "setTabs",
      tabs: this.order.map((t) => ({
        id: t.id,
        // 页签上不显示 .d2 后缀（同类文件都用 d2，上下文无歧义，省空间）；
        // 其他后缀（如 .svg）保留，仍能区分
        label: path.parse(t.doc.fileName).base.replace(/\.d2$/i, ""),
        active: t === this.activeTab,
      })),
    });
  }

  private postMessage(message: unknown): void {
    this.panel?.webview.postMessage(message);
  }
}

// 单例，由 extension.ts 注册命令与事件
export const popoutPreview: PopoutPreviewManager = new PopoutPreviewManager();
