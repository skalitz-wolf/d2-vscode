/**
 * 解析 d2 源码顶层 layers:/scenarios: 块的一级键名（board 名单）。
 *
 * 背景：d2 CLI 没有"列出所有 boards"的命令，预览左上角的场景栏只能自己解析源码。
 * 场景（scenarios）是整张图的变体、不属于任何节点，不适合像图层那样用节点
 * .link 角标进入，因此由插件解析出场景名，发给 webview 渲染成一行切换栏。
 *
 * 为什么不用正则而用括号深度扫描：
 * - 键名可能是带空格的裸串（"Sggate 内部"）或带引号的串（"parse()"），正则难覆盖
 * - 块值里的 |md 文本块、双引号字符串、# 注释中都可能出现 {} / #，会干扰深度计数
 * - 一级键的值可能是 @文件 导入引用（L1: @lib.d2），没有花括号
 *
 * 只解析顶层（深度 0）的指定块；嵌套 board（场景里的图层等）在其父键的
 * 花括号值内，整块跳过不展开。任何格式异常都只影响当前键的解析，
 * 最坏结果是场景栏少显示几个项，不影响预览主体功能。
 */
export function parseTopLevelBoards(text: string, keyword: string): string[] {
  const names: string[] = [];
  const open = findTopLevelBlock(text, keyword);
  if (open < 0) {
    return names;
  }
  let i = open;
  for (;;) {
    i = skipTrivia(text, i);
    if (i >= text.length || text[i] === "}") {
      break;
    }
    const key = readKey(text, i);
    if (!key) {
      // 无冒号的裸键（d2 允许，值为空的 board）：整行去掉行尾注释后不含
      // 结构字符则视为键名；含结构字符说明源码格式超出预期，跳过本行
      const eol = text.indexOf("\n", i);
      const line = text.slice(i, eol < 0 ? text.length : eol).split("#")[0];
      if (line && !/[:{}"]/.test(line)) {
        const name = line.trim();
        if (name && name !== "vars") {
          names.push(name);
        }
      }
      i = skipToEol(text, i);
      continue;
    }
    i = skipSpaces(text, key.next);
    i = skipValue(text, i);
    // vars 是 d2 的变量声明块，不是 board，不进场景栏
    if (key.name !== "vars") {
      names.push(key.name);
    }
  }
  return names;
}

/** 定位深度 0 的 "keyword: {"，返回 '{' 之后的位置；找不到返回 -1 */
function findTopLevelBlock(text: string, keyword: string): number {
  const isWord = (ch: string | undefined): boolean => !!ch && /[A-Za-z0-9_]/.test(ch);
  let depth = 0;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      const j = skipQuoted(text, i);
      if (j < 0) {
        return -1;
      }
      i = j;
      continue;
    }
    if (c === "#") {
      i = skipToEol(text, i);
      continue;
    }
    if (c === "|" && isBlockScalarStart(text, i)) {
      i = skipBlockScalar(text, i);
      continue;
    }
    if (c === "{") {
      depth++;
      i++;
      continue;
    }
    if (c === "}") {
      depth--;
      i++;
      continue;
    }
    // 前后都不能是单词字符，避免匹配到 myscenarios 之类的子串
    if (depth === 0 && text.startsWith(keyword, i) && !isWord(text[i - 1]) && !isWord(text[i + keyword.length])) {
      let j = i + keyword.length;
      while (j < text.length && (text[j] === " " || text[j] === "\t")) {
        j++;
      }
      if (text[j] === ":") {
        j++;
        while (j < text.length && (text[j] === " " || text[j] === "\t")) {
          j++;
        }
        if (text[j] === "{") {
          return j + 1;
        }
      }
    }
    i++;
  }
  return -1;
}

/**
 * 读一个一级键：支持裸串（读到 ':' 为止，可含空格/中文）与双引号串。
 * 返回键名与 ':' 之后的位置；不是键（先遇到换行或结构字符）返回 null
 */
function readKey(text: string, start: number): { name: string; next: number } | null {
  if (text[start] === '"') {
    const end = skipQuoted(text, start);
    if (end < 0) {
      return null;
    }
    const j = skipSpaces(text, end);
    if (text[j] !== ":") {
      return null;
    }
    return { name: text.slice(start + 1, end - 1), next: j + 1 };
  }
  let i = start;
  while (i < text.length) {
    const c = text[i];
    if (c === ":") {
      const name = text.slice(start, i).trim();
      return name ? { name, next: i + 1 } : null;
    }
    // 裸键是单行的，遇到换行或结构字符说明这不是键
    if (c === "\n" || c === "{" || c === "}" || c === '"') {
      return null;
    }
    i++;
  }
  return null;
}

/**
 * 跳过一个键的值：{...} 花括号块做配对跳过（内部的字符串/注释/文本块
 * 不参与深度计数）；|md 等文本块跳到结束行；其余（裸值、@导入引用）
 * 按 d2 语义"值止于行尾"跳过
 */
function skipValue(text: string, i: number): number {
  // 值的花括号允许换行后才开始（d2 fmt 不会这样输出，但手写可能），先向前探测
  if (text[i] === "\n") {
    let j = i;
    while (j < text.length && /\s/.test(text[j])) {
      j++;
    }
    if (text[j] === "{") {
      i = j;
    }
  }
  if (text[i] === "{") {
    let depth = 0;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        const j = skipQuoted(text, i);
        if (j < 0) {
          return text.length;
        }
        i = j;
        continue;
      }
      if (c === "#") {
        i = skipToEol(text, i);
        continue;
      }
      if (c === "|" && isBlockScalarStart(text, i)) {
        i = skipBlockScalar(text, i);
        continue;
      }
      if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0) {
          return i + 1;
        }
      }
      i++;
    }
    return i;
  }
  if (text[i] === "|" && isBlockScalarStart(text, i)) {
    return skipBlockScalar(text, i);
  }
  return skipToEol(text, i);
}

/** d2 文本块值（|md、|latex、|code、|）：'|' 后同一行只剩标签字符，结束标记是单独成行的 '|' */
function isBlockScalarStart(text: string, i: number): boolean {
  if (text[i] !== "|") {
    return false;
  }
  let j = i + 1;
  while (j < text.length && /[A-Za-z0-9 ]/.test(text[j])) {
    j++;
  }
  return j < text.length && text[j] === "\n";
}

/** 跳过文本块到结束行（单独成行的 '|'）之后 */
function skipBlockScalar(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length) {
    const eol = text.indexOf("\n", j);
    if (eol < 0) {
      return text.length;
    }
    if (text.slice(j, eol).trim() === "|") {
      return eol + 1;
    }
    j = eol + 1;
  }
  return text.length;
}

/** 跳过双引号字符串（处理 \" 转义），返回右引号之后的位置；未闭合返回 -1 */
function skipQuoted(text: string, start: number): number {
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === "\\") {
      i += 2;
      continue;
    }
    if (text[i] === '"') {
      return i + 1;
    }
    i++;
  }
  return -1;
}

/** 跳过空白与 # 行注释 */
function skipTrivia(text: string, i: number): number {
  while (i < text.length) {
    const c = text[i];
    if (c === "#") {
      i = skipToEol(text, i);
    } else if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
    } else {
      break;
    }
  }
  return i;
}

/** 只跳过行内空格/制表符（不跨行） */
function skipSpaces(text: string, i: number): number {
  while (i < text.length && (text[i] === " " || text[i] === "\t")) {
    i++;
  }
  return i;
}

/** 跳到下一行行首（或文本末尾） */
function skipToEol(text: string, i: number): number {
  const eol = text.indexOf("\n", i);
  return eol < 0 ? text.length : eol + 1;
}
