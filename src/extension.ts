/**
 * d2 File Viewer Extension
 **/

import {
  commands,
  ExtensionContext,
  languages,
  TextDocument,
  TextDocumentChangeEvent,
  TextDocumentSaveReason,
  TextDocumentWillSaveEvent,
  TextEdit,
  Uri,
  window,
  workspace,
  WorkspaceConfiguration,
} from "vscode";

import { DocToPreviewGenerator } from "./docToPreviewGenerator";
import { D2OutputChannel } from "./outputChannel";
import { processSvg } from "./svgProcessor";
import * as mdItContainer from "markdown-it-container";
import { layoutPicker } from "./layoutPicker";
import { themePicker } from "./themePicker";
import { TaskRunner } from "./taskRunner";
import { d2Tasks } from "./tasks";
import { util } from "./utility";
import * as path from "path";
import { TextEncoder } from "util";

export const d2Ext = "d2";
export const d2Lang = "d2";
export const previewGenerator: DocToPreviewGenerator = new DocToPreviewGenerator();
export const d2ConfigSection = "D2";
export const d2TaskName = "D2 Task";
export let ws: WorkspaceConfiguration = workspace.getConfiguration(d2ConfigSection);
export const outputChannel: D2OutputChannel = new D2OutputChannel();
export const taskRunner: TaskRunner = new TaskRunner();
export let extContext: ExtensionContext;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VSCAny = any;

export function activate(context: ExtensionContext): VSCAny {
  extContext = context;

  context.subscriptions.push(
    workspace.onDidChangeConfiguration(() => {
      const wsOld = ws;
      ws = workspace.getConfiguration(d2ConfigSection);

      if (
        ws.get("previewLayout") !== wsOld.get("previewLayout") ||
        ws.get("previewTheme") !== wsOld.get("previewTheme") ||
        ws.get("previewSketch") !== wsOld.get("previewSketch")
      ) {
        const activeEditor = window.activeTextEditor;
        if (activeEditor?.document.languageId === d2Ext) {
          previewGenerator.generate(activeEditor.document);
        }
      }
    })
  );

  context.subscriptions.push(
    workspace.onDidChangeTextDocument((e: TextDocumentChangeEvent) => {
      if (e.document.languageId === d2Ext && e.contentChanges.length > 0) {
        const autoUp = ws.get("autoUpdate", false);

        if (autoUp) {
          const trk = previewGenerator.getTrackObject(e.document);
          trk?.timer?.reset();
        }
      }
    })
  );

  // User actually forced a save, NOT auto save
  let hardSave = false;

  context.subscriptions.push(
    workspace.onWillSaveTextDocument((e: TextDocumentWillSaveEvent) => {
      if (e.document.languageId === d2Ext) {
        hardSave = e.reason === TextDocumentSaveReason.Manual;
      }
    })
  );

  context.subscriptions.push(
    workspace.onDidSaveTextDocument((doc: TextDocument) => {
      if (doc.languageId === d2Ext) {
        const updateOnSave = ws.get("updateOnSave", false);

        const trk = previewGenerator.getTrackObject(doc);

        // If we don't have preview window open, then no need to update it
        if (updateOnSave && hardSave && trk?.outputDoc) {
          previewGenerator.generate(doc);
        }

        hardSave = false;
      }
    })
  );

  context.subscriptions.push(
    workspace.onDidOpenTextDocument((doc: TextDocument) => {
      if (doc.languageId === d2Ext) {
        previewGenerator.createObjectToTrack(doc);
      }
    })
  );

  context.subscriptions.push(
    workspace.onDidCloseTextDocument((doc: TextDocument) => {
      if (doc.languageId === d2Ext) {
        previewGenerator.deleteObjectToTrack(doc);
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("D2.ShowPreviewWindow", () => {
      const activeEditor = window.activeTextEditor;

      if (activeEditor?.document.languageId === d2Ext) {
        previewGenerator.generate(activeEditor.document);

        const trk = previewGenerator.getTrackObject(activeEditor.document);
        trk?.outputDoc?.show();
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("D2.CompileToSvg", (fileInfo) => {
      let filePath = fileInfo?.fsPath;

      if (filePath === undefined) {
        const activeEditor = window.activeTextEditor;
        filePath = activeEditor?.document.uri.fsPath;
        if (filePath === undefined) {
          return;
        }
      }

      workspace.openTextDocument(filePath).then((doc) => {
        taskRunner.genTask(filePath, doc.getText(), (svgText) => {
          if (svgText.length === 0) {
            outputChannel.appendError(`Unable to convert ${filePath}`);
            return;
          }

          // 修改：导出走与预览相同的 processSvg，保证"看到什么就导出什么"。
          // 用户配置 D2.watermark 后，导出的 .svg 也会带水印；留空则原样输出。
          // D2.watermarkRemoveClasses 用于剥离 SVG 原本自带的外部水印。
          const wm = ws.get<string>("watermark", "");
          const rmClasses = ws.get<string[]>("watermarkRemoveClasses", []);
          const processed = processSvg(svgText, wm, rmClasses);

          const svgFilename = filePath.substr(0, filePath.lastIndexOf(".")) + ".svg";
          const encoder = new TextEncoder();
          const encodedText = encoder.encode(processed);

          workspace.fs.writeFile(Uri.file(svgFilename), encodedText).then(() => {
            outputChannel.appendInfo(`File ${filePath} converted to ${svgFilename}`);
          });
        });
      });
    })
  );

  // 导出为 PNG / PDF / PPTX / GIF 等二进制格式（d2 CLI 原生支持 --stdout-format）。
  // 每种格式注册为独立的顶层命令，直接出现在命令面板和右键菜单第一层，
  // 不再经由 QuickPick 二级选择。四种格式共用同一套编译+落盘逻辑。
  const compileToImage = (format: string, fileInfo: VSCAny) => {
    let filePath = fileInfo?.fsPath;

    if (filePath === undefined) {
      const activeEditor = window.activeTextEditor;
      filePath = activeEditor?.document.uri.fsPath;
      if (filePath === undefined) {
        return;
      }
    }

    workspace.openTextDocument(filePath).then((doc) => {
      const data = d2Tasks.compileBinary(
        doc.getText(),
        path.dirname(filePath),
        format
      );
      if (!data || data.length === 0) {
        outputChannel.appendError(`Unable to convert ${filePath} to ${format}`);
        return;
      }

      const outFile = filePath.substr(0, filePath.lastIndexOf(".")) + "." + format;
      workspace.fs.writeFile(Uri.file(outFile), data).then(() => {
        outputChannel.appendInfo(`File ${filePath} converted to ${outFile}`);
      });
    });
  };

  const imageFormats: [string, string][] = [
    ["D2.CompileToPng", "png"],
    ["D2.CompileToPdf", "pdf"],
    ["D2.CompileToPptx", "pptx"],
    ["D2.CompileToGif", "gif"],
  ];
  for (const [commandId, format] of imageFormats) {
    context.subscriptions.push(
      commands.registerCommand(commandId, (fileInfo) =>
        compileToImage(format, fileInfo)
      )
    );
  }

  languages.registerDocumentFormattingEditProvider(
    { language: d2Lang, scheme: "file" },
    {
      provideDocumentFormattingEdits(document: TextDocument): TextEdit[] {
        const documentEditor = window.visibleTextEditors.find(
          (editor) => editor.document === document
        );

        if (documentEditor) {
          d2Tasks.format(documentEditor);
        }

        return [];
      },
    }
  );

  context.subscriptions.push(
    commands.registerCommand("D2.PickLayout", () => {
      const activeEditor = window.activeTextEditor;

      if (activeEditor?.document.languageId === d2Ext) {
        const layoutPick = new layoutPicker();
        layoutPick.showPicker().then((layout) => {
          if (layout) {
            ws.update("previewLayout", layout.label, true);
          }
        });
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("D2.PickTheme", () => {
      const activeEditor = window.activeTextEditor;

      if (activeEditor?.document.languageId === d2Ext) {
        const themePick = new themePicker();
        themePick.showPicker().then((theme) => {
          if (theme) {
            ws.update("previewTheme", theme.label, true);
          }
        });
      }
    })
  );

  context.subscriptions.push(
    commands.registerCommand("D2.ToggleSketch", () => {
      const activeEditor = window.activeTextEditor;

      if (activeEditor?.document.languageId === d2Ext) {
        const current: boolean = ws.get("previewSketch", false);
        ws.update("previewSketch", !current, true);
      }
    })
  );

  /** Find all open d2 files and add to tracker if they are
   *  open before the extension loads
   */
  workspace.textDocuments.forEach((td: TextDocument) => {
    if (td.languageId === d2Ext) {
      previewGenerator.createObjectToTrack(td);
    }
  });

  /**
   * Check that D2 is available up front
   */
  const checkForD2 = ws.get("checkForInstallAtStart");
  if (checkForD2) {
    util.checkForD2Install();
  }

  // Return our markdown renderer
  return {
    // Sets up our ability to render for markdown files
    extendMarkdownIt(md: VSCAny) {
      extendMarkdownItWithD2(md);
      return md;
    },
  };
}

const pluginKeyword = "d2";

/**
 *
 * This function will be asked by the Markdown system to render
 * a d2 snippit in a markdown file
 */
export function extendMarkdownItWithD2(md: VSCAny): unknown {
  md.use(mdItContainer, pluginKeyword, {});

  const highlight = md.options.highlight;
  md.options.highlight = (code: string, lang: string) => {
    if (lang === d2Lang) {
      const activeEditor = path.parse(
        window.activeTextEditor?.document.fileName ?? ""
      ).dir;

      return d2Tasks.compile(code, activeEditor, (msg) => {
        outputChannel.appendInfo(msg);
      });
    }
    return highlight(code, lang);
  };

  return md;
}
