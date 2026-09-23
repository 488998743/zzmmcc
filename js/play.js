/**
 * 游戏页：小程序 spN/play/play.js 的网页版。
 *
 * 排版规则和小程序完全一致：图画在左上、原书侧栏里的物品排右侧、底栏物品排在下面，
 * 卡片大小按物品在图里的真实比例来定（rect × 图画缩放），底栏贪心分行、绝不滚动。
 * 差别只有三处：
 *   1. 分包 → 平铺路径（assets/pic/dino/<页号>.jpg），没有 wx.loadSubpackage；
 *   2. 点击坐标用 img.getBoundingClientRect() 现量（小程序是 createSelectorQuery）；
 *   3. localStorage 存进度，另外加了个网页才需要的"点错了"反馈（手机振动 + 一闪的红圈）。
 */
(function () {
  var BOOK_ID = 'dino'

  var S = {
    rpx: 1, winW: 0, winH: 0, barH: 0, sideW: 0, pad: 0,
    level: 1, bookName: '恐龙', maxLevel: 0, levels: [], lv: null,
    cards: [], rows: [], found: {}, total: 0,
    nameFs: 14, nameH: 20, box: { left: 0, top: 0, width: 0, height: 0 }, stageH: 200
  }

  var el = {}
  function $(id) { return document.getElementById(id) }

  // 脚本出错时别只留在控制台：页面上直接写清楚，省得对着"正在加载关卡资源…"发呆
  window.addEventListener('error', function (e) {
    var box = document.getElementById('state')
    if (!box) return
    box.hidden = false
    box.textContent = '⚠️ 脚本出错：' + (e.message || e) +
      '（' + (e.filename || '?') + ' 第 ' + (e.lineno || 0) + ' 行）'
  })

  /* ---------------------------------------------------------------- 入口 */
  function init() {
    el = {
      title: $('tbTitle'), count: $('tbCount'), state: $('state'), game: $('game'),
      board: $('board'), picbox: $('picbox'), picimg: $('picimg'),
      hots: $('hots'), pulse: $('pulse'), miss: $('miss'), sidebar: $('sidebar'),
      footblock: $('footblock'), done: $('done'), doneSub: $('doneSub'),
      story: $('story'), storyImg: $('storyImg'), back: $('btnBack')
    }

    S.level = Math.max(1, Number(util.param('level', 1)) || 1)
    try {
      computeLayout()
      bindEvents()
      load()
    } catch (e) {
      console.error(e)
      fail('脚本出错：' + ((e && e.message) || e))
    }
  }

  function computeLayout() {
    S.rpx = util.applyRpx()
    S.winW = util.appWidth()
    S.winH = util.viewHeight()
    S.barH = Math.round(92 * S.rpx)
    S.sideW = Math.round(168 * S.rpx)   // 原书侧栏约占页面宽度六分之一，这里给宽一些便于辨认
    S.pad = Math.round(8 * S.rpx)
  }

  function load() {
    var book = window.VC_BOOK_DATA && window.VC_BOOK_DATA[BOOK_ID]
    if (!book) return fail('缺少数据文件 js/data.js（请先运行 tools/build-web.py）')
    S.bookName = book.name || '恐龙'
    S.levels = book.levels || []
    S.maxLevel = S.levels.length
    var lv = null
    for (var i = 0; i < S.levels.length; i++) if (S.levels[i].level === S.level) lv = S.levels[i]
    if (!lv) return fail('第 ' + S.level + ' 关没有数据（共 ' + S.maxLevel + ' 关）')
    S.lv = lv

    // 读回这一关已经找到的物品
    S.found = {}
    var prog = store.getLevel(BOOK_ID, S.level)
    var found = (prog && prog.found) || []
    for (var j = 0; j < found.length; j++) S.found[found[j]] = 1

    render()
  }

  function fail(msg) {
    el.state.hidden = false
    el.state.textContent = '⚠️ ' + msg
    el.game.hidden = true
  }

  /* ---------------------------------------------------------------- 排版 */
  /**
   * 每个物品的显示尺寸 = 它在图里占的尺寸（rect 乘以图画缩放），所以卡片的图标
   * 和图中那个物体一样大——这正是原书的做法，玩家看到的比例是真实的。
   * 底栏按真实宽度贪心分行，放不下就换行，绝不滚动。
   */
  function buildCards(all, sb, dispW, cellPad, availRowW, nameFs, nameH) {
    // 精灵图里的图标是按 104 高度归一化过的，直接用它的像素尺寸会丢掉相对大小，
    // 所以尺寸必须从 rect 反推。
    var nat = all.map(function (it) {
      var r = it.rect
      if (r && r[2] > 0 && r[3] > 0) {
        return { nw: r[2] * dispW, nh: r[3] * dispW * (it.icon[3] / it.icon[2]) }
      }
      return { nw: 0, nh: 0 }
    })
    var known = nat.filter(function (n) { return n.nw > 0 }).map(function (n) { return n.nw })
      .sort(function (a, b) { return a - b })
    var fallback = known.length ? known[Math.floor(known.length / 2)] : 40
    for (var i = 0; i < nat.length; i++) {
      if (!(nat[i].nw > 0)) {
        nat[i].nw = fallback
        nat[i].nh = fallback * (all[i].icon[3] / all[i].icon[2])
      }
    }
    // 所有卡片共用一个放大系数：物品之间的相对大小和图里一致，整体又能看清。
    // 系数取"侧栏里最宽的那个正好放得下"，并设上限避免个别关卡过度放大。
    var maxSideW = 0
    for (var j = 0; j < sb; j++) if (nat[j].nw > maxSideW) maxSideW = nat[j].nw
    var sideInnerW = S.sideW - cellPad * 2
    var E = 2.8
    if (maxSideW > 0) E = Math.min(E, sideInnerW * 0.94 / maxSideW)
    if (!(E > 0)) E = 1

    var list = all.map(function (it, k) {
      var ic = it.icon
      var r = it.rect || null
      var hot = it.hot || null
      var name = it.name || ''
      var w = Math.max(4, Math.round(nat[k].nw * E))
      // 图标按"填满这张卡片"缩放，比例用图标自己的，和 rect 的比例一致
      var s = (ic[2] > 0) ? w / ic[2] : 1
      var h = Math.max(4, Math.round(ic[3] * s))
      var labelW = name ? Math.round(name.length * nameFs + 8) : 0
      return {
        index: k, icon: ic, iconY: it.iconY, hot: hot, rect: r, name: name,
        labelW: labelW,
        ovScale: (r && hot) ? (r[2] * dispW) / hot[2] : 1,
        sprScale: s, iconW: w, iconH: h,
        cardW: Math.max(w, labelW), cardH: h + (name ? nameH : 0),
        cellW: k < sb ? 0 : Math.max(w, labelW) + cellPad * 2,
        // 侧栏是等高的格子：这里先记下格子内高，下面按它把过大的图标缩进去
        sideScale: 1
      }
    })

    // 名称让格子变宽，按图标比例算出的高度可能塞不下：整体缩小图标再排，
    // 直到每行都放得下；缩得太小就停（下限 floorH），宁可留白也不压到看不清
    var floorH = Math.round(26 * S.rpx)
    var shrink = 1
    var rows = []
    for (var attempt = 0; attempt < 16; attempt++) {
      for (var m = sb; m < list.length; m++) {
        var o = list[m]
        var ic = o.icon
        var w = Math.max(4, Math.round(nat[m].nw * E * shrink))
        var s = (ic[2] > 0) ? w / ic[2] : 1
        var h = Math.max(4, Math.round(ic[3] * s))
        o.sprScale = s
        o.iconW = w
        o.iconH = h
        o.cardW = Math.max(w, o.labelW)
        o.cardH = h + (o.name ? nameH : 0)
        o.cellW = o.cardW + cellPad * 2
      }
      rows = []
      var cur = []
      var curW = 0
      for (var n = sb; n < list.length; n++) {
        var cw = list[n].cardW + cellPad * 2
        if (cur.length && curW + cw > availRowW) {
          rows.push(cur)
          cur = []
          curW = 0
        }
        cur.push(n)
        curW += cw
      }
      if (cur.length) rows.push(cur)
      var over = false
      for (var r2 = 0; r2 < rows.length; r2++) {
        var wsum = 0
        for (var k2 = 0; k2 < rows[r2].length; k2++) wsum += list[rows[r2][k2]].cardW + cellPad * 2
        if (wsum > availRowW) over = true
      }
      if (!over || shrink <= floorH / Math.max(1, E * 260)) break
      shrink *= 0.92
    }

    var footH = 0
    var out = []
    for (var r3 = 0; r3 < rows.length; r3++) {
      var tallest = 0
      for (var k3 = 0; k3 < rows[r3].length; k3++) {
        var hh = list[rows[r3][k3]].cardH
        if (hh > tallest) tallest = hh
      }
      var rh = tallest + cellPad * 2
      footH += rh
      out.push({
        key: r3, h: rh,
        items: rows[r3].map(function (idx) { return list[idx] })
      })
    }
    return { list: list, rows: out, footH: footH, E: E }
  }

  function applyFoundFlags(list) {
    for (var i = 0; i < list.length; i++) list[i].found = !!S.found[i]
    return list
  }

  function render() {
    var lv = S.lv
    var pic = lv.pic
    var spr = lv.spr
    var all = lv.items || []
    var sb = Math.max(0, Math.min(lv.sb || 0, all.length))   // 前 sb 个在侧栏，其余在底栏
    var rpx = S.rpx
    var pad = S.pad
    var cellPad = Math.round(14 * rpx)
    var availRowW = S.winW - pad * 2
    S.nameFs = Math.max(9, Math.round(18 * rpx))
    S.nameH = Math.round(S.nameFs * 1.45)
    var nameFs = S.nameFs
    var nameH = S.nameH

    // 卡片要和图中物体一样大，所以尺寸取决于图画尺寸；而图画高度又受底栏高度挤占。
    // 图画越大 → 卡片越大 → 底栏越高 → 可用高度越小，两者互相挤占，所以要来回算。
    // 小程序版是固定算两遍，宽而矮的窗口上会"缩过头"（第二遍把图画缩了，底栏跟着变小，
    // 空出来的高度却不再回补）。这里改成对图画宽度二分：找"整屏放得下"的最大宽度。
    // 手机上的结果和算两遍一致（本来就是铺满宽度），只有宽屏短窗口会明显变好。
    function layoutAt(w) {
      var h = Math.max(1, Math.round(w * pic.h / pic.w))
      var c = buildCards(all, sb, w, cellPad, availRowW, nameFs, nameH)
      var sh = Math.max(180, S.winH - S.barH - c.footH - pad * 2)
      return { w: w, h: h, cards: c, stageH: sh, fit: h + pad * 2 <= sh }
    }
    var maxW = Math.max(60, S.winW - S.sideW - pad * 2)
    var best = layoutAt(maxW)
    if (!best.fit) {
      var lo = 60
      var hi = maxW
      best = layoutAt(lo)          // 连最窄都放不下时就用最窄的，宁可挤一点也别缩到看不见
      while (hi - lo > 2) {
        var mid = Math.floor((lo + hi) / 2)
        var t = layoutAt(mid)
        if (t.fit) { best = t; lo = mid } else { hi = mid }
      }
    }
    var dispW = best.w
    var dispH = best.h
    var cards = best.cards
    var stageH = best.stageH

    // 侧栏是等高的格子：图标在格里居中，过大的按格缩一下，保证不越线
    var items = cards.list
    var cellInnerH = Math.round(stageH / Math.max(1, sb)) - cellPad * 2
    var sideInnerW = S.sideW - cellPad * 2
    for (var i = 0; i < sb && i < items.length; i++) {
      var o = items[i]
      var nh = o.name ? Math.round(nameFs * 1.45) : 0
      var maxIconH = Math.max(6, cellInnerH - nh)
      var k = 1
      if (o.iconW > sideInnerW) k = Math.min(k, sideInnerW / o.iconW)
      if (o.iconH > maxIconH) k = Math.min(k, maxIconH / o.iconH)
      if (k < 1) {
        o.sprScale *= k
        o.iconW = Math.max(4, Math.round(o.iconW * k))
        o.iconH = Math.max(4, Math.round(o.iconH * k))
        o.cardW = Math.max(o.iconW, o.labelW)
        o.cardH = o.iconH + nh
      }
    }
    applyFoundFlags(items)

    S.cards = items
    S.total = items.length
    S.box = {
      left: Math.round((S.winW - S.sideW - dispW) / 2),
      top: Math.round((stageH - dispH) / 2),
      width: dispW,
      height: dispH
    }
    S.stageH = stageH

    var picUrl = url('pic', lv)
    var sprUrl = url('spr', lv)

    el.state.hidden = true
    el.game.hidden = false
    el.title.textContent = S.bookName + ' · 第 ' + S.level + ' 关'
    document.title = S.bookName + '找物 · 第 ' + S.level + ' 关'

    el.board.style.height = stageH + 'px'
    var box = S.box
    el.picbox.style.left = box.left + 'px'
    el.picbox.style.top = box.top + 'px'
    el.picbox.style.width = box.width + 'px'
    el.picbox.style.height = box.height + 'px'
    if (el.picimg.getAttribute('src') !== picUrl) el.picimg.setAttribute('src', picUrl)
    el.picimg.style.width = box.width + 'px'
    el.picimg.style.height = box.height + 'px'

    el.sidebar.style.width = S.sideW + 'px'
    var sideHtml = ''
    for (var s1 = 0; s1 < sb && s1 < items.length; s1++) {
      sideHtml += '<div class="sidecell" data-index="' + items[s1].index + '">' +
        cellHtml(items[s1], sprUrl, spr, nameFs, nameH) + '</div>'
    }
    el.sidebar.innerHTML = sideHtml

    var footHtml = ''
    for (var r4 = 0; r4 < cards.rows.length; r4++) {
      var row = cards.rows[r4]
      footHtml += '<div class="footrow" style="height:' + row.h + 'px">'
      for (var k4 = 0; k4 < row.items.length; k4++) {
        var it = row.items[k4]
        footHtml += '<div class="footcell" style="width:' + it.cellW + 'px" data-index="' + it.index + '">' +
          cellHtml(it, sprUrl, spr, nameFs, nameH) + '</div>'
      }
      footHtml += '</div>'
    }
    el.footblock.innerHTML = footHtml

    el.storyImg.setAttribute('src', url('hdr', lv))
    S.sprUrl = sprUrl
    S.spr = spr

    renderHots()
    el.pulse.hidden = true
    updateProgress()
  }

  function url(kind, lv) {
    var ext = kind === 'spr' ? '.png' : '.jpg'
    return 'assets/' + kind + '/dino/' + lv.page + ext
  }

  /** 一张卡片：窗口里裁出精灵图上那块图标；找到过就换成金黄那一版 */
  function cellHtml(o, sprUrl, spr, nameFs, nameH) {
    var found = !!o.found
    var x = found ? o.iconY[0] : o.icon[0]
    var y = found ? o.iconY[1] : o.icon[1]
    return '<div class="cell' + (found ? ' found' : '') + '"' +
      ' style="width:' + o.cardW + 'px;height:' + o.cardH + 'px">' +
      '<div class="crop" style="width:' + o.iconW + 'px;height:' + o.iconH + 'px">' +
      '<img src="' + sprUrl + '" alt="" draggable="false"' +
      ' style="width:' + spr.w * o.sprScale + 'px;height:' + spr.h * o.sprScale + 'px;' +
      'margin-left:' + (-x * o.sprScale) + 'px;margin-top:' + (-y * o.sprScale) + 'px">' +
      '</div>' +
      (o.name ? '<div class="cname" style="font-size:' + nameFs + 'px;line-height:' + nameH + 'px">' +
        util.esc(o.name) + '</div>' : '') +
      '</div>'
  }

  /** 找到的物品：把 hot 那块透明覆盖图按 rect 的尺寸贴到图上（金黄色只落在物体轮廓上） */
  function renderHots() {
    var html = ''
    for (var i = 0; i < S.cards.length; i++) {
      var o = S.cards[i]
      if (!o.found || !o.hot || !o.rect) continue
      var box = S.box
      html += '<div class="hot" style="left:' + o.rect[0] * box.width + 'px;top:' + o.rect[1] * box.height +
        'px;width:' + o.rect[2] * box.width + 'px;height:' + o.rect[3] * box.height + 'px">' +
        '<img src="' + S.sprUrl + '" alt="" style="width:' + S.spr.w * o.ovScale + 'px;height:' +
        S.spr.h * o.ovScale + 'px;margin-left:' + (-o.hot[4] * o.ovScale) + 'px;margin-top:' +
        (-o.hot[5] * o.ovScale) + 'px">' +
        '</div>'
    }
    el.hots.innerHTML = html
  }

  /** 只更新一张卡片的状态（改状态时不用重建整个物品栏） */
  function updateCell(i) {
    var o = S.cards[i]
    if (!o) return
    var found = !!o.found
    var nodes = document.querySelectorAll('[data-index="' + i + '"]')
    for (var n = 0; n < nodes.length; n++) {
      var cell = nodes[n].querySelector('.cell')
      if (!cell) continue
      cell.classList.toggle('found', found)
      var img = cell.querySelector('.crop img')
      if (!img) continue
      img.style.marginLeft = (-(found ? o.iconY[0] : o.icon[0]) * o.sprScale) + 'px'
      img.style.marginTop = (-(found ? o.iconY[1] : o.icon[1]) * o.sprScale) + 'px'
    }
  }

  function updateProgress() {
    var n = 0
    for (var i = 0; i < S.cards.length; i++) if (S.cards[i].found) n++
    var allDone = S.total > 0 && n >= S.total
    el.count.textContent = n + '/' + S.total
    if (allDone) {
      el.doneSub.textContent = '第 ' + S.level + ' 关 · ' + S.total + ' 个物品'
      el.done.hidden = false
    }
    return allDone
  }

  /* ---------------------------------------------------------------- 点击 */
  function picRect() {
    var r = el.picimg.getBoundingClientRect()
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }

  function onTapPic(e) {
    if (el.game.hidden || !el.done.hidden) return
    var r = picRect()
    if (!r.width || !r.height) return
    var nx = (e.clientX - r.left) / r.width
    var ny = (e.clientY - r.top) / r.height
    if (nx < -0.05 || nx > 1.05 || ny < -0.05 || ny > 1.05) return
    var hit = hitTest(nx, ny)
    if (hit) markFound(hit.index)
    else missAt(e.clientX - r.left, e.clientY - r.top)
  }

  function hitTest(nx, ny) {
    var items = S.cards
    var best = null
    for (var i = 0; i < items.length; i++) {
      var it = items[i]
      if (it.found || !it.rect) continue
      // 判定时给热区约 14% 的容差，小朋友/鼠标点得不太准也能过
      var p = Math.max(0.010, Math.min(it.rect[2], it.rect[3]) * 0.14)
      var x0 = it.rect[0] - p
      var y0 = it.rect[1] - p
      var x1 = it.rect[0] + it.rect[2] + p
      var y1 = it.rect[1] + it.rect[3] + p
      if (nx >= x0 && nx <= x1 && ny >= y0 && ny <= y1) {
        var area = (x1 - x0) * (y1 - y0)
        if (!best || area < best.area) best = { index: i, area: area }
      }
    }
    return best
  }

  /** 点错了：短振动 + 在点的位置闪一个圈（小程序只有振动，桌面上需要看得见的反馈） */
  function missAt(x, y) {
    util.vibrate('light')
    if (!el.miss) return
    el.miss.style.left = x + 'px'
    el.miss.style.top = y + 'px'
    el.miss.hidden = false
    el.miss.style.animation = 'none'
    /* 强制重排，让动画能重播 */
    void el.miss.offsetWidth
    el.miss.style.animation = ''
    clearTimeout(missAt._t)
    missAt._t = setTimeout(function () { el.miss.hidden = true }, 420)
  }

  function markFound(index) {
    var o = S.cards[index]
    if (!o || o.found) return
    S.found[index] = 1
    o.found = true
    updateCell(index)
    renderHots()
    el.pulse.hidden = true
    store.markFound(BOOK_ID, S.level, index, S.total)
    util.vibrate('medium')
    var allDone = updateProgress()
    if (allDone) util.toast('全部找到啦！', 1500)
  }

  /* ---------------------------------------------------------------- 物品栏交互 */
  function cardIndex(e) {
    var node = e.target
    while (node && node !== document.body) {
      if (node.getAttribute && node.getAttribute('data-index') !== null) return Number(node.getAttribute('data-index'))
      node = node.parentNode
    }
    return -1
  }

  var lpTimer = 0
  var lpFired = false

  function onCardDown(e) {
    var i = cardIndex(e)
    if (i < 0) return
    lpFired = false
    clearTimeout(lpTimer)
    lpTimer = setTimeout(function () {
      lpFired = true
      askDirect(i)
    }, 550)
  }

  function onCardUp() { clearTimeout(lpTimer) }

  function onCardClick(e) {
    var i = cardIndex(e)
    if (i < 0) return
    if (lpFired) { lpFired = false; return }
    var it = S.cards[i]
    if (!it || it.found) return
    // 点卡片只报出这个物品叫什么，不在图上画光圈（避免直接暴露位置）
    util.toast(it.name ? ('找 ' + it.name) : '找这个物品', 1200)
  }

  /** 长按卡片：万一某个热区不准，也能直接算找到 */
  function askDirect(i) {
    var it = S.cards[i]
    if (!it || it.found) return
    util.confirmDialog({
      title: '直接算找到？',
      body: '如果怎么都点不中这个物品，可以把它标记成已找到。',
      okText: '算找到'
    }).then(function (ok) {
      if (ok) markFound(i)
    })
  }

  /* ---------------------------------------------------------------- 提示 / 故事 / 通关 */
  function showHint() {
    for (var i = 0; i < S.cards.length; i++) {
      var it = S.cards[i]
      if (it.found || !it.rect) continue
      pulse(it)
      return
    }
  }

  function pulse(it) {
    var r = it.rect
    var box = S.box
    el.pulse.style.left = ((r[0] + r[2] / 2) * box.width) + 'px'
    el.pulse.style.top = ((r[1] + r[3] / 2) * box.height) + 'px'
    el.pulse.style.width = (r[2] * box.width) + 'px'
    el.pulse.style.height = (r[3] * box.height) + 'px'
    el.pulse.hidden = false
    util.toast('在光圈处点一下', 1400)
    clearTimeout(pulse._t)
    pulse._t = setTimeout(function () { el.pulse.hidden = true }, 2600)
  }

  function toggleStory(v) {
    el.story.hidden = v === undefined ? !el.story.hidden : !v
  }

  function replay() {
    store.resetLevel(BOOK_ID, S.level)
    S.found = {}
    for (var i = 0; i < S.cards.length; i++) S.cards[i].found = false
    el.done.hidden = true
    el.pulse.hidden = true
    render()
  }

  function nextLevel() {
    var n = S.level + 1
    if (S.maxLevel && n > S.maxLevel) {
      util.toast('已经是最后一关', 1200)
      return
    }
    location.href = 'play.html?level=' + n
  }

  function backHome() {
    var ref = document.referrer || ''
    if (ref && ref.indexOf(location.origin) === 0 && history.length > 1) history.back()
    else location.href = 'index.html'
  }

  /* ---------------------------------------------------------------- 事件 */
  /** 物品栏和底栏的卡片交互一样：点一下报名字，长按直接算找到 */
  function bindCards(root) {
    root.addEventListener('click', onCardClick)
    root.addEventListener('mousedown', onCardDown)
    root.addEventListener('touchstart', onCardDown, { passive: true })
    root.addEventListener('mouseup', onCardUp)
    root.addEventListener('mouseleave', onCardUp)
    root.addEventListener('touchend', onCardUp)
    root.addEventListener('touchcancel', onCardUp)
    root.addEventListener('contextmenu', function (e) { e.preventDefault() })
    root.addEventListener('dragstart', function (e) { e.preventDefault() })
  }

  function bindEvents() {
    el.picbox.addEventListener('click', onTapPic)
    bindCards(el.sidebar)
    bindCards(el.footblock)

    $('btnHint').addEventListener('click', showHint)
    $('btnStory').addEventListener('click', function () { toggleStory() })
    el.back.addEventListener('click', backHome)
    el.story.addEventListener('click', function () { el.story.hidden = true })
    $('btnReplay').addEventListener('click', replay)
    $('btnNext').addEventListener('click', nextLevel)
    $('btnHome').addEventListener('click', function () { location.href = 'index.html' })

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!el.story.hidden) { el.story.hidden = true; e.preventDefault(); return }
        if (!el.done.hidden) { el.done.hidden = true; e.preventDefault() }
        return
      }
      if (e.key === 'Enter' && !el.done.hidden) { nextLevel(); return }
      if (e.key === 'h' || e.key === 'H') showHint()
      if (e.key === 's' || e.key === 'S') toggleStory()
    })

    var rt = 0
    window.addEventListener('resize', function () {
      clearTimeout(rt)
      rt = setTimeout(function () {
        computeLayout()
        if (S.lv) render()
      }, 150)
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
