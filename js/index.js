/**
 * 首页：小程序 pages/index/index.js 的网页版。
 * 封面 + 总进度 + 54 关的关卡格子（关卡号 + 恐龙名称 + 已找到 n/共 m）。
 */
(function () {
  var BOOK_ID = 'dino'

  function $(id) { return document.getElementById(id) }

  function init() {
    util.applyRpx()
    var book = window.VC_BOOK_DATA && window.VC_BOOK_DATA[BOOK_ID]
    if (!book) return showErr('缺少数据文件 js/data.js（请先运行 tools/build-web.py）')

    var prog = store.getBook(BOOK_ID)
    var foundAll = 0
    var itemAll = 0
    var levels = (book.levels || []).map(function (lv) {
      var p = prog[lv.level] || null
      var found = p && p.found ? p.found.length : 0
      var total = lv.items ? lv.items.length : 0
      foundAll += found
      itemAll += total
      return {
        level: lv.level,
        name: lv.name || '',
        total: total,
        found: found,
        pct: total ? Math.round((found / total) * 100) : 0,
        done: !!(p && p.done),
        started: found > 0 && !(p && p.done)
      }
    })
    var st = store.bookStats(BOOK_ID, levels.length)
    var last = store.lastPlayed()
    if (last && last.bookId !== BOOK_ID) last = null

    $('bookName').textContent = book.name || '恐龙'
    $('cover').src = 'assets/cvr/' + BOOK_ID + '.jpg'
    document.title = (book.name || '恐龙') + ' · 找物挑战'
    $('heroSub').textContent = '共 ' + levels.length + ' 关 · 已找到 ' + foundAll + '/' + itemAll + ' 个物品'
    $('progressFill').style.width = (levels.length ? Math.round((st.done / levels.length) * 100) : 0) + '%'
    $('heroMeta').textContent = '已通关 ' + st.done + ' / ' + levels.length + ' 关'

    var btnContinue = $('btnContinue')
    btnContinue.textContent = last ? ('继续上次：第 ' + last.level + ' 关') : '开始第 1 关'
    var goLevel = last ? last.level : 1
    btnContinue.addEventListener('click', function () { play(goLevel) })
    $('btnBook').addEventListener('click', function () { location.href = 'book.html?level=' + goLevel })
    $('btnAbout').addEventListener('click', function () { location.href = 'about.html' })

    var grid = $('grid')
    grid.innerHTML = levels.map(function (it) {
      return '<div class="lv card ' + (it.done ? 'done' : (it.started ? 'started' : '')) + '"' +
        ' data-level="' + it.level + '" role="button" tabindex="0">' +
        '<div class="lv-no">' + it.level + '</div>' +
        '<div class="lv-name">' + util.esc(it.name) + '</div>' +
        '<div class="lv-title">' + it.found + '/' + it.total + '</div>' +
        '<div class="lv-bar"><div class="lv-bar-fill" style="width:' + it.pct + '%"></div></div>' +
        '<div class="lv-meta">' + (it.done ? '<span class="tag-ok">✓ 通关</span>'
          : (it.started ? '继续' : '未开始')) + '</div>' +
        '</div>'
    }).join('')

    grid.addEventListener('click', function (e) {
      var node = e.target
      while (node && node !== grid) {
        if (node.getAttribute && node.getAttribute('data-level')) {
          play(Number(node.getAttribute('data-level')))
          return
        }
        node = node.parentNode
      }
    })
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return
      var node = e.target
      if (node.getAttribute && node.getAttribute('data-level')) {
        e.preventDefault()
        play(Number(node.getAttribute('data-level')))
      }
    })

    $('btnReset').addEventListener('click', function () {
      util.confirmDialog({
        title: '重置进度',
        body: '清空全部 ' + levels.length + ' 关的进度？',
        okText: '重置',
        danger: true
      }).then(function (ok) {
        if (!ok) return
        store.resetBook(BOOK_ID)
        location.reload()
      })
    })

    if (!store.persistent) {
      showHint('这个浏览器不允许本页保存数据（进度只在本次打开期间有效）')
    }
  }

  function play(level) {
    location.href = 'play.html?level=' + level
  }

  function showHint(msg) {
    var h = $('hint')
    h.textContent = msg
    h.hidden = false
  }

  function showErr(msg) {
    var h = $('hint')
    h.className = 'hint err'
    h.textContent = '⚠️ ' + msg
    h.hidden = false
    $('grid').hidden = true
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
