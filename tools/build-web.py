#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
把 miniprogram/ 里的关卡数据和图片同步到 web/。

小程序按分包（sp1…sp8）打包是微信的 2MB 包体限制逼出来的，网页没有这个限制，
所以这里把所有分包的图片平铺到 web/assets/{pic,hdr,spr}/dino/ 下，
再把 data/dino.js、data/books.js 从 module.exports 转成浏览器能直接 <script> 加载的全局变量。

    python tools/build-web.py

小程序里改了数据或重新生成了素材之后跑一次即可。
"""
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
ROOT = os.path.dirname(WEB)
SRC = os.path.join(ROOT, 'miniprogram')

PKGS = ['sp%d' % i for i in range(1, 9)]
KINDS = [('pic', '.jpg'), ('hdr', '.jpg'), ('spr', '.png')]


def read_js(path):
    """读一个 `module.exports = {...}` 的数据模块，返回解析后的对象"""
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    m = re.search(r'module\.exports\s*=\s*', text)
    if not m:
        raise SystemExit('不是 module.exports 数据模块：%s' % path)
    text = text[m.end():].strip()
    if text.endswith(';'):
        text = text[:-1]
    return json.loads(text)


def copy_assets():
    counts = {}
    for kind, _ext in KINDS:
        out = os.path.join(WEB, 'assets', kind, 'dino')
        os.makedirs(out, exist_ok=True)
        n = 0
        for pkg in PKGS:
            d = os.path.join(SRC, pkg, kind, 'dino')
            if not os.path.isdir(d):
                continue
            for name in sorted(os.listdir(d)):
                s = os.path.join(d, name)
                if os.path.isfile(s):
                    shutil.copy2(s, os.path.join(out, name))
                    n += 1
        counts[kind] = n

    cvr_out = os.path.join(WEB, 'assets', 'cvr')
    os.makedirs(cvr_out, exist_ok=True)
    n = 0
    for name in ['dino.jpg']:
        s = os.path.join(SRC, 'cvr', name)
        if os.path.isfile(s):
            shutil.copy2(s, os.path.join(cvr_out, name))
            n += 1
    counts['cvr'] = n
    return counts


def write_data():
    books = read_js(os.path.join(SRC, 'data', 'books.js'))
    dino = read_js(os.path.join(SRC, 'data', 'dino.js'))
    out = os.path.join(WEB, 'js', 'data.js')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/build-web.py 从 miniprogram/data/*.js 生成，不要手改；\n'
                '   改关卡数据请改 miniprogram/data/dino.js 后重新运行该脚本。 */\n')
        f.write('window.VC_BOOKS = ')
        f.write(json.dumps(books, ensure_ascii=False, separators=(',', ':')))
        f.write(';\nwindow.VC_BOOK_DATA = {dino: ')
        f.write(json.dumps(dino, ensure_ascii=False, separators=(',', ':')))
        f.write('};\n')
    return dino, os.path.getsize(out)


def check(dino):
    """每个物品都要有热区、每个关卡的三张图都要在 web/assets 里"""
    miss = []
    for lv in dino.get('levels', []):
        for kind, ext in KINDS:
            p = os.path.join(WEB, 'assets', kind, 'dino', '%s%s' % (lv['page'], ext))
            if not os.path.isfile(p):
                miss.append('%s 第%d关 %s' % (kind, lv['level'], os.path.basename(p)))
        for it in lv.get('items', []):
            if not it.get('rect') or not it.get('hot') or not it.get('icon'):
                miss.append('第%d关 %s 缺少 rect/hot/icon' % (lv['level'], it.get('name')))
    return miss


def main():
    if not os.path.isdir(SRC):
        raise SystemExit('找不到 miniprogram 目录：%s' % SRC)
    counts = copy_assets()
    dino, size = write_data()
    levels = dino.get('levels', [])
    items = sum(len(lv.get('items', [])) for lv in levels)
    print('图片：' + '，'.join('%s %d 张' % (k, v) for k, v in counts.items()))
    print('数据：js/data.js %.0f KB，%d 关 / %d 个物品' % (size / 1024.0, len(levels), items))
    miss = check(dino)
    if miss:
        print('缺东西（%d）：' % len(miss))
        for m in miss[:20]:
            print('  ' + m)
        return 1
    print('自检通过：每关的 pic/hdr/spr 都在，每个物品都有 rect/hot/icon')
    return 0


if __name__ == '__main__':
    sys.exit(main())
