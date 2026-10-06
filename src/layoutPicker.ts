import { QuickPickItem, window } from "vscode";

/**
 * Container for D2 Layouts
 */
class LayoutItem implements QuickPickItem {
  label: string;
  description: string;

  constructor(l: string, d: string) {
    this.label = l;
    this.description = d;
  }
}

/**
 * List of Layouts
 */
const layouts: QuickPickItem[] = [
  new LayoutItem("dagre", "The directed graph layout library Dagre"),
  new LayoutItem("elk", "Eclipse Layout Kernel (ELK) with the Layered algorithm"),
  // d2 v0.9.0 起 TALA 已开源并随 d2 内置（d2 layout 列出 "tala (bundled)"），
  // 不再需要单独安装 d2plugin-tala。旧代码按该插件是否在 PATH 上来决定列不列
  // tala，导致内置 TALA 的用户反而看不到这一项，故去掉探测、固定列出。
  new LayoutItem("tala", "TALA, D2's native layout and edge-routing engine"),
];

/**
 * layouPicker - This will show the quick pick list in
 * the command pallette when called
 */
export class layoutPicker {
  showPicker(): Thenable<QuickPickItem | undefined> {
    return window.showQuickPick(layouts, {
      title: "Layouts",
      canPickMany: false,
      placeHolder: "Choose a layout...",
    });
  }
}
