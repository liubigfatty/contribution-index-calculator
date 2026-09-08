// AUTO-GENERATED from source — 请勿手改，改源码后重跑 scripts/build-web-index.js
window.CalcIndex = (function () {
  const module = { exports: {} };
/**
 * ════════════════════════════════════════════════════════
 *  calcIndex — 本人平均缴费工资指数计算引擎（逐省一致版 v2）
 *  版本: 2.1.1 | 2026-08-15
 *
 *  功能:
 *    正向: 缴费信息 + 省规 → 平均指数(avgIndex) + 过渡指数(transIndex) + 个人账户余额
 *    反推: 账户余额 + 缴费信息 → 反推平均指数
 *    支持: 三颗粒度输入 (A详细/B中等/C最简)
 *
 *  逐省一致（依据 docs/08 矩阵 09 + 规则 06 v2，四方印证官网）：
 *    D1 分母口径社平：默认上年度社平；陕西/西藏=当年社平
 *    D2 视同年进指数分母：20省进 / 11省不进（逐省开关）
 *    D3 双指数/双基数：京/津/晋/苏/吉=真双指数(transIndex独立)；辽/吉=双基数加权
 *    D4 视同指数：默认1.0；广东查表；浙江替代指数；江苏/江西分段
 *    D5 封顶保底：默认[0.6,3.0]；沪分段保底；渝上限分段；桂建账前<1按1
 *    D6 断缴计入分母：京/津/陕/浙/云(GAP_ZERO,记0)；黑龙江(gapFloor=0.6,记0.6)
 *
 *  数据源:
 *    - 利率表: UNIFIED_RATES (1996-2025, 剪刀财经)
 *    - 社平工资: 省份 config.avg_salary_history
 *
 *  依赖: 无 (纯函数, Node.js / 浏览器均可运行)
 * ════════════════════════════════════════════════════════
 */

// ─── 统一利率表（1996-2025，剪刀财经《缴费基数&记账利率》）──>
const UNIFIED_RATES = {
  1996: 0.0804, 1997: 0.0567, 1998: 0.0447, 1999: 0.0225, 2000: 0.0225,
  2001: 0.0225, 2002: 0.0225, 2003: 0.0198, 2004: 0.0198, 2005: 0.0225,
  2006: 0.0252, 2007: 0.0414, 2008: 0.0414, 2009: 0.0225, 2010: 0.0225,
  2011: 0.0350, 2012: 0.0350, 2013: 0.0300, 2014: 0.0350, 2015: 0.0350,
  2016: 0.0831, 2017: 0.0712, 2018: 0.0829, 2019: 0.0761, 2020: 0.0604,
  2021: 0.0535, 2022: 0.0612, 2023: 0.0397, 2024: 0.0262, 2025: 0.0150
}

/**
 * 获取某年记账利率
 */
function getRate(year) {
  if (UNIFIED_RATES[year] !== undefined) return UNIFIED_RATES[year]
  if (year > 2025) return UNIFIED_RATES[2025]  // 1.50%
  return 0.025  // 兜底
}

/**
 * 获取某年社平工资（元/月）
 * @param {Object} avgSalaryHistory - 省份的 avg_salary_history 对象 { year: 元/月 }
 * @param {number} year - 年份
 * @returns {number|null}
 */
function getSocialAvg(avgSalaryHistory, year) {
  if (!avgSalaryHistory || !avgSalaryHistory[year]) return null
  return avgSalaryHistory[year]
}

// ════════════════════════════════════════════════════════
//  逐省规则表（依据 09 矩阵 + 06 v2，四方印证官网查实）
//  字段说明：
//    denom:        'prev' 上年度社平(29省) | 'current' 当年社平(陕/藏)
//    deemedInDenom:true=视同年进指数分母(20省) | false=不进(11省)
//    deemedIndex:  '1.0' 默认 | 'table_gd' 广东查表 | 'replace_zj' 浙江替代指数
//                  | 'segmented_js' 江苏分段 | 'segmented_jx' 江西分段
//    cap:          'default'[0.6,3.0] | 'shanghai' | 'chongqing' | 'guangxi'
//    dualIndex:    false | 'trans'(京/津/晋/苏/吉) | 'dualBase'(辽/吉)
//    gapZero:      true=断缴年计入分母指数记0(京/津/陕/浙/云)
//    gapFloor:     number=断缴年计入分母指数记该值(黑龙江=0.6)；null=不启用
//    accountStart: 建账年月(YYYY-MM)，用于建账前特殊处理
// ════════════════════════════════════════════════════════
const PROVINCE_RULES = {
  beijing:    { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: 'trans',    gapZero: true,  accountStart: '1992-10' },
  tianjin:    { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: 'trans',    gapZero: true,  accountStart: '1994-10' },
  hebei:      { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  shanxi:     { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: 'trans',    gapZero: false, accountStart: '1997-07' },
  neimenggu:  { denom: 'prev',    deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1998-01' },
  liaoning:   { denom: 'prev',    deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: 'dualBase', gapZero: false, accountStart: '1996-01' },
  jilin:      { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: 'dualBase', gapZero: false, accountStart: '1995-07' },
  heilongjiang:{ denom: 'prev',   deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, gapFloor: 0.6, accountStart: '1996-01' },
  shanghai:   { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'shanghai', dualIndex: false,      gapZero: false, accountStart: '1993-01' },
  jiangsu:    { denom: 'prev',    deemedInDenom: true,  deemedIndex: 'segmented_js', cap: 'default',   dualIndex: 'trans',    gapZero: false, accountStart: '1996-01' },
  zhejiang:   { denom: 'prev',    deemedInDenom: true,  deemedIndex: 'replace_zj',   cap: 'default',   dualIndex: false,      gapZero: true,  accountStart: '1998-01' },
  anhui:      { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  fujian:     { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  jiangxi:    { denom: 'prev',    deemedInDenom: true,  deemedIndex: 'segmented_jx', cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1995-10' },
  shandong:   { denom: 'prev',    deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  henan:      { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1995-01' },
  hubei:      { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  hunan:      { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1995-10' },
  guangdong:  { denom: 'prev',    deemedInDenom: true,  deemedIndex: 'table_gd',     cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1998-07' },
  guangxi:    { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'guangxi',  dualIndex: false,      gapZero: false, accountStart: '1996-07' },
  hainan:     { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1998-01' },
  chongqing:  { denom: 'prev',    deemedInDenom: false, deemedIndex: '1.0',          cap: 'chongqing',dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  sichuan:    { denom: 'prev',    deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  guizhou:    { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1998-01' },
  yunnan:     { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: true,  accountStart: '1995-10' },
  xizang:     { denom: 'current', deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '2000-07' },
  shaanxi:    { denom: 'current', deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: true,  accountStart: '1996-01' },
  gansu:      { denom: 'prev',    deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  qinghai:    { denom: 'prev',    deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  ningxia:    { denom: 'prev',    deemedInDenom: true,  deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' },
  xinjiang:   { denom: 'prev',    deemedInDenom: false, deemedIndex: '1.0',          cap: 'default',   dualIndex: false,      gapZero: false, accountStart: '1996-01' }
}

const DEFAULT_RULE = { denom: 'prev', deemedInDenom: false, deemedIndex: '1.0', cap: 'default', dualIndex: false, gapZero: false, gapFloor: null, accountStart: '1996-01' }

/**
 * 广东视同缴费指数查表（粤府函〔2014〕294 附表，D值）。
 * 计算器未强制要求市，注入 city 时优先查表，否则按 1.0 计（主引擎 transIndex 走同表）。
 */
// 广东省1993年底前"视同缴费指数"查表（粤府函〔2021〕294号 附表一、二）
// 来源：主引擎 cloudfunctions/calculate/provinces/guangdong.js GUANGDONG_SIGHT_INDEX_MAP
// 键：地级市"平均"行 D 值（与1994年统计年鉴口径一致）。未选市默认全省=1.000。
// 深圳参保人另取独立社平（见 resolveSalaryHist），此处 D 值也用深圳平均 1.529。
const GUANGDONG_SIGHT_INDEX_MAP = {
  '全省': 1.000, '省直': 1.327, '省农垦': 0.610,
  '广州': 1.191, '广州市': 1.191,
  '深圳': 1.529, '深圳市': 1.529,
  '珠海': 1.389, '珠海市': 1.389,
  '汕头': 0.821, '汕头市': 0.821,
  '韶关': 0.836, '韶关市': 0.836,
  '河源': 0.512, '河源市': 0.512,
  '梅州': 0.638, '梅州市': 0.638,
  '惠州': 0.961, '惠州市': 0.961,
  '汕尾': 0.584, '汕尾市': 0.584,
  '东莞': 1.169, '东莞市': 1.169,
  '中山': 0.963, '中山市': 0.963,
  '江门': 1.066, '江门市': 1.066,
  '佛山': 1.304, '佛山市': 1.304,
  '阳江': 0.678, '阳江市': 0.678,
  '湛江': 0.742, '湛江市': 0.742,
  '茂名': 0.712, '茂名市': 0.712,
  '肇庆': 0.761, '肇庆市': 0.761,
  '云浮': 0.902, '云浮市': 0.902,
  '清远': 0.725, '清远市': 0.725,
  '潮州': 0.602, '潮州市': 0.602,
  '揭阳': 0.546, '揭阳市': 0.546
}

/**
 * 解析省份社平历史：兼容扁平 {year:value} 与嵌套（广东等）{prov:{...}, shenzhen:{...}}。
 * 嵌套时，city=深圳/广州 选对应市子集；其余（含 undefined）默认 prov（全省）。
 */
function resolveSalaryHist(avgSalaryHistory, city) {
  if (!avgSalaryHistory) return {}
  if (avgSalaryHistory.prov) {
    let sub = avgSalaryHistory.prov
    if (city) {
      const c = String(city).replace(/市$/, '')
      if (avgSalaryHistory[c]) sub = avgSalaryHistory[c]
      else if (avgSalaryHistory[c + '市']) sub = avgSalaryHistory[c + '市']
    }
    return sub
  }
  return avgSalaryHistory
}

// ─── 规则辅助函数 ───

function parseAccountStartYear(accountStart) {
  if (!accountStart) return 1996
  const y = parseInt(String(accountStart).split('-')[0], 10)
  return isNaN(y) ? 1996 : y
}

/**
 * D1 分母口径：上年社平（默认）或当年社平（陕/藏）
 */
function getDenominator(rule, salaryHist, year) {
  if (rule.denom === 'current') {
    return getSocialAvg(salaryHist, year) // 当年
  }
  const prev = getSocialAvg(salaryHist, year - 1) // 上年
  if (prev && prev > 0) return prev
  return getSocialAvg(salaryHist, year) // 兜底：上年缺则当年
}

/**
 * D5 封顶保底
 */
function applyCap(rule, rawIdx, year, accountStartYear) {
  if (rule.cap === 'shanghai') {
    const floor = shanghaiFloor(year)
    return Math.min(3.0, Math.max(floor, rawIdx))
  }
  if (rule.cap === 'chongqing') {
    // 指数上限 1993-1997 为 2；1998 后为 3
    const max = (year >= 1993 && year <= 1997) ? 2.0 : 3.0
    return Math.min(max, Math.max(0.6, rawIdx))
  }
  if (rule.cap === 'guangxi') {
    // 建账前实际年：指数<1 按 1 计
    if (year < accountStartYear && rawIdx < 1) return Math.min(3.0, Math.max(1.0, rawIdx))
    return Math.min(3.0, Math.max(0.6, rawIdx))
  }
  // 默认 [0.6, 3.0]
  return Math.min(3.0, Math.max(0.6, rawIdx))
}

/**
 * 上海分段保底：93-2011 年 <1 按 1；2012 年 ≥0.85；2013 年 ≥0.75；其余 ≥0.6
 */
function shanghaiFloor(year) {
  if (year >= 1993 && year <= 2011) return 1.0
  if (year === 2012) return 0.85
  if (year === 2013) return 0.75
  return 0.6
}

/**
 * D4 视同指数取值
 */
function getDeemedIndexValue(rule, year, opts) {
  opts = opts || {}
  switch (rule.deemedIndex) {
    case 'replace_zj': // 浙江替代指数：1992.12前≈1.279(温州1.1)，1993.1后=1.0
      if (year <= 1992) return opts.city === '温州' ? 1.1 : (opts.zhejiangReplace || 1.279)
      return 1.0
    case 'segmented_js': // 江苏：1985.6前=1.0；1985.7-1991 按A段联动(近似1.0)
      if (year < 1985) return 1.0
      if (year <= 1991) return opts.jiangsuARatio || 1.0
      return 1.0
    case 'segmented_jx': // 江西：1992.9前=1.0；1992.10-1995.9 按设区市/全省比
      if (year < 1992) return 1.0
      if (year <= 1995) return opts.jiangxiRatio || 1.0
      return 1.0
    case 'table_gd': // 广东查表
      if (opts.sightIndexMap && opts.city) {
        const c = String(opts.city).replace(/市$/, '')
        return opts.sightIndexMap[c] || opts.sightIndexMap[c + '市'] || opts.sightIndexMap[opts.city] || 1.0
      }
      return 1.0
    default:
      return 1.0
  }
}

/**
 * D2 视同年并入指数分母：按年累加视同指数×12
 */
function getDeemedSum(rule, deemedYears, deemedStartYear, opts) {
  if (!deemedYears || deemedYears <= 0) return { sum: 0, weight: 0 }
  const weight = deemedYears * 12
  // 广东查表：D 值按城市固定（年份无关），直接用城市 D 值累乘
  if (rule.deemedIndex === 'table_gd') {
    const d = getDeemedIndexValue(rule, deemedStartYear || 1990, opts)
    return { sum: d * weight, weight }
  }
  const periodBased = (rule.deemedIndex === 'replace_zj' || rule.deemedIndex === 'segmented_js' || rule.deemedIndex === 'segmented_jx')
  if (periodBased && deemedStartYear) {
    let sum = 0
    for (let i = 0; i < deemedYears; i++) {
      const y = deemedStartYear + i
      sum += getDeemedIndexValue(rule, y, opts) * 12
    }
    return { sum, weight }
  }
  // 默认 1.0（含分段省但未提供起始年）
  return { sum: 1.0 * weight, weight }
}

// ════════════════════════════════════════════════════════
//  核心计算函数
// ════════════════════════════════════════════════════════

/**
 * 正向计算：缴费信息 + 省规 → 平均指数(avgIndex) + 过渡指数(transIndex) + 个人账户余额
 *
 * @param {Object} params
 * @param {Object} params.provinceConfig - 省份配置（需含 avg_salary_history）
 * @param {string} params.provinceCode - 省份代码（slug，如 'beijing'），驱动逐省规则
 * @param {Array|Object} params.contribution - 缴费记录（三颗粒度之一）
 * @param {string} params.granularity - 'A'详细(逐月) / 'B'中等(年汇总+部分明细) / 'C'最简(仅起止)
 * @param {number} [params.deemedYears] - 视同缴费年限（年），进分母省用于指数计算
 * @param {number} [params.deemedStartYear] - 视同起始年（用于浙江/江苏/江西分段取值）
 * @param {string} [params.city] - 地市（广东查表用）
 * @param {boolean} [params.gapYearCountsInAvg] - 覆盖开关（默认由省规 gapZero 决定）
 * @returns {Object} { avgIndex, transIndex, accountBalance, totalMonths, totalYears, yearsDetail }
 */
function calculateIndex({ provinceConfig, provinceCode, contribution, granularity = 'A', deemedYears = 0, deemedStartYear = null, city = null, gapYearCountsInAvg = null }) {
  const salaryHist = resolveSalaryHist(provinceConfig.avg_salary_history, city)
  const rule = PROVINCE_RULES[provinceCode] || DEFAULT_RULE
  const gapZero = (gapYearCountsInAvg != null) ? gapYearCountsInAvg : rule.gapZero
  const gapFloor = rule.gapFloor || null
  const accountStartYear = parseAccountStartYear(rule.accountStart)
  const opts = { city, sightIndexMap: GUANGDONG_SIGHT_INDEX_MAP }

  // ── C 颗粒度无基数数据，正向无法计算 ──>
  if (granularity === 'C') {
    return {
      error: 'C 颗粒度（最简）仅支持反推模式。请切换到"反推"模式并填写账户余额，或改用 A/B 颗粒度输入逐年缴费基数。',
      code: 'C_GRANULARITY_FORWARD_NOT_SUPPORTED'
    }
  }

  // ── 根据颗粒度解析为统一年记录格式 ──>
  const yearlyRecords = normalizeToYearly(contribution, granularity)

  if (!yearlyRecords || yearlyRecords.length === 0) {
    return { error: '无有效缴费数据' }
  }

  let totalIndexSum = 0      // 实际缴费年指数加权和（GAP_ZERO 省含断缴年记0）
  let totalWeight = 0         // 总权重（月数）
  let accountBalance = 0      // 个人账户余额（复利累计）
  const yearsDetail = []       // 逐年明细

  // 按年份排序
  yearlyRecords.sort((a, b) => a.year - b.year)

  // 首次有缴费的年份（用于断缴判定：自首次缴费年起的空年均计入「应缴费年限」分母）
  const contribYears = yearlyRecords.filter(r => r.baseAvg > 0).map(r => r.year)
  const firstContribYear = contribYears.length ? Math.min(...contribYears) : null

  for (const rec of yearlyRecords) {
    const year = rec.year

    // ── 断缴/空年处理 ──>
    if (rec.baseAvg <= 0) {
      const gapSocial = getSocialAvg(salaryHist, year)
      const isGapYear = firstContribYear != null && year >= firstContribYear
      // D6 断缴年处理：gapZero→记0(京/津/陕/浙/云)；gapFloor→记0.6(黑龙江)；其余→跳过
      const gapValue = gapZero ? 0 : (gapFloor != null ? gapFloor : null)
      if (isGapYear && gapSocial && gapSocial > 0 && gapValue !== null) {
        // 断缴年计入平均指数分母（指数记 gapValue），已有余额照常计息
        const grate = getRate(year)
        accountBalance = accountBalance * (1 + grate)
        totalIndexSum += gapValue * rec.months
        totalWeight += rec.months
        yearsDetail.push({
          year, months: rec.months, baseAvg: 0,
          socialAvg: getDenominator(rule, salaryHist, year), index: gapValue, weightedIndex: gapValue * rec.months, rate: grate,
          accountContribution: 0, balanceAfterYear: accountBalance, gap: true, gapCounted: true
        })
      } else {
        const note = (gapSocial && gapSocial > 0)
          ? (gapValue !== null
              ? (year >= firstContribYear ? '断缴年份（计入平均指数，指数记' + gapValue + '）' : '未缴费年度（首次缴费年前，不计入）')
              : '断缴年份（不计入平均指数）')
          : '缺少' + year + '年社平'
        yearsDetail.push({
          year, months: rec.months, baseAvg: 0,
          socialAvg: (gapSocial && gapSocial > 0) ? getDenominator(rule, salaryHist, year) : null,
          index: null, gap: true, skipped: true,
          note
        })
      }
      continue
    }

    // ── D1 分母：上年/当年社平 ──>
    const socialAvg = getDenominator(rule, salaryHist, year)

    if (!socialAvg || socialAvg <= 0) {
      yearsDetail.push({
        year, months: rec.months, baseAvg: rec.baseAvg,
        socialAvg: null, index: null,
        accountContribution: 0, note: `缺少${year}年社平`
      })
      continue
    }

    // ── 计算该年平均缴费指数 + D5 封顶保底 ──>
    const yearIndexRaw = rec.baseAvg / socialAvg
    const yearIndex = applyCap(rule, yearIndexRaw, year, accountStartYear)

    // 加权累加（权重=该年月数）
    totalIndexSum += yearIndex * rec.months
    totalWeight += rec.months

    // ── 计算个人账户本年计入金额（用实际基数，不受封顶影响）──>
    const annualAccountPay = rec.baseAvg * rec.months * 0.08
    const rate = getRate(year)
    accountBalance = accountBalance * (1 + rate) + annualAccountPay

    yearsDetail.push({
      year,
      months: rec.months,
      baseAvg: rec.baseAvg,
      socialAvg,
      index: yearIndex,
      weightedIndex: yearIndex * rec.months,
      rate,
      accountContribution: annualAccountPay,
      balanceAfterYear: accountBalance
    })
  }

  // ── D2 平均指数：视同年逐省开关 ──>
  let avgIndex
  if (rule.deemedInDenom && deemedYears > 0) {
    const { sum: deemedSum, weight: deemedWeight } = getDeemedSum(rule, deemedYears, deemedStartYear, opts)
    avgIndex = (totalIndexSum + deemedSum) / (totalWeight + deemedWeight)
  } else {
    avgIndex = totalWeight > 0 ? totalIndexSum / totalWeight : 0
  }

  // ── D3 过渡指数 transIndex（双指数/双基数省另算，供主程序过渡性公式）──
  let transIndex = null
  if (rule.dualIndex === 'trans' || rule.dualIndex === 'dualBase') {
    // 基础 avgIndex 已含视同(进省)或仅实缴(不进省)；过渡性指数按省规独立，
    // 此处以 avgIndex 作为可用近似（吉/辽双基数加权需市州基数，计算器按全省近似）。
    transIndex = avgIndex
  }

  // 总年限（月数÷12，保留精度）
  const totalMonths = totalWeight
  const totalYears = totalMonths / 12

  return {
    avgIndex: round4(avgIndex),
    transIndex: transIndex != null ? round4(transIndex) : null,
    accountBalance: Math.round(accountBalance * 100) / 100,
    totalMonths,
    totalYears: round2(totalYears),
    yearsDetail,
    _meta: {
      granularity,
      province: provinceConfig.name || provinceCode || 'unknown',
      provinceCode: provinceCode || null,
      city: city || null,
      rule,
      rateSource: '剪刀财经 UNIFIED_RATES 1996-2025',
      gapZero,
      gapFloor: gapFloor,
      gapYears: yearsDetail.filter(y => y.gap && !y.skipped).length,
      deemedYears: deemedYears || 0,
      deemedStartYear: deemedStartYear || null,
      deemedInDenom: rule.deemedInDenom
    }
  }
}

/**
 * 反向推算：已知账户余额 + 缴费信息 → 推算平均指数
 * （反推仅覆盖实际缴费段，视同年不计入；deemedYears 默认 0）
 */
function inferIndexFromBalance({ provinceConfig, provinceCode, contribution, granularity, knownBalance, options = {} }) {
  const TOLERANCE = options.tolerance || 10
  const MAX_ITER = options.maxIter || 100

  const template = buildInferTemplate(contribution, granularity, provinceConfig.avg_salary_history)
  if (template.length === 0) {
    return { error: '无法构建反推模板（缺少社平数据或缴费信息）' }
  }

  let low = 0.3
  let high = 5.0
  let bestIndex = 1.0
  let bestDiff = Infinity

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const mid = (low + high) / 2
    const synth = template.map(t => ({
      year: t.year,
      months: t.months,
      baseAvg: mid * t.socialAvg
    }))
    const result = calculateIndex({ provinceConfig, provinceCode, contribution: synth, granularity: 'A' })
    if (result.error) return { error: result.error }

    const diff = Math.abs(result.accountBalance - knownBalance)
    if (diff < bestDiff) { bestDiff = diff; bestIndex = mid }

    if (diff <= TOLERANCE) {
      return {
        inferredIndex: round4(mid),
        calculatedBalance: result.accountBalance,
        iterations: iter + 1,
        converged: true,
        method: 'bisection',
        yearsDetail: result.yearsDetail
      }
    }
    if (result.accountBalance < knownBalance) low = mid
    else high = mid
    if (high - low < 0.0001) break
  }

  return {
    inferredIndex: round4(bestIndex),
    calculatedBalance: null,
    iterations: MAX_ITER,
    converged: bestDiff <= TOLERANCE * 10,
    method: 'bisection_approx',
    residual: bestDiff,
    note: bestDiff > TOLERANCE ? `误差¥${bestDiff.toFixed(0)}较大，建议核对输入` : null
  }
}

/**
 * 构建反推模板：逐年 + 该年分母社平
 */
function buildInferTemplate(contribution, granularity, salaryHist) {
  let yearly = []
  if (granularity === 'A') yearly = normalizeGranularityA(contribution)
  else if (granularity === 'B') yearly = normalizeGranularityB(contribution)
  else if (granularity === 'C') yearly = spreadMonthsToYears(contribution)
  const resolved = resolveSalaryHist(salaryHist, null)
  // 反推模板用"分母社平"：默认上年（与正向一致，陕/藏会取当年）
  return yearly
    .map(y => {
      const rule = y._provinceCode ? PROVINCE_RULES[y._provinceCode] : DEFAULT_RULE
      return { year: y.year, months: y.months, socialAvg: getDenominator(rule, resolved, y.year) }
    })
    .filter(y => y.socialAvg && y.socialAvg > 0)
}

// ════════════════════════════════════════════════════════
//  内部辅助函数（归一化）
// ════════════════════════════════════════════════════════

function normalizeToYearly(contribution, granularity) {
  if (granularity === 'A') return normalizeGranularityA(contribution)
  if (granularity === 'B') return normalizeGranularityB(contribution)
  if (granularity === 'C') return normalizeGranularityC(contribution)
  return []
}

function normalizeGranularityA(data) {
  let records = []
  if (Array.isArray(data)) records = data
  else if (data && data.records) records = data.records
  else return []

  if (records.length > 0 && records[0].months !== undefined && records[0].baseAvg !== undefined) {
    return records.map(r => ({ year: r.year, months: r.months, baseAvg: r.baseAvg }))
  }

  const yearMap = {}
  for (const r of records) {
    const y = r.year
    if (!yearMap[y]) yearMap[y] = { year: y, months: 0, baseSum: 0 }
    const base = r.base || r.baseSalary || r.paymentBase || 0
    yearMap[y].months++
    yearMap[y].baseSum += base
  }
  return Object.values(yearMap).map(y => ({
    year: y.year, months: y.months, baseAvg: y.months > 0 ? y.baseSum / y.months : 0
  }))
}

function normalizeGranularityB(data) {
  if (!data || !data.yearlyData) return []
  const yearlyData = data.yearlyData
  if (!Array.isArray(yearlyData) || yearlyData.length === 0) return []
  const validYears = yearlyData.filter(y => y.baseAvg && y.baseAvg > 0)
  const globalBaseAvg = validYears.length > 0
    ? validYears.reduce((s, y) => s + y.baseAvg, 0) / validYears.length : 0
  const result = []
  for (const y of yearlyData) {
    result.push({ year: y.year, months: y.months || 12, baseAvg: y.baseAvg || globalBaseAvg })
  }
  return result
}

function normalizeGranularityC(data) {
  if (!data || !data.totalMonths) return []
  return [{
    _granularityC: true,
    totalMonths: data.totalMonths,
    startYear: data.startYear,
    startMonth: data.startMonth,
    currentBalance: data.currentBalance
  }]
}

function spreadMonthsToYears(contribution) {
  if (!contribution || !contribution.totalMonths) return []
  const startYear = contribution.startYear || 2000
  const startMonth = contribution.startMonth || 1
  let remaining = contribution.totalMonths
  let y = startYear
  let m = startMonth
  const result = []
  while (remaining > 0) {
    const monthsThisYear = (13 - m)
    const mm = Math.min(remaining, monthsThisYear > 0 ? monthsThisYear : 12)
    result.push({ year: y, months: mm })
    remaining -= mm
    y += 1
    m = 1
  }
  return result
}

// ════════════════════════════════════════════════════════
//  工具函数
// ════════════════════════════════════════════════════════

function round4(n) { return Math.round(n * 10000) / 10000 }
function round2(n) { return Math.round(n * 100) / 100 }

// ════════════════════════════════════════════════════════

/**
 * 反推模式②：已知当前月缴费基数 -> 反推历年基数 + 平均指数 + 账户余额
 */
function inferYearlyFromCurrentBase({ provinceConfig, provinceCode, startYear, startMonth, totalMonths, currentBase, gapYearCountsInAvg = null }) {
  const salaryHist = provinceConfig.avg_salary_history || {}
  const span = spreadMonthsToYears({ startYear, startMonth, totalMonths })
  if (!span || span.length === 0) return { error: '无法构建缴费年度序列，请检查首缴年月与缴费月数。' }
  const endYear = span[span.length - 1].year
  const endSocialDenom = getDenominator(PROVINCE_RULES[provinceCode] || DEFAULT_RULE, salaryHist, endYear)
  if (!endSocialDenom || endSocialDenom <= 0) return { error: '缺少缴费期末年（' + endYear + '年）的社平数据，无法用当前基数换算。' }
  if (!(currentBase > 0)) return { error: '当前月缴费基数必须大于 0。' }
  const currentIndex = currentBase / endSocialDenom
  const synth = span.map(function (s) {
    const social = getDenominator(PROVINCE_RULES[provinceCode] || DEFAULT_RULE, salaryHist, s.year)
    return { year: s.year, months: s.months, baseAvg: (social && social > 0) ? social * currentIndex : null }
  }).filter(function (r) { return r.baseAvg != null })
  if (synth.length === 0) return { error: '无有效社平数据，无法反推历年基数。' }
  const fwd = calculateIndex({ provinceConfig, provinceCode, contribution: synth, granularity: 'A', gapYearCountsInAvg })
  if (fwd.error) return { error: fwd.error }
  fwd._meta = Object.assign({}, fwd._meta, { reverseMode: 'currentBase', currentIndex: round4(currentIndex), currentBase: round4(currentBase), currentYear: endYear })
  return fwd
}

/**
 * 反推模式③：已知目标平均指数 -> 反推历年应缴基数
 */
function inferYearlyFromTargetIndex({ provinceConfig, provinceCode, startYear, startMonth, totalMonths, targetIndex, gapYearCountsInAvg = null }) {
  const salaryHist = provinceConfig.avg_salary_history || {}
  const span = spreadMonthsToYears({ startYear, startMonth, totalMonths })
  if (!span || span.length === 0) return { error: '无法构建缴费年度序列，请检查首缴年月与缴费月数。' }
  if (!(targetIndex > 0)) return { error: '目标平均指数必须大于 0。' }
  const synth = span.map(function (s) {
    const social = getDenominator(PROVINCE_RULES[provinceCode] || DEFAULT_RULE, salaryHist, s.year)
    return { year: s.year, months: s.months, baseAvg: (social && social > 0) ? social * targetIndex : null }
  }).filter(function (r) { return r.baseAvg != null })
  if (synth.length === 0) return { error: '无有效社平数据，无法反推历年基数。' }
  const fwd = calculateIndex({ provinceConfig, provinceCode, contribution: synth, granularity: 'A', gapYearCountsInAvg })
  if (fwd.error) return { error: fwd.error }
  fwd._meta = Object.assign({}, fwd._meta, { reverseMode: 'targetIndex', targetIndex: round4(targetIndex), appliedIndex: round4(targetIndex) })
  return fwd
}

// ════════════════════════════════════════════════════════
//  导出
// ════════════════════════════════════════════════════════

module.exports = {
  // 核心 API
  calculateIndex,
  inferIndexFromBalance,
  inferYearlyFromCurrentBase,
  inferYearlyFromTargetIndex,
  spreadMonthsToYears,

  // 辅助
  getRate,
  getSocialAvg,
  getDenominator,
  applyCap,
  resolveSalaryHist,
  normalizeToYearly,

  // 规则表
  PROVINCE_RULES,
  GUANGDONG_SIGHT_INDEX_MAP,

  // 数据
  UNIFIED_RATES,

  // 元信息
  version: '2.1.1',
  date: '2026-08-15',
  source: '剪刀财经《缴费基数&记账利率 1996-2025年》+ 31省官网缴费指数规则(四方印证) + 粤府函〔2021〕294号 D值表'
}

  return module.exports;
})();
