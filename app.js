/* 本人平均缴费指数计算器 — 前端逻辑（对齐小程序 index-mini）
 * 计算调用 window.CalcIndex.calculateIndex，与小程序云函数同引擎、同口径。
 */
(function () {
  'use strict';

  // 31 个省级行政区（顺序与小程序一致，使用标准全称）
  var PROVINCES = [
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
  ];

  // 断缴年份按指数 0 计入平均指数的省份（与小程序一致）
  var GAP_ZERO = new Set(['beijing', 'tianjin', 'shaanxi', 'zhejiang', 'yunnan']);

  var Calc = window.CalcIndex;
  var P = window.INDEX_PROVINCES;
  var $ = function (s) { return document.querySelector(s); };
  var curYear = new Date().getFullYear();
  $('#curYear').textContent = curYear;

  var state = { provSlug: 'jilin', startYear: null, startMonth: null, rows: [] };

  // ---------- 初始化下拉 ----------
  var provSel = $('#province');
  PROVINCES.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p.slug; o.textContent = p.name;
    provSel.appendChild(o);
  });
  provSel.value = state.provSlug;

  var ySel = $('#startYear');
  for (var y = 1980; y <= curYear; y++) {
    var oy = document.createElement('option'); oy.value = y; oy.textContent = y; ySel.appendChild(oy);
  }
  var mSel = $('#startMonth');
  for (var m = 1; m <= 12; m++) {
    var om = document.createElement('option'); om.value = m; om.textContent = m; mSel.appendChild(om);
  }

  function onProvChange() {
    state.provSlug = provSel.value;
    var p = PROVINCES.filter(function (x) { return x.slug === state.provSlug; })[0];
    var hint = '';
    if (GAP_ZERO.has(state.provSlug)) {
      hint = '提示：' + p.name + '执行“断缴年份按指数 0 计入平均指数”规则——中间断缴的年份会拉低平均指数，请如实逐年填写。';
    }
    $('#gapHint').textContent = hint;
  }
  provSel.addEventListener('change', onProvChange);
  onProvChange();

  // ---------- 生成逐年清单（对齐小程序 genYearly） ----------
  function genYearly() {
    var sy = parseInt(ySel.value, 10);
    var sm = parseInt(mSel.value, 10);
    if (!sy) { alert('请选择首次缴费年月'); return; }
    state.startYear = sy; state.startMonth = sm;
    var oldMap = {};
    state.rows.forEach(function (r) { if (r.year && r.baseAvg) oldMap[r.year] = r.baseAvg; });
    var rows = [];
    var y = sy;
    while (y <= curYear) {
      var months = (y === sy) ? (sm > 1 ? 13 - sm : 12) : 12;
      rows.push({ year: y, months: months, baseAvg: oldMap[y] || '' });
      y++;
    }
    state.rows = rows;
    renderGrid();
  }
  $('#genBtn').addEventListener('click', genYearly);

  // ---------- 渲染清单 ----------
  function renderGrid() {
    var g = $('#grid');
    g.innerHTML = '';
    state.rows.forEach(function (r, idx) {
      var row = document.createElement('div');
      row.className = 'mrow';
      row.innerHTML =
        '<input class="ry" type="number" placeholder="年" value="' + (r.year || '') + '">' +
        '<input class="rm" type="number" min="0" max="12" placeholder="月数" value="' + (r.months != null ? r.months : 12) + '">' +
        '<input class="rb" type="number" placeholder="月缴费基数" value="' + (r.baseAvg || '') + '">' +
        '<button class="rdel" title="删除">✕</button>';
      row.querySelector('.ry').addEventListener('input', function (e) { state.rows[idx].year = parseInt(e.target.value, 10) || 0; });
      row.querySelector('.rm').addEventListener('input', function (e) { state.rows[idx].months = parseInt(e.target.value, 10) || 0; });
      row.querySelector('.rb').addEventListener('input', function (e) { state.rows[idx].baseAvg = e.target.value; });
      row.querySelector('.rdel').addEventListener('click', function () { state.rows.splice(idx, 1); renderGrid(); });
      g.appendChild(row);
    });
  }

  $('#addRow').addEventListener('click', function () {
    state.rows.push({ year: '', months: 12, baseAvg: '' });
    renderGrid();
  });
  $('#clearBtn').addEventListener('click', function () { state.rows = []; renderGrid(); });

  $('#sampleBtn').addEventListener('click', function () {
    var cfg = P[state.provSlug];
    var sy = Math.max(2021, curYear - 4);
    ySel.value = sy; mSel.value = 1; state.startYear = sy; state.startMonth = 1;
    var rows = [];
    for (var y = sy; y <= curYear; y++) {
      var sa = cfg.avg_salary_history[y];
      var base = (sa && sa > 0) ? Math.round(sa * 0.6) : 6000;
      rows.push({ year: y, months: 12, baseAvg: base });
    }
    state.rows = rows;
    renderGrid();
  });

  // ---------- Tab 切换 ----------
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      var tab = t.dataset.tab;
      $('#panel-manual').classList.toggle('hidden', tab !== 'manual');
      $('#panel-excel').classList.toggle('hidden', tab !== 'excel');
      $('#panel-pdf').classList.toggle('hidden', tab !== 'pdf');
    });
  });

  // ---------- Excel / PDF 导入 → 填充清单 ----------
  function mergeIntoRows(list) {
    var map = {};
    state.rows.forEach(function (r) { if (r.year) map[r.year] = r; });
    list.forEach(function (d) {
      if (!d.year || !(d.baseAvg > 0)) return;
      if (map[d.year]) { map[d.year].baseAvg = Math.round(d.baseAvg * 100) / 100; if (d.months) map[d.year].months = d.months; }
      else { state.rows.push({ year: d.year, months: d.months || 12, baseAvg: Math.round(d.baseAvg * 100) / 100 }); }
    });
    state.rows.sort(function (a, b) { return (a.year || 0) - (b.year || 0); });
    renderGrid();
    // 切回手动页，让用户看到已填充的清单
    document.querySelector('.tab[data-tab="manual"]').click();
  }

  function renderPreview(data, el) {
    el.classList.remove('hidden');
    var html = '<table><thead><tr><th>年份</th><th>月数</th><th>月缴费基数</th></tr></thead><tbody>';
    data.slice(0, 60).forEach(function (d) {
      html += '<tr><td>' + d.year + '</td><td>' + (d.months || 12) + '</td><td>' + d.baseAvg + '</td></tr>';
    });
    html += '</tbody></table>';
    if (data.length > 60) html += '<p class="hint">仅显示前 60 行，共 ' + data.length + ' 行</p>';
    el.innerHTML = html;
  }

  // Excel
  var YEAR_P = /年|年度|year|参保年|缴费年|属期年/i;
  var MONTH_P = /月数|月份|月缴费|month|缴费月/i;
  var BASE_P = /基数|工资|缴费|base|salary|月均/i;
  function matchCol(headers, patterns) {
    for (var i = 0; i < headers.length; i++)
      for (var j = 0; j < patterns.length; j++)
        if (patterns[j].test(headers[i])) return headers[i];
    return null;
  }
  function parseExcel(file) {
    return new Promise(function (resolve, reject) {
      if (typeof XLSX === 'undefined') { reject('Excel 解析库未加载，请检查网络后刷新'); return; }
      var reader = new FileReader();
      reader.onload = function (e) {
        try {
          var wb = XLSX.read(e.target.result, { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(ws, { defval: null });
          if (!rows.length) { reject('Excel 中没有数据'); return; }
          var headers = Object.keys(rows[0]);
          var yc = matchCol(headers, YEAR_P), mc = matchCol(headers, MONTH_P), bc = matchCol(headers, BASE_P);
          if (!yc || !bc) { reject('未找到“年份”或“缴费基数”列，请使用模板格式'); return; }
          var cfg = P[state.provSlug], out = [];
          rows.forEach(function (r) {
            var y = parseInt(r[yc], 10), b = parseFloat(r[bc]), m = mc ? parseInt(r[mc], 10) : 12;
            if (!y || !(b > 0)) return;
            if (isNaN(m) || m == null) m = 12;
            if (b > (cfg.avg_salary_history[y] || 0) * 1.5 && cfg.avg_salary_history[y]) b = Math.round(b / 12 * 100) / 100;
            out.push({ year: y, months: m, baseAvg: b });
          });
          if (!out.length) { reject('没有有效的缴费数据行'); return; }
          resolve(out.sort(function (a, b) { return a.year - b.year; }));
        } catch (err) { reject(err && err.message ? err.message : '解析失败'); }
      };
      reader.readAsArrayBuffer(file);
    });
  }
  $('#excelFile').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    parseExcel(f).then(function (data) { mergeIntoRows(data); renderPreview(data, $('#excelPreview')); })
      .catch(function (msg) { alert('解析失败：' + msg); });
  });
  $('#dlTemplate').addEventListener('click', function () {
    if (typeof XLSX === 'undefined') { alert('Excel 解析库未加载，请检查网络后刷新'); return; }
    var aoa = [['年份', '缴费月数', '月缴费基数（即当年月平均缴费工资）'], [2020, 12, 5000], [2021, 12, 5200], [2022, 11, 5400]];
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '缴费明细');
    XLSX.writeFile(wb, '缴费指数导入模板.xlsx');
  });

  // PDF（尽力解析）
  function extractFromText(text) {
    var lines = text.split(/\n+/), rows = [], seen = {};
    lines.forEach(function (line) {
      var ym = line.match(/(\d{4})\s*年/); if (!ym) return;
      var year = parseInt(ym[1], 10); if (year < 1990 || year > 2035) return;
      var base = null;
      var m = line.match(/(?:缴费基数|基数|月均工资|平均工资|工资)[^\d]*?(\d{3,7}(\.\d+)?)/);
      if (m) base = parseFloat(m[1]);
      else { var nums = line.match(/\d{3,7}(\.\d+)?/g); if (nums && nums.length) base = parseFloat(nums[nums.length - 1]); }
      if (base && base > 0 && !seen[year]) { seen[year] = 1; rows.push({ year: year, months: 12, baseAvg: Math.round(base * 100) / 100 }); }
    });
    return rows.sort(function (a, b) { return a.year - b.year; });
  }
  function parsePdf(file) {
    return new Promise(function (resolve, reject) {
      if (typeof pdfjsLib === 'undefined') { reject('PDF 解析库未加载，请检查网络后刷新'); return; }
      try { pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; } catch (e) {}
      var reader = new FileReader();
      reader.onload = function (e) {
        pdfjsLib.getDocument({ data: e.target.result }).promise.then(function (pdf) {
          var pages = [], i = 0;
          function next() {
            if (i >= pdf.numPages) {
              var rows = extractFromText(pages.join('\n'));
              if (!rows.length) { reject('未能从 PDF 识别“年份+缴费基数”，请改用 Excel 或手动录入'); return; }
              resolve(rows);
              return;
            }
            pdf.getPage(i + 1).then(function (page) {
              page.getTextContent().then(function (tc) {
                pages.push(tc.items.map(function (it) { return it.str; }).join(' '));
                i++; next();
              });
            });
          }
          next();
        }).catch(function (err) { reject(err && err.message ? err.message : 'PDF 读取失败'); });
      };
      reader.readAsArrayBuffer(file);
    });
  }
  $('#pdfFile').addEventListener('change', function (e) {
    var f = e.target.files[0]; if (!f) return;
    parsePdf(f).then(function (data) { mergeIntoRows(data); renderPreview(data, $('#pdfPreview')); })
      .catch(function (msg) { alert('解析失败：' + msg); });
  });

  // ---------- 计算 ----------
  function fmtMoney(n) {
    return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  $('#calcBtn').addEventListener('click', function () {
    var cfg = P[state.provSlug];
    if (!cfg) { alert('请选择参保地'); return; }
    var yearlyData = state.rows
      .filter(function (r) { return Number(r.year) > 0 && Number(r.months) > 0; })
      .map(function (r) { return { year: Number(r.year), months: Number(r.months), baseAvg: Number(r.baseAvg) || 0 }; });
    if (!yearlyData.some(function (r) { return r.baseAvg > 0; })) { alert('请至少填写一年的月均缴费基数'); return; }

    // 与小程序云函数一致：按省份决定是否将断缴年计入指数 0
    var r = Calc.calculateIndex({
      provinceConfig: cfg,
      contribution: yearlyData,
      granularity: 'A',
      gapYearCountsInAvg: GAP_ZERO.has(state.provSlug)
    });
    if (r.error) { alert('计算失败：' + r.error); return; }
    renderResult(r, cfg);
  });

  function renderResult(r, cfg) {
    var el = $('#result');
    el.classList.remove('hidden');
    var gapYears = (r._meta && r._meta.gapYears) || 0;
    var isGapCount = GAP_ZERO.has(state.provSlug);

    var html = '<h2>计算结果</h2><div class="metrics">';
    html += '<div class="metric"><div class="m-label">平均缴费指数</div><div class="m-val">' + r.avgIndex.toFixed(4) + '</div></div>';
    html += '<div class="metric"><div class="m-label">个人账户余额</div><div class="m-val">' + fmtMoney(r.accountBalance) + '</div></div>';
    html += '<div class="metric"><div class="m-label">累计缴费</div><div class="m-val">' + r.totalMonths + '月 / ' + r.totalYears.toFixed(2) + '年</div></div>';
    html += '</div>';

    if (gapYears > 0) {
      html += '<p class="warn">⚠️ 检测到 ' + gapYears + ' 个断缴记录（空年份）。' +
        (isGapCount ? '「' + cfg.name + '」将该类年份按指数 0 计入平均指数，因此会拉低您的平均指数。' : '该参保地断缴年不计入平均指数（仅计实际缴费年）。') + '</p>';
    }

    html += '<h3>逐年明细</h3><table class="detail"><thead><tr><th>年份</th><th>月数</th><th>月缴费基数</th><th>社平工资</th><th>当年指数</th><th>年末账户余额</th></tr></thead><tbody>';
    (r.yearsDetail || []).forEach(function (d) {
      html += '<tr><td>' + d.year + '</td><td>' + d.months + '</td>';
      html += '<td>' + (d.baseAvg ? d.baseAvg : (d.gap ? '—' : '')) + '</td>';
      html += '<td>' + (d.socialAvg ? d.socialAvg : '—') + '</td>';
      html += '<td>' + (d.index != null ? d.index.toFixed(4) : '—') + '</td>';
      html += '<td>' + (d.balanceAfterYear != null ? fmtMoney(d.balanceAfterYear) : '—') + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
    el.scrollIntoView({ behavior: 'smooth' });
  }
})();
