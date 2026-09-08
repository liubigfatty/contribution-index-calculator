/* web-index/app.js — 平均缴费指数计算器 · 网站版前端逻辑
 * 忠实镜像 index-mini（input → calcIndex 引擎 → result），
 * 全部在浏览器端计算，无后端依赖。 */
(function () {

  const PROVINCES = [
    { slug: 'beijing', name: '北京市' },
    { slug: 'tianjin', name: '天津市' },
    { slug: 'hebei', name: '河北省' },
    { slug: 'shanxi', name: '山西省' },
    { slug: 'neimenggu', name: '内蒙古自治区' },
    { slug: 'liaoning', name: '辽宁省' },
    { slug: 'jilin', name: '吉林省' },
    { slug: 'heilongjiang', name: '黑龙江省' },
    { slug: 'shanghai', name: '上海市' },
    { slug: 'jiangsu', name: '江苏省' },
    { slug: 'zhejiang', name: '浙江省' },
    { slug: 'anhui', name: '安徽省' },
    { slug: 'fujian', name: '福建省' },
    { slug: 'jiangxi', name: '江西省' },
    { slug: 'shandong', name: '山东省' },
    { slug: 'henan', name: '河南省' },
    { slug: 'hubei', name: '湖北省' },
    { slug: 'hunan', name: '湖南省' },
    { slug: 'guangdong', name: '广东省' },
    { slug: 'guangxi', name: '广西壮族自治区' },
    { slug: 'hainan', name: '海南省' },
    { slug: 'chongqing', name: '重庆市' },
    { slug: 'sichuan', name: '四川省' },
    { slug: 'guizhou', name: '贵州省' },
    { slug: 'yunnan', name: '云南省' },
    { slug: 'xizang', name: '西藏自治区' },
    { slug: 'shaanxi', name: '陕西省' },
    { slug: 'gansu', name: '甘肃省' },
    { slug: 'qinghai', name: '青海省' },
    { slug: 'ningxia', name: '宁夏回族自治区' },
    { slug: 'xinjiang', name: '新疆维吾尔自治区' }
  ]

  const $ = (id) => document.getElementById(id)

  // ── 隐私合规门禁（P0-3）──
  const PRIVACY_KEY = 'web_index_privacy_agreed'
  function isPrivacyAgreed() {
    try { return localStorage.getItem(PRIVACY_KEY) === '1' } catch (e) { return false }
  }
  function setPrivacyAgreed() {
    try { localStorage.setItem(PRIVACY_KEY, '1') } catch (e) {}
  }
  function applyPrivacyGate() {
    const bar = $('privacyBar')
    const btn = $('calcBtn')
    if (isPrivacyAgreed()) {
      bar.style.display = 'none'
      btn.disabled = false
      btn.classList.remove('disabled')
    } else {
      bar.style.display = 'flex'
      btn.disabled = true
      btn.classList.add('disabled')
    }
  }
  $('privacyAgree').addEventListener('click', () => {
    setPrivacyAgreed()
    applyPrivacyGate()
    toast('已同意，可以开始计算')
  })
  // 首次进入展示同意条幅，并禁用计算按钮
  applyPrivacyGate()

  // 各参保地逐省规则（来自 calc-index.js 的 PROVINCE_RULES）
  function getRule(slug) {
    try { return window.CalcIndex.PROVINCE_RULES[slug] || null } catch (e) { return null }
  }

  // 填充省份下拉
  const provinceSel = $('province')
  PROVINCES.forEach((p) => {
    const o = document.createElement('option')
    o.value = p.slug
    o.textContent = p.name
    provinceSel.appendChild(o)
  })
  provinceSel.value = 'jilin' // 默认吉林（与小程序 provIndex:6 一致）

  let yearlyList = []

  provinceSel.addEventListener('change', () => {
    const slug = provinceSel.value
    const hint = $('gapHint')
    const deemedHint = $('deemedHint')
    const rule = getRule(slug)
    // 广东城市选择（D值查表 + 深圳独立社平）
    const gdField = $('gdCityField')
    if (slug === 'guangdong') {
      gdField.style.display = 'block'
    } else {
      gdField.style.display = 'none'
      $('gdCity').value = ''
    }
    // 浙/苏/赣 分段视同指数：需视同起始年
    const dsField = $('deemedStartField')
    if (slug === 'zhejiang' || slug === 'jiangsu' || slug === 'jiangxi') {
      dsField.style.display = 'block'
      const label = { zhejiang: '浙江：1992年底前替代指数≈1.279（温州1.1），1993年起1.0', jiangsu: '江苏：1985.6前=1.0、1985.7-1991分段联动', jiangxi: '江西：1992.9前=1.0、1992.10-1995.9按设区市/全省比' }[slug]
      $('deemedStartHint').textContent = label + '——填写视同起始年以精确取分段值。'
    } else {
      dsField.style.display = 'none'
    }
    // 断缴年处理提示（逐省：gapZero记0 / gapFloor记0.6 / 其余跳过）
    if (rule && (rule.gapZero || rule.gapFloor)) {
      const name = PROVINCES.find((p) => p.slug === slug).name
      const v = rule.gapZero ? 0 : rule.gapFloor
      hint.textContent =
        '提示：' + name + '执行“断缴年份按指数' + v + '计入平均指数”规则——中间断缴的年份会按指数' + v + '计入分母，请如实逐年填写。'
      hint.style.display = 'block'
    } else {
      hint.style.display = 'none'
    }
    if (rule) {
      if (rule.deemedInDenom) {
        deemedHint.textContent = '该省将视同缴费年限计入平均指数分母（指数默认1.0，广东查表/浙江替代指数等特例已内置），请填写上方视同年限。'
        deemedHint.style.display = 'block'
      } else {
        deemedHint.textContent = '该省视同缴费年限不计入平均指数分母（仅用于养老金年限计算），可不填或填0。'
        deemedHint.style.display = 'block'
      }
    } else {
      deemedHint.style.display = 'none'
    }
  })

  $('startDate').addEventListener('change', () => genYearly(true))

  // 生成逐年清单（从首次缴费年铺到今年，去掉截止年也覆盖全部应缴年）
  function genYearly(silent) {
    const sd = $('startDate').value // 形如 "1995-07"
    if (!sd) {
      if (!silent) toast('请先选择首次缴费年月')
      return
    }
    const [sy, sm] = sd.split('-').map(Number)
    const ey = new Date().getFullYear()
    if (sy > ey) {
      if (!silent) toast('起始年不能晚于今年')
      return
    }
    // 保留已填的月均基数，避免重生成时清空
    const oldMap = {}
    yearlyList.forEach((r) => {
      if (r.year && r.baseAvg !== '' && r.baseAvg != null) oldMap[r.year] = r.baseAvg
    })
    const rows = []
    let y = sy
    while (y <= ey) {
      const months = y === sy ? (sm > 1 ? 13 - sm : 12) : 12
      rows.push({ year: y, months: months, baseAvg: oldMap[y] !== undefined ? oldMap[y] : '' })
      y += 1
    }
    yearlyList = rows
    renderYearly()
    $('yearlyWrap').style.display = 'block'
    if (!silent) toast('已生成 ' + rows.length + ' 行')
  }

  function renderYearly() {
    const box = $('yearlyRows')
    box.innerHTML = ''
    yearlyList.forEach((r, idx) => {
      const tr = document.createElement('div')
      tr.className = 'tr'
      tr.innerHTML =
        '<span class="c1 yr-year">' + r.year + '年</span>' +
        '<input class="c2 yr-months" type="number" min="0" max="12" value="' + r.months + '" data-idx="' + idx + '" data-sub="months">' +
        '<input class="c3 yr-base" type="number" step="0.01" placeholder="如4980" value="' + r.baseAvg + '" data-idx="' + idx + '" data-sub="baseAvg">'
      box.appendChild(tr)
      tr.querySelector('.yr-months').addEventListener('input', onYearlyInput)
      tr.querySelector('.yr-base').addEventListener('input', onYearlyInput)
    })
  }

  function onYearlyInput(e) {
    const idx = Number(e.target.dataset.idx)
    const sub = e.target.dataset.sub
    yearlyList[idx][sub] = e.target.value
  }

  $('genBtn').addEventListener('click', () => genYearly(false))

  $('calcBtn').addEventListener('click', () => {
    // 隐私合规门禁：未同意前不应触发（按钮已禁用，此处兜底）
    if (!isPrivacyAgreed()) {
      applyPrivacyGate()
      toast('请先点击“同意”《隐私保护指引》')
      return
    }
    const slug = provinceSel.value
    const sd = $('startDate').value
    if (!sd) {
      toast('请选择首次缴费年月')
      return
    }
    if (yearlyList.length === 0) {
      toast('请先生成逐年清单')
      return
    }
    // 所有年份行（含空行/断缴年）。空行 baseAvg=0，由引擎按省份规则决定是否计入分母
    const yearlyData = yearlyList
      .filter((r) => Number(r.year) > 0 && Number(r.months) > 0)
      .map((r) => ({ year: Number(r.year), months: Number(r.months), baseAvg: Number(r.baseAvg) || 0 }))

    if (!yearlyData.some((r) => r.baseAvg > 0)) {
      toast('请至少填写一年的月均缴费基数')
      return
    }

    const provinceConfig = window.INDEX_PROVINCES[slug]
    const deemedYears = Number($('deemedYears').value) || 0
    const deemedStartYear = Number($('deemedStartYear').value) || null
    const city = slug === 'guangdong' ? ($('gdCity').value || null) : null
    const fwd = window.CalcIndex.calculateIndex({
      provinceConfig: provinceConfig,
      provinceCode: slug,
      contribution: yearlyData,
      granularity: 'A',
      deemedYears: deemedYears,
      deemedStartYear: deemedStartYear,
      city: city
    })
    if (fwd.error) {
      toast(fwd.error)
      return
    }
    renderResult(fwd)
  })

  function renderResult(fwd) {
    $('avgIndex').textContent = fwd.avgIndex.toFixed(4)
    $('accountBalance').textContent =
      '¥' + fwd.accountBalance.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    $('totalMonths').textContent = fwd.totalMonths + ' 个月（' + (fwd.totalYears || 0).toFixed(1) + ' 年）'

    const meta = fwd._meta || {}
    const gapNote = $('gapNote')
    if (meta.gapYearCountsInAvg && meta.gapYears > 0) {
      gapNote.textContent =
        '您选择的' + (meta.province || '该地区') +
        '执行“断缴年份按指数0计入平均指数”规则：本次有 ' + meta.gapYears +
        ' 个断缴年份已计入分母，平均指数因此被拉低。'
      gapNote.style.display = 'block'
    } else {
      gapNote.style.display = 'none'
    }

    // 过渡性指数（双指数/双基数省）
    const transRow = $('transRow')
    const transIdx = $('transIndex')
    if (fwd.transIndex != null && fwd.transIndex > 0) {
      transRow.style.display = 'flex'
      transIdx.textContent = fwd.transIndex.toFixed(4)
    } else {
      transRow.style.display = 'none'
    }

    // 视同年 / 城市 D 值提示
    const deemedNote = $('deemedNote')
    let dParts = []
    if (meta.deemedInDenom && meta.deemedYears > 0) {
      dParts.push('已按' + (meta.province || '该省') + '规则将 ' + meta.deemedYears + ' 年视同缴费计入平均指数分母（指数默认1.0，特例省按省规）')
    } else if (meta.deemedInDenom && meta.deemedYears === 0) {
      dParts.push('该省视同年计入指数分母，但您未填写视同缴费年限；如有视同年限请填写以得准确结果')
    }
    if (meta.city) {
      const dval = (window.CalcIndex.GUANGDONG_SIGHT_INDEX_MAP && window.CalcIndex.GUANGDONG_SIGHT_INDEX_MAP[meta.city.replace(/市$/, '')]) || 1.0
      dParts.push('广东省「' + meta.city + '」视同缴费指数(D)按粤府函〔2021〕294号 查表 = ' + dval + (meta.city === '深圳' ? '，分母用深圳独立社平' : ''))
    }
    if (meta.deemedStartYear && (meta.provinceCode === 'zhejiang' || meta.provinceCode === 'jiangsu' || meta.provinceCode === 'jiangxi')) {
      dParts.push('已用视同起始年 ' + meta.deemedStartYear + ' 取分段视同指数')
    }
    if (dParts.length > 0) {
      deemedNote.textContent = dParts.join('；') + '。'
      deemedNote.style.display = 'block'
    } else {
      deemedNote.style.display = 'none'
    }

    const box = $('detailRows')
    box.innerHTML = ''
    ;(fwd.yearsDetail || [])
      .filter((y) => y.index !== null && y.index !== undefined)
      .forEach((y) => {
        const tr = document.createElement('div')
        tr.className = 'tr'
        tr.innerHTML =
          '<span class="c1">' + y.year + '</span>' +
          '<span class="c2">' + y.months + '</span>' +
          '<span class="c3">' + (y.baseAvg || 0).toFixed(0) + '</span>' +
          '<span class="c4">' + y.index.toFixed(4) + '</span>' +
          '<span class="c5">¥' + (y.balanceAfterYear || 0).toFixed(2) + '</span>'
        box.appendChild(tr)
      })

    $('result').style.display = 'block'
    $('result').scrollIntoView({ behavior: 'smooth' })
  }

  // 轻量 toast
  let toastTimer = null
  function toast(msg) {
    const t = $('toast')
    t.textContent = msg
    t.classList.add('show')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200)
  }
})()
