/** 说明页：玩法 + 快捷键 + 关卡资源说明 + 清空进度 */
(function () {
  function $(id) { return document.getElementById(id) }

  function init() {
    util.applyRpx()
    var book = window.VC_BOOK_DATA && window.VC_BOOK_DATA.dino
    if (book) $('total').textContent = (book.levels || []).length

    $('btnReset').addEventListener('click', function () {
      var n = book ? (book.levels || []).length : 54
      util.confirmDialog({
        title: '清空所有进度',
        body: '这会删除 ' + n + ' 关的全部闯关进度，确定吗？',
        okText: '清空',
        danger: true
      }).then(function (ok) {
        if (!ok) return
        store.resetAll()
        util.toast('进度已清空', 1400)
      })
    })

    $('btnBack').addEventListener('click', function () {
      if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) history.back()
      else location.href = 'index.html'
    })
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init)
  else init()
})()
