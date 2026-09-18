import { existsSync, readFileSync } from "fs";
import * as path from "path";
import { Uri, ViewColumn, Webview, WebviewPanel, window, workspace } from "vscode";
import { D2P } from "./docToPreviewGenerator";
import { extContext, previewGenerator } from "./extension";
import { util } from "./utility";

/**
 * BrowserWindow - Wraps the browser window and
 *  adds functionality to update the HTML/SVG
 **/
export class BrowserWindow {
  webViewPanel: WebviewPanel;
  webView: Webview;
  trackerObject?: D2P;

  // 修改：缓存最近一次渲染的 SVG，用于 webview 上下文重置后
  // （例如面板被 Move to New Window、隐藏后再次显示）能重新推送恢复画面
  lastSvg: string;
  // 最近渲染的 board 路径（空串 = 主板），与 lastSvg 配合用于上下文重置后恢复返回按钮状态
  lastBoard: string;
  // 最近一次的历史栈顶（null = 无历史），用于上下文重置后恢复按钮提示
  lastBackBoard: string | null;
  // 最近一次的场景名列表，用于上下文重置后恢复左上角场景栏
  lastScenarios: string[];

  constructor(trkObj: D2P) {
    this.trackerObject = trkObj;
    // 修改：初始化为空串，避免 lastSvg 为 undefined
    this.lastSvg = "";
    this.lastBoard = "";
    this.lastBackBoard = null;
    this.lastScenarios = [];

    let fileName = "";
    let filePath = "";
    if (trkObj.inputDoc?.fileName) {
      const p = path.parse(trkObj.inputDoc.fileName);

      fileName = p.base;
      filePath = p.dir;
    }

    this.webViewPanel = window.createWebviewPanel(
      "d2Preview",
      `${fileName} - Preview`,
      ViewColumn.Beside,
      {
        enableFindWidget: true,
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [Uri.file(path.join(extContext.extensionPath, "pages"))],
      }
    );
    this.webView = this.webViewPanel.webview;

    const onDiskPath = path.join(extContext.extensionPath, "pages/previewPage.html");
    const data: string = readFileSync(onDiskPath, "utf-8");

    this.webViewPanel.webview.html = data.toString();

    this.webViewPanel.onDidDispose(() => {
      if (this.trackerObject) {
        this.trackerObject.outputDoc = undefined;
      }
    });

    // 修改：监听 panel 可见性变化。
    // 当 panel 重新变为 visible（典型场景是 Move to New Window 后，
    // webview 的 JS 上下文会被重置、HTML 回到初始 Loading... 状态），
    // 重发最近一次 SVG 并显式清掉 toast / busy，让画面恢复显示
    this.webViewPanel.onDidChangeViewState((e) => {
      // When the panel becomes visible again (including after being
      // moved to a new VSCode window), the webview's JavaScript
      // context may have been reset, so re-send the last rendered
      // SVG and clear stale toast/busy state.
      if (e.webviewPanel.visible && this.lastSvg.length > 0) {
        // 上下文重置后 webview 的缩放状态已丢失，不传 preserveZoom，走 fit 恢复
        this.webView.postMessage({
          command: "render",
          data: this.lastSvg,
          board: this.lastBoard,
          backBoard: this.lastBackBoard,
          scenarios: this.lastScenarios,
        });
        this.webView.postMessage({ command: "hideToast" });
        this.webView.postMessage({ command: "hideBusy" });
      }
    });

    const isRelative = (p: string) => !/^([a-z]+:)?[\\/]/i.test(p);

    this.webViewPanel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case "refreshPage":
            previewGenerator.generateAll();
            break;
          case "clickOnTag_A": {
            // 注意：这里必须用原始 link（不能 toLowerCase），board 路径是大小写
            // 敏感的（如 "root.layers.Sggate 内部"），转小写会找不到目标层
            const link = message.link.trim();

            // board 跳转链接：单板渲染（--target=）时，d2 给 .link: layers.xxx
            // 节点生成 root.* 形式的路由路径（本应交给 d2 --watch 的服务端解析）。
            // 这里识别出来，用对应的 --target 重新编译预览即可实现预览内跳转。
            // 跳转前把当前 board 压入历史栈，供"返回"按钮逐层后退
            if (link === "root" || link.startsWith("root.")) {
              const boardPath = link === "root" ? "" : link.slice("root.".length);
              const trk = this.trackerObject;
              if (trk?.inputDoc && boardPath !== trk.currentTarget) {
                trk.boardHistory.push(trk.currentTarget);
                previewGenerator.generate(trk.inputDoc, true, boardPath);
              }
              return;
            }

            const f = link.toLowerCase();
            const isWeb: boolean = f.startsWith("http://") || f.startsWith("https://");
            const ir = isRelative(f);

            // if it's a website, we can let the default handler deal with it
            // by falling out of this function.
            if (isWeb) {
              return;
            }

            // We have a file, or something that looks like a file, try to open it,
            // let vscode decide if it's possible.
            const filepath = ir ? path.join(filePath, link) : link;

            workspace.openTextDocument(filepath).then(
              (document) => {
                // we opened the document, now show it.
                window.showTextDocument(document);
              },
              () => {
                if (!existsSync(filepath)) {
                  window.showErrorMessage(`File does not exist: ${filepath}`);
                } else {
                  util.openWithDefaultApp(filepath);
                }
              }
            );
            break;
          }
          case "navigateBack": {
            // 浏览器式后退：弹出历史栈顶作为跳转目标。
            // 后退跳转不压栈（压栈只在角标跳转处做），保证每退一次少一层
            const trk = this.trackerObject;
            if (trk?.inputDoc && trk.boardHistory.length > 0) {
              previewGenerator.generate(trk.inputDoc, true, trk.boardHistory.pop()!);
            }
            break;
          }
          case "selectBoard": {
            // 左上角场景栏点击切换 board。与角标跳转同一机制：显式跳转前
            // 压历史栈（之后可用"返回"按钮逐层后退）；点击当前所在 board 忽略。
            // message.board 是完整 board 路径："" = 主板（"基础"），
            // "scenarios.X" = 场景 X
            const trk = this.trackerObject;
            const target = (message.board ?? "").trim();
            if (trk?.inputDoc && target !== trk.currentTarget) {
              trk.boardHistory.push(trk.currentTarget);
              previewGenerator.generate(trk.inputDoc, true, target);
            }
            break;
          }
        }
      },
      this,
      extContext.subscriptions
    );
  }

  show() {
    this.webViewPanel.reveal();
  }

  // 修改：setSvg 增加 preserveZoom 参数。
  // preserveZoom=true 表示本次是 Recompile（用户已经打开了预览，只是重新生成 SVG），
  // webview 端应保留用户的缩放比例和 pan 位置，仅替换 SVG 内容。
  // preserveZoom=false 表示初次预览，正常走 fit 流程。
  // board 是当前渲染的 board 路径（空串 = 主板），webview 据此显示/隐藏"返回"按钮；
  // backBoard 是历史栈顶（再点一次"返回"将去到的 board），null 表示无历史可退
  setSvg(svg: string, preserveZoom: boolean = false, board: string = ""): void {
    this.lastSvg = svg;
    this.lastBoard = board;
    this.lastBackBoard = this.backBoard();
    this.lastScenarios = this.trackerObject?.scenarioList ?? [];
    this.webView.postMessage({
      command: "render",
      data: svg,
      preserveZoom: preserveZoom,
      board: board,
      backBoard: this.lastBackBoard,
      scenarios: this.lastScenarios,
    });
  }

  // 历史栈顶的 board（无历史返回 null），随 render 消息发给 webview 做按钮提示
  private backBoard(): string | null {
    const hist = this.trackerObject?.boardHistory;
    return hist && hist.length > 0 ? hist[hist.length - 1] : null;
  }

  resetZoom(): void {
    this.webView.postMessage({ command: "resetZoom" });
  }

  showBusy(): void {
    this.webView.postMessage({ command: "showBusy" });
  }

  hideBusy(): void {
    this.webView.postMessage({ command: "hideBusy" });
  }

  showToast(): void {
    this.webView.postMessage({ command: "showToast" });
  }

  hideToast(): void {
    this.webView.postMessage({ command: "hideToast" });
  }

  setToastMsg(msg: string): void {
    this.webView.postMessage({ command: "setToastMsg", data: msg });
  }

  setToastList(list: string): void {
    this.webView.postMessage({ command: "setToastList", data: list });
  }

  dispose(): void {
    this.webViewPanel.dispose();
  }
}
