#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
从原始 PDF 里导出翻书模式的封面（PDF 第一页）到 web/assets/book/cover.jpg。

    python tools/pdf_cover.py            # 默认 dpi=150（约 1200x1650，450KB 左右）
    python tools/pdf_cover.py 200        # 想更清晰就加大 dpi

PDF 路径优先取 ../tools/locator.py 里的 SRC_DIR（和生成素材用的是同一份），
找不到就用下面的默认路径。
"""
import os
import re
import sys

try:
    import pymupdf
except ImportError:                                   # 老版本包名
    import fitz as pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
DEFAULT_SRC = r'F:\11\视觉挑战-成语故事.pdf等8个文件\视觉挑战-恐龙.pdf'


def find_pdf():
    locator = os.path.join(os.path.dirname(WEB), 'tools', 'locator.py')
    if os.path.isfile(locator):
        with open(locator, encoding='utf-8', errors='replace') as f:
            m = re.search(r'SRC_DIR\s*=\s*r?["\'](.+?)["\']', f.read())
        if m:
            d = m.group(1)
            for name in os.listdir(d) if os.path.isdir(d) else []:
                if name.endswith('.pdf') and '恐龙' in name:
                    return os.path.join(d, name)
    return DEFAULT_SRC


def main():
    dpi = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    src = find_pdf()
    if not os.path.isfile(src):
        raise SystemExit('找不到 PDF：%s（改这个脚本里的 DEFAULT_SRC，或用 ../tools/locator.py 的 SRC_DIR）' % src)
    out_dir = os.path.join(WEB, 'assets', 'book')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, 'cover.jpg')
    doc = pymupdf.open(src)
    print('PDF：%s（共 %d 页）' % (src, doc.page_count))
    pix = doc[0].get_pixmap(dpi=dpi)
    pix.pil_save(out, format='JPEG', quality=85, optimize=True)
    print('封面已导出：%s（%dx%d，%.0f KB）' % (out, pix.width, pix.height, os.path.getsize(out) / 1024))


if __name__ == '__main__':
    main()
