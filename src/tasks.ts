import { spawnSync } from "child_process";
import * as path from "path";
import { Range, TextEditor } from "vscode";
import { outputChannel, ws } from "./extension";
import { TaskOutput } from "./taskRunner";
import { NameToThemeNumber } from "./themePicker";
import { util, VT } from "./utility";

/**
 * D2Tasks - static functions to be used in tasks.  Functions need
 * to be synchronous, and return their results in a callback.
 */
class D2Tasks {
  public compile(
    text: string,
    filePath?: string,
    log?: TaskOutput,
    terminal?: TaskOutput
  ): string {
    const layout: string = ws.get("previewLayout", "dagre");
    const theme: string = ws.get("previewTheme", "default");
    const sketch: boolean = ws.get("previewSketch", false);
    const themeNumber: number = NameToThemeNumber(theme);
    const d2Path: string = ws.get("execPath", "d2");

    // 修改：如果 .d2 文件里用 vars.d2-config 显式声明了 theme-id / layout-engine，
    // 则不再传对应的命令行参数，让文件配置优先（命令行参数会覆盖文件内声明）。
    // 日志第一行打印"实际生效值"，避免显示设置值造成误导。
    const fileLayoutMatch = text.match(/layout-engine\s*:\s*([A-Za-z0-9_-]+)/);
    const fileThemeMatch = text.match(/theme-id\s*:\s*(\d+)/);
    const fileLayout = fileLayoutMatch ? fileLayoutMatch[1] : undefined;
    const fileTheme = fileThemeMatch ? fileThemeMatch[1] : undefined;
    const hasFileLayout = !!fileLayout;
    const hasFileTheme = !!fileTheme;
    const effectiveLayout = hasFileLayout ? fileLayout : layout;
    const effectiveTheme = hasFileTheme ? `file(${fileTheme})` : theme;

    terminal?.(`${VT.Green}Starting Compile...${VT.Reset}`);
    terminal?.(
      `Layout: ${VT.Yellow}${effectiveLayout}${VT.Reset}` +
        `${hasFileLayout ? ` (from file, overrides setting "${layout}")` : ""}` +
        `  Theme: ${VT.Yellow}${effectiveTheme}${VT.Reset}` +
        `${hasFileTheme ? ` (from file, overrides setting "${theme}")` : ""}` +
        `  Sketch: ${VT.Yellow}${sketch}${VT.Reset}`
    );
    terminal?.(`Current Working Directory: ${VT.Yellow}${filePath}${VT.Reset}`);
    terminal?.("");

    const args: string[] = [
      ...(hasFileLayout ? [] : [`--layout=${layout}`]),
      ...(hasFileTheme ? [] : [`--theme=${themeNumber}`]),
      `--sketch=${sketch}`,
      "-",
    ];

    // spawnSync doesn't like blank working directories
    if (filePath === "") {
      filePath = undefined;
    }

    const proc = spawnSync(d2Path, args, {
      cwd: filePath,
      input: text,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024 * 24,
    });

    /** proc.status: 0 - success
     *  proc.status: 1 - errors
     *  proc.pid: 0 - EXE Not Found
     */
    if (proc.pid === 0) {
      util.showErrorToolsNotFound(proc.error?.message ?? "");
    } else {
      let error: string = proc.stderr?.toString() ?? "";
      // Get rid of superfluous info that means nothing to vscode users
      error = error.replace(" - to -", "");

      for (const msg of error.split("\n")) {
        if (msg.length === 0) {
          // Sometimes there is a blank line that we
          // don't have to worry about
          continue;
        }

        terminal?.(msg, true);
      }

      const spawnErr = proc.error?.message;
      if (spawnErr) {
        terminal?.(spawnErr, true);
      }
    }

    terminal?.("");

    let data = "";
    // Success! Read the output
    if (proc.status === 0) {
      data = proc.stdout.toString();
    }

    return data;
  }

  /**
   * 编译为二进制格式（PNG / PDF / PPTX / GIF）。
   *
   * 与 compile() 的区别：PNG 等格式是二进制数据，不能走 utf-8 文本通道。
   * 这里用 encoding: null 让 spawnSync 返回 Buffer，并通过 --stdout-format 指定格式。
   * 同样遵守"文件声明的 theme-id / layout-engine 优先"的规则。
   *
   * @param text d2 源码
   * @param cwd 工作目录（决定相对 import 的解析路径）
   * @param format 目标格式：png / pdf / pptx / gif
   * @returns 编译成功的二进制 Buffer；失败返回 null
   */
  public compileBinary(text: string, cwd: string | undefined, format: string): Buffer | null {
    const layout: string = ws.get("previewLayout", "dagre");
    const theme: string = ws.get("previewTheme", "default");
    const sketch: boolean = ws.get("previewSketch", false);
    const themeNumber: number = NameToThemeNumber(theme);
    const d2Path: string = ws.get("execPath", "d2");

    const hasFileTheme = /theme-id\s*:/.test(text);
    const hasFileLayout = /layout-engine\s*:/.test(text);

    const args: string[] = [
      ...(hasFileLayout ? [] : [`--layout=${layout}`]),
      ...(hasFileTheme ? [] : [`--theme=${themeNumber}`]),
      `--sketch=${sketch}`,
      `--stdout-format=${format}`,
      "-",
    ];

    // spawnSync doesn't like blank working directories
    if (cwd === "") {
      cwd = undefined;
    }

    const proc = spawnSync(d2Path, args, {
      cwd: cwd,
      input: text,
      encoding: null,
      maxBuffer: 1024 * 1024 * 64,
    });

    /** proc.status: 0 - success
     *  proc.status: 1 - errors
     *  proc.pid: 0 - EXE Not Found
     */
    if (proc.pid === 0) {
      util.showErrorToolsNotFound(proc.error?.message ?? "");
      return null;
    }

    if (proc.status !== 0) {
      outputChannel.appendError(proc.stderr?.toString() ?? `Failed to convert to ${format}`);
      return null;
    }

    return proc.stdout as Buffer;
  }

  format(textEditor: TextEditor): void {
    const fileText = textEditor.document.getText();

    const d2Path: string = ws.get("execPath", "d2");
    const proc = spawnSync(d2Path, ["fmt", "-"], { input: fileText });

    let errorString = "";
    if (proc.status !== 0) {
      errorString = proc.stderr.toString();
      outputChannel.appendError(errorString);
      return;
    }

    const data: string = proc.stdout.toString();

    const p = path.parse(textEditor.document.fileName);

    if (!data) {
      outputChannel.appendError(`Document ${p.base} could not be read.`);
      return;
    }

    // This will replace the entire document with the newly formatted document
    textEditor.edit((builder) => {
      builder.replace(
        new Range(
          textEditor.document.lineAt(0).range.start,
          textEditor.document.lineAt(textEditor.document.lineCount - 1).range.end
        ),
        data
      );
    });

    outputChannel.appendInfo(`Document ${p.base} formatted.`);
  }
}

export const d2Tasks: D2Tasks = new D2Tasks();
