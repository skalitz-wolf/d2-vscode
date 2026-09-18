import * as path from "path";
import { TaskEndEvent, tasks, TextDocument } from "vscode";
import { parseTopLevelBoards } from "./boardParser";
import { BrowserWindow } from "./browserWindow";
import { d2TaskName, outputChannel, taskRunner } from "./extension";
import { RefreshTimer } from "./refreshTimer";
import { statSync } from "fs";
import { Mutex } from "async-mutex";

/**
 *  D2P - Document to Preview.  This tracks the connection
 *  between the D2 document and to the preview window.
 *
 **/
export class D2P {
  inputDoc?: TextDocument;
  outputDoc?: BrowserWindow;
  timer?: RefreshTimer;
  fileDateTime: number = 0;
  // 当前预览的 board 路径（"" = 主板）。
  // 编辑触发的自动刷新沿用此值，不会因改图跳回主板；图层跳转时更新
  currentTarget: string = "";
  // board 跳转历史栈（浏览器式后退）：跳转前把当时的 board 压栈，
  // "返回"按钮弹栈；新开预览窗口时清空。压栈只在 webview 的角标跳转
  // 处做（browserWindow.ts），返回跳转本身不压栈，否则永远退不完
  boardHistory: string[] = [];
  // 顶层场景名列表（boardParser 解析源码所得），随 render 消息发给
  // webview 渲染左上角场景切换栏。场景是整图的变体、不属于任何节点，
  // 不走节点 .link 角标（与图层不同）；无场景时为空数组，场景栏隐藏
  scenarioList: string[] = [];
}

/**
 * DocToPreviewGenerator - Keeper of the map of D2P objects
 *  that allow for associating a document to it's preview
 *  information.
 *
 * This object is/must be a Singleton.
 **/
export class DocToPreviewGenerator {
  mutex: Mutex = new Mutex();
  mapOfConnection: Map<TextDocument, D2P> = new Map<TextDocument, D2P>();

  constructor() {
    // Since this object is a singleton, we don't need to dispose
    // this event each time the object is disposed.
    tasks.onDidEndTask((e: TaskEndEvent) => {
      if (e.execution.task.name === d2TaskName) {
        this.mutex.release();
      }
    });
  }

  createObjectToTrack(inDoc: TextDocument): D2P {
    const trk = new D2P();

    trk.inputDoc = inDoc;

    this.mapOfConnection.set(inDoc, trk);

    trk.timer = new RefreshTimer(() => {
      // If there is a document to update, update it.
      if (trk.outputDoc) {
        this.generate(inDoc);
      }
    });

    trk.timer?.start(false);

    return trk;
  }

  deleteObjectToTrack(inDoc: TextDocument): void {
    this.mapOfConnection.delete(inDoc);
  }

  getTrackObject(inDoc: TextDocument): D2P | undefined {
    return this.mapOfConnection.get(inDoc);
  }

  /**
   * Get the last modified time of each document we are
   * tracking.
   **/
  private getFileTimes(): void {
    this.mapOfConnection.forEach((trk: D2P, td: TextDocument) => {
      trk.fileDateTime = statSync(td.uri.fsPath).mtimeMs;
    });
  }

  generateAll(): void {
    this.getFileTimes();

    // Sort the files oldest to newest.  This should catch most
    // order of dependency problems witout resorting to dependency
    // analysis.
    const fileMap = new Map(
      [...this.mapOfConnection.entries()].sort(
        (a: [TextDocument, D2P], b: [TextDocument, D2P]): number => {
          return b[1].fileDateTime - a[1].fileDateTime;
        }
      )
    );

    // Regenerate the browser view for all open d2 documents, since
    // there are dependencies among all the documents, we have to
    // regenerate them one at a time.
    fileMap.forEach((_: D2P, td: TextDocument) => {
      this.mutex.acquire().then(() => {
        this.generate(td, false);
      });
    });
  }

  generate(inDoc: TextDocument, openPreview: boolean = true, target?: string): void {
    const trkObj = this.getTrackObject(inDoc);
    // 可以跟踪到我们文件
    if (!trkObj) {
      return;
    }
    // No input document? How did we get here?
    if (!trkObj.inputDoc) {
      return;
    }
    // target === undefined 表示本次不改变 board（编辑触发的自动刷新），
    // 沿用 currentTarget；图层跳转显式传入（含 "" 表示回主板）。
    // 新开预览窗口时（无 outputDoc 且要开预览）重置回主板：currentTarget 是
    // 文档级状态，关预览不清除，不重置的话重开预览会停留在上次跳转的图层；
    // 预览内跳转时 outputDoc 已存在，不走这个分支，currentTarget 不受影响
    let boardChanged = false;
    if (target === undefined && !trkObj.outputDoc && openPreview) {
      boardChanged = trkObj.currentTarget !== "";
      trkObj.currentTarget = "";
      trkObj.boardHistory = [];
    }
    if (target !== undefined && target !== trkObj.currentTarget) {
      trkObj.currentTarget = target;
      boardChanged = true;
    }
    const board = trkObj.currentTarget;

    const fileText = trkObj.inputDoc.getText();
    if (!fileText) {
      // Empty document, do nothing
      return;
    }
    // 每次编译前重新解析场景列表（源码可能刚增删场景）。
    // 解析器容错：格式异常只影响个别键，失败最多少显示几个场景
    trkObj.scenarioList = parseTopLevelBoards(fileText, "scenarios");
    // 修改：在创建 webview 之前计算 preserveZoom。
    // 若当前 trkObj.outputDoc 已存在，说明用户已经打开过预览，本次是 Recompile，
    // 应保留用户的缩放比例和 pan 位置；否则是初次预览，走 fit 流程。
    // 图层跳转（boardChanged）视为新图，重新 fit 而不是沿用旧图的缩放位置
    const preserveZoom = !!trkObj.outputDoc && !boardChanged;
    // If we don't have a preview window already, create one
    if (!trkObj.outputDoc && openPreview) {
      trkObj.outputDoc = new BrowserWindow(trkObj);
      trkObj.outputDoc.show();
      trkObj.outputDoc.showToast();
      trkObj.outputDoc.setToastMsg("Loading...");
    }

    trkObj.outputDoc?.showBusy();

    // board 作为第 4 参传给 genTask → compile 的 --target，
    // 决定本次渲染主板还是 layers/scenarios 的某个子 board
    taskRunner.genTask(trkObj.inputDoc?.fileName, fileText, (data, error) => {
      const p = path.parse(trkObj.inputDoc?.fileName || "");

      if (data.length > 0) {
        // 修改：把 preserveZoom 透传给 setSvg，让 webview 决定是 fit 还是保留当前位置；
        // board 一并传给 webview，用于显示"返回主板"按钮
        trkObj.outputDoc?.setSvg(data, preserveZoom, board);
        outputChannel.appendInfo(`Preview for ${p.base} updated.`);
        trkObj.outputDoc?.hideToast();
      } else if (error.length > 0) {
        outputChannel.appendInfo(`Preview for ${p.base} has errors.`);
        const arr: string[] = error.split("\n");

        let list = "";
        arr.forEach((s) => {
          list += `<li>${s}</li>`;
        });

        trkObj.outputDoc?.setToastMsg("Errors");
        trkObj.outputDoc?.setToastList(list);
        trkObj.outputDoc?.showToast();
      }

      trkObj.outputDoc?.hideBusy();
    }, board);
  }
}
