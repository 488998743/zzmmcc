/**
 * 翻书模式：把 54 关装订成一本书。
 *
 *   [封面（PDF 第一页）] → [目录（每关可点）] → [第 1 关] … [第 54 关] → [封底]
 *
 * 翻页时不是整页平移，而是把纸当成一根等长折线折成弧形：
 * 把翻动的那一页切成 STRIPS 条，从书脊（左边）出发逐段累加角度和位置，
 * 于是纸面是「弯」的 —— 每条再叠一层随角度变化的明暗，出来就是纸页卷曲翻页。
 *
 * 静止时的关卡页只是「书页」（画面 + 物品栏，非交互）；点页面才把这一关的
 * 游戏（play.html?level=N&embed=1）以全屏浮层的方式盖上来玩，关掉回到书里。
 */
(function () {
  var BOOK = (window.VC_BOOK_DATA || {}).dino
  if (!BOOK) {
    document.body.innerHTML = '<p style="color:#eee;font:14px sans-serif;padding:20px">缺少 js/data.js</p>'
    return
  }
  var LEVELS = BOOK.levels
  var STRIPS = 14          // 切多少条来模拟卷曲
  var BEND_MAX = 0.5       // 翻到一半时纸面最多弯多少弧度
  var TURN_MS = 460        // 一次完整翻页的时长

  // 页表
  var PAGES = [{ kind: 'cover' }, { kind: 'toc' }]
  LEVELS.forEach(function (lv) { PAGES.push({ kind: 'level', lv: lv }) })
  PAGES.push({ kind: 'back' })

  var S = {
    index: 0, from: 0, to: 0, p: 0, dir: 1,
    pageW: 0, pageH: 0, anim: 0, animating: false
  }
  var el = {}
  ;['stage', 'leafBack', 'leafFront', 'cast', 'flipLayer', 'hud', 'pageNo',
    'btnPrev', 'btnNext', 'btnToc', 'overlay', 'frame', 'btnClose'].forEach(function (id) {
    el[id] = document.getElementById(id)
  })

  /* ---------------------------------------------------------------- 页面内容 */
  function esc(s) { return window.util ? util.esc(s) : String(s || '') }
  function progOf(level) {
    var p = window.store ? store.getLevel('dino', level) : null
    return (p && p.found) || []
  }

  /** 封面：PDF 第一页 */
  function faceCover() {
    return '<div class="face cover"><img src="assets/book/cover.jpg" alt="封面"></div>'
  }

  /** 目录：54 关，点哪关翻到哪关 */
  function faceToc() {
    var rows = LEVELS.map(function (lv) {
      var found = progOf(lv.level).length
      var total = lv.items.length
      var cls = found >= total && total > 0 ? 'done' : (found ? 'started' : '')
      return '<div class="tocItem ' + cls + '" data-level="' + lv.level + '">' +
        '<span class="no">' + lv.level + '</span>' +
        '<span class="nm">' + esc(lv.name || '') + '</span>' +
        '<span class="pg">' + found + '/' + total + '</span></div>'
    }).join('')
    var st = window.store ? store.bookStats('dino', LEVELS.length) : { done: 0, found: 0 }
    var all = LEVELS.reduce(function (a, lv) { return a + lv.items.length }, 0)
    return '<div class="face toc">' +
      '<div class="tocHead"><div class="t1">目 录</div>' +
      '<div class="t2">共 ' + LEVELS.length + ' 关 · 已通关 ' + st.done + ' · 已找到 ' + st.found + '/' + all + '</div></div>' +
      '<div class="tocCols">' + rows + '</div>' +
      '<div class="tocFoot">点任意一关直接翻到那一页</div></div>'
  }

  /** 关卡页：标题故事条 + 画面 + 物品栏（物品栏里已找到的是金黄的） */
  function faceLevel(lv) {
    var found = {}
    progOf(lv.level).forEach(function (i) { found[i] = 1 })
    var spr = lv.spr
    var sprUrl = 'assets/spr/dino/' + lv.page + '.png'
    var n = lv.items.length
    var total = n
    var got = 0

    function chip(it, i, boxH) {
      var ic = it.icon, foundIt = !!found[i]
      if (foundIt) got++
      var w = Math.max(6, Math.round(boxH * ic[2] / ic[3]))
      var k = boxH / ic[3]
      var x = foundIt ? it.iconY[0] : ic[0]
      var y = foundIt ? it.iconY[1] : ic[1]
      return '<div class="chip' + (foundIt ? ' found' : '') + '">' +
        '<div class="cico" style="width:' + w + 'px;height:' + boxH + 'px">' +
        '<img src="' + sprUrl + '" alt="" style="width:' + spr.w * k + 'px;height:' + spr.h * k +
        'px;margin-left:' + (-x * k) + 'px;margin-top:' + (-y * k) + 'px">' +
        '</div>' + (it.name ? '<span class="cname">' + esc(it.name) + '</span>' : '') + '</div>'
    }

    var sb = Math.min(lv.sb || 0, n)
    var side = ''
    for (var i = 0; i < sb; i++) side += chip(lv.items[i], i, 30)
    var bar = ''
    for (var j = sb; j < n; j++) bar += chip(lv.items[j], j, 26)

    return '<div class="face level' + (got >= total ? ' done' : '') + '">' +
      '<div class="lvHead"><img src="assets/hdr/dino/' + lv.page + '.jpg" alt=""></div>' +
      '<div class="lvBody">' +
      '<div class="lvPicWrap"><div class="lvPic" style="aspect-ratio:' + lv.pic.w + ' / ' + lv.pic.h + '">' +
      '<img src="assets/pic/dino/' + lv.page + '.jpg" alt="">' +
      '<span class="lvBadge">' + esc(lv.name || '') + ' · 第 ' + lv.level + ' 关</span>' +
      '<span class="lvStart">' + (got ? '已找到 ' + got + '/' + total : '点这里开始找') + '</span>' +
      '</div></div>' +
      (side ? '<div class="lvSide">' + side + '</div>' : '') +
      '</div>' +
      (bar ? '<div class="lvBar">' + bar + '</div>' : '') +
      '</div>'
  }

  /** 封底 */
  function faceBack() {
    var st = window.store ? store.bookStats('dino', LEVELS.length) : { done: 0, found: 0 }
    var all = LEVELS.reduce(function (a, lv) { return a + lv.items.length }, 0)
    return '<div class="face back">' +
      '<div class="bt">— 完 —</div>' +
      '<div class="bs">' + LEVELS.length + ' 关全部翻完<br>已通关 ' + st.done + ' / ' + LEVELS.length +
      ' · 已找到 ' + st.found + ' / ' + all + ' 个物品<br><br>' +
      '点左边缘往回翻，或从目录挑一关重玩</div>' +
      '<div class="bs" style="margin-top:6px">' +
      '<button class="btn ghost small" data-act="grid">网格模式</button> ' +
      '<button class="btn ghost small" data-act="about">玩法说明</button>' +
      '</div></div>'
  }

  function faceHtml(page) {
    if (page.kind === 'cover') return faceCover()
    if (page.kind === 'toc') return faceToc()
    if (page.kind === 'back') return faceBack()
    return faceLevel(page.lv)
  }

  function labelOf(page) {
    if (page.kind === 'cover') return '封面'
    if (page.kind === 'toc') return '目录'
    if (page.kind === 'back') return '封底'
    return '第 ' + page.lv.level + ' 关'
  }

  /* ---------------------------------------------------------------- 静止页 */
  function paintLeaf(leaf, page) {
    leaf.innerHTML = page ? faceHtml(page) : ''
    leaf.style.display = page ? 'block' : 'none'
  }

  function renderResting() {
    paintLeaf(el.leafFront, PAGES[S.index])
    el.leafFront.style.opacity = 1
    el.cast.style.opacity = 0
    updateHud()
  }

  function updateHud() {
    el.pageNo.textContent = S.index + 1 + ' / ' + PAGES.length + ' · ' + labelOf(PAGES[S.index])
    el.btnPrev.disabled = S.index <= 0
    el.btnNext.disabled = S.index >= PAGES.length - 1
  }

  function sizeStage() {
    var hudH = el.hud.offsetHeight
    var availW = window.innerWidth - 16
    var availH = window.innerHeight - hudH - 24
    var ar = 587 / 791
    var w = Math.min(availW, availH * ar)
    var h = w / ar
    S.pageW = Math.floor(w)
    S.pageH = Math.floor(h)
    el.stage.style.width = S.pageW + 'px'
    el.stage.style.height = S.pageH + 'px'
    el.stage.style.marginTop = Math.round((availH - S.pageH) / 2) + 'px'
    ;[el.leafFront, el.leafBack, el.flipLayer, el.cast].forEach(function (n) {
      n.style.width = S.pageW + 'px'
      n.style.height = S.pageH + 'px'
    })
  }

  /* ---------------------------------------------------------------- 卷曲翻页 */
  /**
   * 纸面模型：一根长度 = 页宽的折线，从书脊出发等分成 STRIPS 段。
   * 第 i 段朝向 a_i = base + (i+0.5)*dphi，位置沿弧线累积；
   * base 是整页翻到哪（0 → ±0.92π），dphi 是纸有多「弯」（中间最弯、两头是平的）。
   */
  function layoutStrips(progress, dir) {
    var L = S.pageW / STRIPS
    var base = -dir * Math.PI * 0.92 * progress
    var bend = Math.sin(Math.PI * Math.min(1, Math.max(0, progress))) * BEND_MAX
    var dphi = dir * bend / STRIPS
    var x = 0, z = 0
    var segs = []
    for (var i = 0; i < STRIPS; i++) {
      var a = base + (i + 0.5) * dphi
      var cx = x + Math.cos(a) * L / 2
      var cz = z - Math.sin(a) * L / 2       // CSS 里 rotateY 把 +x 转向 -z，这里取反
      segs.push({ x: cx - L / 2, z: cz, a: a })
      x += Math.cos(a) * L
      z -= Math.sin(a) * L
    }
    return segs
  }

  function beginFlip(fromIndex, toIndex, dir) {
    S.from = fromIndex
    S.to = toIndex
    S.dir = dir
    // 底下那页 = 目标页（翻的过程中逐渐露出来）
    paintLeaf(el.leafBack, PAGES[toIndex])
    // 翻动的那一页 = 从当前页复制出来，切成条
    var face = faceHtml(PAGES[fromIndex])
    var L = S.pageW / STRIPS
    var html = ''
    for (var i = 0; i < STRIPS; i++) {
      html += '<div class="strip" data-i="' + i + '" style="width:' + L + 'px;height:' + S.pageH + 'px">' +
        '<div class="shade"></div>' +
        '<div style="position:absolute;left:' + (-i * L) + 'px;top:0;width:' + S.pageW + 'px;height:' + S.pageH + 'px">' +
        face + '</div></div>'
    }
    el.flipLayer.innerHTML = html
    el.flipLayer.style.visibility = 'visible'
    el.leafFront.style.opacity = 0
    S.strips = el.flipLayer.querySelectorAll('.strip')
    setProgress(0)
  }

  function setProgress(p) {
    S.p = Math.max(0, Math.min(1, p))
    var segs = layoutStrips(S.p, S.dir)
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i]
      var node = S.strips && S.strips[i]
      if (!node) continue
      node.style.transform = 'translate3d(' + s.x.toFixed(2) + 'px,0,' + s.z.toFixed(2) + 'px) rotateY(' +
        s.a.toFixed(4) + 'rad)'
      // 明暗：转得越多越暗，靠近弯折处的边缘再压一道
      var shade = node.querySelector('.shade')
      var away = Math.min(1, Math.abs(s.a) / (Math.PI * 0.75))
      shade.style.background =
        'linear-gradient(to right, rgba(70,50,22,' + (0.03 + away * 0.26).toFixed(3) + '), ' +
        'rgba(70,50,22,' + (0.01 + away * 0.13).toFixed(3) + ') 58%, ' +
        'rgba(255,255,255,' + (0.34 * (1 - away)).toFixed(3) + '))'
    }
    // 被翻开的页上落一道阴影
    el.cast.style.opacity = (Math.sin(Math.PI * S.p) * 0.55).toFixed(3)
  }

  function endFlip(toIndex) {
    el.flipLayer.style.visibility = 'hidden'
    el.flipLayer.innerHTML = ''
    S.strips = null
    S.index = toIndex
    S.animating = false
    renderResting()
  }

  function animFlip(fromIndex, toIndex, dir, done) {
    if (S.animating) return
    if (toIndex < 0 || toIndex >= PAGES.length) return
    S.animating = true
    beginFlip(fromIndex, toIndex, dir)
    var t0 = performance.now()
    function step(t) {
      var k = Math.min(1, (t - t0) / TURN_MS)
      var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2   // easeInOutQuad
      setProgress(e)
      if (k < 1) requestAnimationFrame(step)
      else { endFlip(toIndex); if (done) done() }
    }
    requestAnimationFrame(step)
  }

  function turn(dir) {
    var target = S.index + dir
    if (target < 0 || target >= PAGES.length) return
    animFlip(S.index, target, dir)
  }

  function jumpTo(toIndex) {
    if (toIndex === S.index || S.animating) return
    animFlip(S.index, toIndex, toIndex > S.index ? 1 : -1)
  }

  /* ---------------------------------------------------------------- 拖拽翻页 */
  /** 点在目录行 / 按钮上时不翻页、也不当"打开这一关"（那些是页内的功能） */
  function isInteractive(t) {
    return !!(t && t.closest && (t.closest('.tocItem') || t.closest('button')))
  }

  function bindDrag() {
    var drag = null
    function inZone(x) {
      var r = el.stage.getBoundingClientRect()
      var w = r.width
      if (x > r.left + w * 0.86) return 1
      if (x < r.left + w * 0.14) return -1
      return 0
    }
    el.stage.addEventListener('pointerdown', function (e) {
      if (S.animating || !el.overlay.hidden) return
      if (isInteractive(e.target)) return
      var zone = inZone(e.clientX)
      if (!zone) return
      // 边界：第一页不能再往回翻，最后一页不能再往前翻
      if (zone > 0 && S.index >= PAGES.length - 1) return
      if (zone < 0 && S.index <= 0) return
      drag = { dir: zone, x0: e.clientX, moved: false }
      beginFlip(S.index, S.index + zone, zone)
      el.stage.setPointerCapture && el.stage.setPointerCapture(e.pointerId)
    })
    el.stage.addEventListener('pointermove', function (e) {
      if (!drag) return
      var dx = (e.clientX - drag.x0) * drag.dir
      if (Math.abs(e.clientX - drag.x0) > 6) drag.moved = true
      setProgress(Math.max(0, dx / S.pageW))
    })
    function release(e) {
      if (!drag) return
      var d = drag
      drag = null
      var dx = (e.clientX - d.x0) * d.dir
      var p = Math.max(0, dx / S.pageW)
      var goOn = d.moved ? p > 0.28 : true     // 轻点 = 翻一页；拖动 = 过半才翻过去
      if (!d.moved) S.suppressClick = true     // 轻点翻页之后别再顺手把游戏打开
      if (goOn) {
        var t0 = performance.now()
        var p0 = p
        ;(function step(t) {
          var k = Math.min(1, (t - t0) / (TURN_MS * (1 - p0) * 0.9 + 60))
          setProgress(p0 + (1 - p0) * (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2))
          if (k < 1) requestAnimationFrame(step)
          else endFlip(S.index + d.dir)
        })(t0)
      } else {
        var t0b = performance.now()
        var pb = p
        ;(function step(t) {
          var k = Math.min(1, (t - t0b) / (TURN_MS * pb * 0.9 + 60))
          setProgress(pb * (1 - (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2)))
          if (k < 1) requestAnimationFrame(step)
          else endFlip(S.from)
        })(t0b)
      }
    }
    el.stage.addEventListener('pointerup', release)
    el.stage.addEventListener('pointercancel', release)
  }

  /* ---------------------------------------------------------------- 游戏浮层 */
  function openGame(level) {
    el.frame.src = 'play.html?level=' + level + '&embed=1'
    el.overlay.hidden = false
  }
  function closeGame() {
    el.overlay.hidden = true
    el.frame.src = 'about:blank'
    // 进度可能变了：重画面向用户的那一页和目录
    renderResting()
  }

  window.addEventListener('message', function (e) {
    var d = e.data || {}
    if (d.type === 'close') closeGame()
    else if (d.type === 'level') {
      // 游戏里翻到了别的关，书也跟着翻到那一页
      var i = PAGES.findIndex(function (p) { return p.kind === 'level' && p.lv.level === d.level })
      if (i >= 0 && i !== S.index) { S.index = i; renderResting() }
    } else if (d.type === 'progress') {
      updateHud()
    }
  })

  /* ---------------------------------------------------------------- 事件绑定 */
  function bindUi() {
    el.btnPrev.addEventListener('click', function () { turn(-1) })
    el.btnNext.addEventListener('click', function () { turn(1) })
    el.btnToc.addEventListener('click', function () {
      var i = PAGES.findIndex(function (p) { return p.kind === 'toc' })
      jumpTo(i)
    })
    el.btnClose && el.btnClose.addEventListener('click', closeGame)
    document.addEventListener('keydown', function (e) {
      if (!el.overlay.hidden) {
        if (e.key === 'Escape') closeGame()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); turn(1) }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); turn(-1) }
    })
    // 页内点击：目录跳关、关卡页开游戏、封底按钮
    el.stage.addEventListener('click', function (e) {
      if (S.animating || !el.overlay.hidden) return
      if (S.suppressClick) { S.suppressClick = false; return }
      var t = e.target
      var tocItem = t.closest && t.closest('.tocItem')
      if (tocItem && PAGES[S.index].kind === 'toc') {
        var lv = Number(tocItem.getAttribute('data-level'))
        var i = PAGES.findIndex(function (p) { return p.kind === 'level' && p.lv.level === lv })
        if (i >= 0) jumpTo(i)
        return
      }
      var act = t.getAttribute && t.getAttribute('data-act')
      if (act === 'grid') { location.href = 'index.html'; return }
      if (act === 'about') { location.href = 'about.html'; return }
      var page = PAGES[S.index]
      var r = el.stage.getBoundingClientRect()
      var zone = e.clientX > r.left + r.width * 0.86 || e.clientX < r.left + r.width * 0.14
      if (page.kind === 'level' && !zone && !isInteractive(t)) openGame(page.lv.level)
    })
    var rt = 0
    window.addEventListener('resize', function () {
      clearTimeout(rt)
      rt = setTimeout(function () { sizeStage(); renderResting() }, 150)
    })
  }

  /* ---------------------------------------------------------------- 启动 */
  function init() {
    sizeStage()
    // 从 URL 直接翻到某一关：book.html?level=17
    var m = /[?&]level=(\d+)/.exec(location.search)
    if (m) {
      var lv = Number(m[1])
      var i = PAGES.findIndex(function (p) { return p.kind === 'level' && p.lv.level === lv })
      if (i >= 0) S.index = i
    }
    renderResting()
    bindUi()
    bindDrag()
    // 预热：把封面/目录要用的图先加载，翻页时不闪
    ;['assets/book/cover.jpg'].forEach(function (src) { var i = new Image(); i.src = src })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()

  // 方便调试：window.__book.jumpTo(3) / window.__book.setP(0.4)
  window.__book = {
    jumpTo: jumpTo, turn: turn, setP: setProgress, state: S,
    begin: beginFlip, end: endFlip, pages: PAGES
  }
})()
