/**
 * SVG 后处理：统一给预览和导出叠加水印。
 *
 * 设计要点：
 * 1. 预览和导出走同一个函数，保证"看到什么就导出什么"
 * 2. 始终"先删除再添加"，保证幂等——
 *    即使用户从"水印A"改成"水印B"，也不会出现 A+B 叠加；
 *    重复调用也不会越积越多
 * 3. watermarkText 为空则不添加，但**删除操作仍执行**（清掉自己上次加的水印）
 * 4. 用户可通过 removeClasses 指定要剥离的 class（如外部模板的水印）
 * 5. 字符串级操作，不引入 XML 依赖；只对固定结构做正则替换
 */

/**
 * 处理 SVG：剥离旧水印（如果存在）+ 叠加新水印（如果配置了文字）。
 *
 * @param svg 原始或上次的 SVG 字符串
 * @param watermarkText 水印文字；空字符串/纯空白都视为不启用
 * @param removeClasses 额外要剥离的 class 名列表（剥离 SVG 原本自带的、用户已知的外部水印）
 * @returns 处理后的 SVG 字符串
 */
export function processSvg(
  svg: string,
  watermarkText: string,
  removeClasses: string[] = []
): string {
  // 1. 先删除我加的水印 + 用户指定的外部水印 class
  //    这一步无条件执行，即便 watermarkText 为空（用户清空了配置也要清掉旧水印）
  let result = removeOwnWatermark(svg);
  for (const cls of removeClasses) {
    if (cls) result = removeByClass(result, cls);
  }
  // 2. 删除 d2 CLI 商业版未授权时自动注入的 "UNLICENSED COPY" 水印
  //    这个水印用户用未注册的 d2 binary 就会出现，不删的话预览和导出都会带
  result = removeD2LicenseWatermark(result);

  // 3. 再添加新水印（仅当 watermarkText 非空）
  const text = watermarkText.trim();
  if (text) {
    result = addWatermark(result, text);
  }

  return result;
}

/**
 * 删除所有 class="d2-watermark" 的 <g> 节点（我之前加的水印）。
 * 通过匹配完整元素（含子节点）来剥离，保留 SVG 其他结构。
 */
function removeOwnWatermark(svg: string): string {
  // 匹配 <g class="...d2-watermark..." ...>...</g>
  // 用 [\s\S] 跨行匹配子节点
  const re = /<g\b[^>]*\bclass="[^"]*\bd2-watermark\b[^"]*"[^>]*>[\s\S]*?<\/g>/g;
  return svg.replace(re, "");
}

/**
 * 按 class 名删除元素（用于剥离外部水印）。
 * 例如 removeByClass(svg, "logo-stamp") 会删除所有 class 含 "logo-stamp" 的元素。
 *
 * 注意：这是简化版，匹配含指定 class 的任意标签（含子节点），不做嵌套深度判断。
 * 对 d2 输出的一层 SVG 足够用。
 */
function removeByClass(svg: string, className: string): string {
  const safe = escapeRegex(className);
  // 匹配 <任意标签 class="...含className...">...</同标签>
  const re = new RegExp(
    `<(\\w+)\\b([^>]*\\bclass="[^"]*\\b${safe}\\b[^"]*"[^>]*)>[\\s\\S]*?<\\/\\1>`,
    "g"
  );
  return svg.replace(re, "");
}

/**
 * 删除 d2 CLI 商业版未授权时自动注入的 "UNLICENSED COPY" 水印。
 *
 * 触发场景：用户没注册 d2 商业版，CLI 会在 SVG 末尾加一个 opacity=0.3 的大字号文字节点。
 * 典型形态：<text x="..." y="..." style="text-anchor:middle;font-size:126px;fill:black;opacity:0.3">UNLICENSED COPY</text>
 *
 * 字符串级匹配：删除任何文本内容含 "UNLICENSED COPY" 的 <text> 节点。
 * 匹配范围限制在 text 节点内，不影响 SVG 其他结构（d2 的 mask、pattern 都安全）。
 */
function removeD2LicenseWatermark(svg: string): string {
  const re = /<text\b[^>]*>[^<]*UNLICENSED COPY[^<]*<\/text>/g;
  return svg.replace(re, "");
}

/**
 * 在 SVG 末尾 </svg> 之前插入一个 g.d2-watermark 节点。
 * 节点位置：右上角；样式：灰色、半透明、小号字。
 */
function addWatermark(svg: string, text: string): string {
  const block =
    '<g class="d2-watermark" pointer-events="none">' +
    '<text x="98%" y="24" text-anchor="end" ' +
    'fill="rgba(128,128,128,0.55)" font-size="12" ' +
    'font-family="-apple-system, Segoe UI, sans-serif">' +
    escapeXml(text) +
    "</text></g>";
  return svg.replace(/<\/svg>\s*$/, block + "</svg>");
}

/**
 * XML 文本转义：水印里如果出现 & < > " 都不会破坏 SVG 结构。
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 正则元字符转义：用户传入的 class 名可能含特殊字符。
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}