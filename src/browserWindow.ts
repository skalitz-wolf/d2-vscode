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

  constructor(trkObj: D2P) {
    this.trackerObject = trkObj;
    // 修改：初始化为空串，避免 lastSvg 为 undefined
    this.lastSvg = "";

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
        this.webView.postMessage({ command: "render", data: this.lastSvg });
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
            const f = message.link.trim().toLowerCase();
            const isWeb: boolean = f.startsWith("http://") || f.startsWith("https://");
            const ir = isRelative(f);

            // if it's a website, we can let the default handler deal with it
            // by falling out of this function.
            if (isWeb) {
              return;
            }

            // We have a file, or something that looks like a file, try to open it,
            // let vscode decide if it's possible.
            const filepath = ir ? path.join(filePath, f) : f;

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
  // preserveZoom=false 表示初次预览，正常走 fit 流程
  setSvg(svg: string, preserveZoom: boolean = false): void {
    this.lastSvg = svg;
    this.webView.postMessage({ command: "render", data: svg, preserveZoom: preserveZoom });
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
