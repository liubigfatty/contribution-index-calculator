(function () {
  'use strict';
  var P = window.INDEX_PROVINCES;
  var Calc = window.CalcIndex;
  var $ = function (s) { return document.querySelector(s); };
  var slugs = Object.keys(P);

  // ---------- 省份下拉 ----------
  var sel = $('#province');
  slugs.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s;
    o.textContent = P[s].name;
    sel.appendChild(o);
  });

  // ---------- Tab 切换 ----------
  var activeTab = 'manual';
  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      activeTab = t.dataset.tab;
      $('#panel-manual').classList.toggle('hidden', activeTab !== 'manual');
      $('#panel-excel').classList.toggle('hidden', activeTab !== 'excel');
      $('#panel-pdf').classList.toggle('hidden', activeTab !== 'pdf');
    });
  });

  // ---------- 手动录入 ----------
  function makeRow(y, m, b) {
    var row = document.createElement('div');
    row.className = 'mrow';
    row.innerHTML =
      '<input class="ry" type="number" placeholder="年份" value="' + (y || '') + '">' +
      '<input class="rm" type="number" placeholder="月数" value="' + (m != null ? m : 12) + '" min="0" max="12">' +
      '<input class="rb" type="number" placeholder="月缴费基数" value="' + (b || '') + '">' +
      '<button class="rdel" title="删除">✕</button>';
    row.querySelector('.rdel').addEventListener('click', function () { row.remove(); });
    return row;
  }
  function addRow(y, m, b) { $('#manualRows').appendChild(makeRow(y, m, b)); }
  [2020, 2021, 2022].forEach(function (y) { addRow(y, 12, ''); });
  $('#addRow').addEventListener('click', function () { addRow('', 12, ''); });

  function collectManual() {
    var rows = [].slice.call(document.querySelectorAll('#manualRows .mrow'));
    var out = [];
    rows.forEach(function (r) {
      var y = parseInt(r.querySelector('.ry').value, 10);
      var m = parseInt(r.querySelector('.rm').value, 10) || 0;
      var b = parseFloat(r.querySelector('.rb').value);
      if (y && b > 0) out.push({ year: y, months: m, baseAvg: b });
    });
    out.sort(function (a, b) { return a.year - b.year; });
    return out;
  }

  // ---------- Excel 导入 ----------
  var excelContribution = null;
  var YEAR_P = /年|年度|year|参保年|缴费年|属期年/i;
  var MONTH_P = /月数|月份|月缴费|month|缴费月/i;
  var BASE_P = /基数|工资|缴费|base|salary|月均/i;

  function matchCol(headers, patterns) {
    for (var i = 0; i < headers.length; i++) {
      for (var j = 0; j < patterns.length; j++) {
        if (patterns[j].test(headers[i])) return headers[i];
      }
    }
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
          var yc = matchCol(headers, YEAR_P);
          var mc = matchCol(headers, MONTH_P);
          var bc = matchCol(headers, BASE_P);
          if (!yc || !bc) { reject('未找到“年份”或“缴费基数”列，请使用模板格式'); return; }
          var cfg = P[sel.value];
          var out = [];
          rows.forEach(function (r) {
            var y = parseInt(r[yc], 10);
            var b = parseFloat(r[bc]);
            var m = mc ? parseInt(r[mc], 10) : 12;
            if (!y || !(b > 0)) return;
            if (isNaN(m) || m == null) m = 12;
            // 部分导出把“年工资”误填，超社平1.5倍则除以12修正
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
    var f = e.target.files[0];
    if (!f) return;
    parseExcel(f).then(function (data) {
      excelContribution = data;
      renderPreview(data, '#excelPreview');
    }).catch(function (msg) {
      excelContribution = null;
      alert('解析失败：' + msg);
    });
  });

  $('#dlTemplate').addEventListener('click', function () {
    if (typeof XLSX === 'undefined') { alert('Excel 解析库未加载，请检查网络后刷新'); return; }
    var aoa = [
      ['年份', '缴费月数', '月缴费基数（即当年月平均缴费工资）'],
      [2020, 12, 5000], [2021, 12, 5200], [2022, 11, 5400]
    ];
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '缴费明细');
    XLSX.writeFile(wb, '缴费指数导入模板.xlsx');
  });

  // ---------- PDF 导入（尽力解析） ----------
  var pdfContribution = null;

  function extractFromText(text) {
    var lines = text.split(/\n+/);
    var rows = [];
    var seen = {};
    lines.forEach(function (line) {
      var ym = line.match(/(\d{4})\s*年/);
      if (!ym) return;
      var year = parseInt(ym[1], 10);
      if (year < 1990 || year > 2035) return;
      var base = null;
      var m = line.match(/(?:缴费基数|基数|月均工资|平均工资|工资)[^\d]*?(\d{3,7}(\.\d+)?)/);
      if (m) {
        base = parseFloat(m[1]);
      } else {
        var nums = line.match(/\d{3,7}(\.\d+)?/g);
        if (nums && nums.length) base = parseFloat(nums[nums.length - 1]);
      }
      if (base && base > 0 && !seen[year]) {
        seen[year] = 1;
        rows.push({ year: year, months: 12, baseAvg: Math.round(base * 100) / 100 });
      }
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
          var pages = [];
          var i = 0;
          function next() {
            if (i >= pdf.numPages) {
              var text = pages.join('\n');
              var rows = extractFromText(text);
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
    var f = e.target.files[0];
    if (!f) return;
    parsePdf(f).then(function (data) {
      pdfContribution = data;
      renderPreview(data, '#pdfPreview');
    }).catch(function (msg) {
      pdfContribution = null;
      alert('解析失败：' + msg);
    });
  });

  function renderPreview(data, selStr) {
    var el = $(selStr);
    el.classList.remove('hidden');
    var html = '<table><thead><tr><th>年份</th><th>月数</th><th>月缴费基数</th></tr></thead><tbody>';
    data.slice(0, 60).forEach(function (d) {
      html += '<tr><td>' + d.year + '</td><td>' + d.months + '</td><td>' + d.baseAvg + '</td></tr>';
    });
    html += '</tbody></table>';
    if (data.length > 60) html += '<p class="hint">仅显示前 60 行，共 ' + data.length + ' 行</p>';
    el.innerHTML = html;
  }

  // ---------- 计算 ----------
  $('#calcBtn').addEventListener('click', function () {
    var cfg = P[sel.value];
    var contribution = null;
    if (activeTab === 'manual') contribution = collectManual();
    else if (activeTab === 'excel') contribution = excelContribution;
    else if (activeTab === 'pdf') contribution = pdfContribution;
    if (!contribution || !contribution.length) { alert('请先录入或导入缴费数据'); return; }
    var r = Calc.calculateIndex({ provinceConfig: cfg, contribution: contribution, granularity: 'A' });
    if (r.error) { alert('计算失败：' + r.error); return; }
    renderResult(r, cfg);
  });

  function fmtMoney(n) {
    return '¥' + Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderResult(r, cfg) {
    var el = $('#result');
    el.classList.remove('hidden');
    var gap = (r._meta && r._meta.gapYears) ? r._meta.gapYears : 0;
    var isGapCount = ['北京市', '天津市', '陕西省', '浙江省', '云南省'].indexOf(cfg.name) >= 0;

    var html = '<h2>计算结果</h2><div class="metrics">';
    html += '<div class="metric"><div class="m-label">平均缴费指数</div><div class="m-val">' + r.avgIndex.toFixed(4) + '</div></div>';
    html += '<div class="metric"><div class="m-label">个人账户余额</div><div class="m-val">' + fmtMoney(r.accountBalance) + '</div></div>';
    html += '<div class="metric"><div class="m-label">累计缴费</div><div class="m-val">' + r.totalMonths + '月/' + r.totalYears.toFixed(2) + '年</div></div>';
    html += '</div>';

    if (gap > 0) {
      html += '<p class="warn">⚠️ 检测到 ' + gap + ' 个断缴或不足年记录。' +
        (isGapCount ? '该参保地将断缴年按指数 0 计入平均。' : '该参保地断缴年不计入平均（仅计实际缴费年）。') + '</p>';
    }

    html += '<h3>逐年明细</h3><table class="detail"><thead><tr><th>年份</th><th>月数</th><th>月缴费基数</th><th>社平工资</th><th>当年指数</th><th>年末余额</th></tr></thead><tbody>';
    r.yearsDetail.forEach(function (d) {
      html += '<tr><td>' + d.year + '</td><td>' + d.months + '</td><td>' + d.baseAvg +
        '</td><td>' + d.socialAvg + '</td><td>' + d.index.toFixed(4) +
        '</td><td>' + fmtMoney(d.balanceAfterYear) + '</td></tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }
})();
