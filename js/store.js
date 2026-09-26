/**
 * 进度存储：和小程序版 utils/store.js 的结构、键名完全一致，
 * 只是把 wx.setStorageSync 换成了 localStorage —— 随时退出都会保留。
 *
 * {
 *   version: 1,
 *   books: { [bookId]: { [level]: { found: [序号...], total: n, done: bool, ts: 时间戳 } } }
 * }
 *
 * localStorage 不可用时（某些浏览器在 file:// 下会禁用）退回到内存存储：
 * 这一次打开仍然能玩，只是关掉页面进度就没了。
 */
(function () {
  var KEY = 'vc_progress_v2'
  var mem = {}

  var store = (function () {
    try {
      var t = '__vc_test__'
      window.localStorage.setItem(t, '1')
      window.localStorage.removeItem(t)
      return window.localStorage
    } catch (e) {
      return {
        getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null },
        setItem: function (k, v) { mem[k] = String(v) },
        removeItem: function (k) { delete mem[k] }
      }
    }
  })()

  function readAll() {
    try {
      var raw = store.getItem(KEY)
      if (raw) {
        var v = JSON.parse(raw)
        if (v && typeof v === 'object' && v.books) return v
      }
    } catch (e) {}
    return { version: 1, books: {} }
  }

  function writeAll(data) {
    try {
      store.setItem(KEY, JSON.stringify(data))
    } catch (e) {}
  }

  function getLevel(bookId, level) {
    var all = readAll()
    var b = all.books[bookId]
    if (!b) return null
    return b[level] || null
  }

  function getBook(bookId) {
    var all = readAll()
    return all.books[bookId] || {}
  }

  /** 记录找到一个物品；返回更新后的关卡进度 */
  function markFound(bookId, level, index, total) {
    var all = readAll()
    if (!all.books[bookId]) all.books[bookId] = {}
    var cur = all.books[bookId][level] || { found: [], total: total, done: false, ts: 0 }
    if (cur.found.indexOf(index) < 0) cur.found.push(index)
    cur.total = total
    cur.done = cur.found.length >= total
    cur.ts = Date.now()
    all.books[bookId][level] = cur
    writeAll(all)
    return cur
  }

  /** 整体覆盖某一关的进度（退出兜底用） */
  function saveLevel(bookId, level, foundIndexes, total) {
    var all = readAll()
    if (!all.books[bookId]) all.books[bookId] = {}
    var found = foundIndexes.slice().sort(function (a, b) { return a - b })
    all.books[bookId][level] = {
      found: found,
      total: total,
      done: total > 0 && found.length >= total,
      ts: Date.now()
    }
    writeAll(all)
    return all.books[bookId][level]
  }

  /** 整关重置 */
  function resetLevel(bookId, level) {
    var all = readAll()
    if (all.books[bookId]) {
      delete all.books[bookId][level]
      writeAll(all)
    }
  }

  /** 某一章的重置 */
  function resetBook(bookId) {
    var all = readAll()
    delete all.books[bookId]
    writeAll(all)
  }

  /** 全部清空 */
  function resetAll() {
    try { store.removeItem(KEY) } catch (e) {}
  }

  /** 统计一章：已通关关卡数 / 已找到的物品数 */
  function bookStats(bookId, levelCount) {
    var b = getBook(bookId)
    var done = 0
    var found = 0
    var touched = 0
    Object.keys(b).forEach(function (k) {
      var v = b[k]
      if (!v) return
      found += (v.found || []).length
      if (v.done) done++
      if ((v.found || []).length > 0) touched++
    })
    return { done: done, touched: touched, found: found, levelCount: levelCount }
  }

  /** 找到上一次玩到的关卡（用于"继续上次"） */
  function lastPlayed() {
    var all = readAll()
    var best = null
    Object.keys(all.books).forEach(function (bid) {
      Object.keys(all.books[bid]).forEach(function (lv) {
        var v = all.books[bid][lv]
        if (!v || !v.ts) return
        if (!best || v.ts > best.ts) best = { bookId: bid, level: Number(lv), ts: v.ts, done: !!v.done }
      })
    })
    return best
  }

  window.store = {
    readAll: readAll,
    getLevel: getLevel,
    getBook: getBook,
    markFound: markFound,
    saveLevel: saveLevel,
    resetLevel: resetLevel,
    resetBook: resetBook,
    resetAll: resetAll,
    bookStats: bookStats,
    lastPlayed: lastPlayed,
    persistent: store === window.localStorage
  }
})()
