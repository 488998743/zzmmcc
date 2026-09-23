/**
 * 网页版公共工具：rpx 换算、提示条、确认框、振动。
 *
 * 小程序用 rpx 做尺寸单位（屏幕宽度的 1/750），网页上等价于 calc(N * var(--rpx))。
 * 这里把 --rpx 算好写到 :root 上：窗口宽 ≥750px 时就取 1px（等于小程序的"设计稿尺寸"），
 * 窄屏按比例缩小，所以手机上看起来和小程序一模一样，桌面上文字不会跟着屏幕一起放大。
 */
(function () {
  var PANE = 900 // 与 css/app.css 里 --pane 保持一致

  function q(sel, root) { return (root || document).querySelector(sel) }

  function appWidth() {
    var el = q('.app')
    return el ? el.clientWidth : Math.min(window.innerWidth, PANE)
  }

  function viewHeight() {
    return window.innerHeight
  }

  /** 重新计算 --rpx，返回它的像素值 */
  function applyRpx() {
    var rpx = Math.min(1, appWidth() / 750)
    document.documentElement.style.setProperty('--rpx', rpx + 'px')
    return rpx
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  /** 底部提示条，替代 wx.showToast */
  var toastEl = null
  var toastTimer = 0
  function toast(msg, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div')
      toastEl.className = 'toast'
      document.body.appendChild(toastEl)
    }
    toastEl.textContent = msg
    toastEl.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { toastEl.classList.remove('show') }, ms || 1200)
  }

  /**
   * 确认框，替代 wx.showModal：confirmDialog({title, body, okText, danger}) -> Promise<bool>
   */
  function confirmDialog(opt) {
    opt = opt || {}
    return new Promise(function (resolve) {
      var mask = document.createElement('div')
      mask.className = 'dialog'
      mask.innerHTML =
        '<div class="dialog-box">' +
        '<div class="dialog-title">' + esc(opt.title || '确认') + '</div>' +
        (opt.body ? '<div class="dialog-body">' + esc(opt.body) + '</div>' : '') +
        '<div class="dialog-btns">' +
        '<button class="btn ghost small" data-act="cancel">' + esc(opt.cancelText || '取消') + '</button>' +
        '<button class="btn ' + (opt.danger ? 'danger ' : '') + 'small" data-act="ok">' + esc(opt.okText || '确定') + '</button>' +
        '</div></div>'
      function done(v) {
        document.removeEventListener('keydown', onKey, true)
        mask.remove()
        resolve(v)
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); done(false) }
        if (e.key === 'Enter') { e.preventDefault(); done(true) }
      }
      mask.addEventListener('click', function (e) {
        var act = e.target.getAttribute && e.target.getAttribute('data-act')
        if (act === 'ok') done(true)
        if (act === 'cancel' || e.target === mask) done(false)
      })
      document.addEventListener('keydown', onKey, true)
      document.body.appendChild(mask)
      var ok = mask.querySelector('[data-act="ok"]')
      if (ok) ok.focus()
    })
  }

  /** 短振动：手机上有，桌面上没有就算了（点错的反馈还有一闪而过的圈） */
  function vibrate(kind) {
    try {
      if (navigator.vibrate) navigator.vibrate(kind === 'medium' ? 40 : 20)
    } catch (e) {}
  }

  function param(name, def) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search)
    return m ? decodeURIComponent(m[1]) : (def === undefined ? '' : def)
  }

  window.util = {
    appWidth: appWidth,
    viewHeight: viewHeight,
    applyRpx: applyRpx,
    esc: esc,
    toast: toast,
    confirmDialog: confirmDialog,
    vibrate: vibrate,
    param: param
  }
})()
