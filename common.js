/* common.js — ตัวช่วยกลางของระบบทุนการศึกษา (ใช้ร่วมทุกหน้า) */
(function () {
  'use strict';

  var C = window.APP_CONFIG || {};
  var configured = !!(
    C.SUPABASE_URL && C.SUPABASE_ANON_KEY &&
    C.SUPABASE_URL.indexOf('YOUR-') === -1 && C.SUPABASE_ANON_KEY.indexOf('YOUR-') === -1
  );
  var sb = null;
  if (configured && window.supabase && window.supabase.createClient) {
    sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY);
  }

  /* ---------- ตัวช่วยทั่วไป ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  function classLabel(g, r) { return 'ม.' + g + '/' + r; }
  function todayTH() {
    return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  }
  function safeFile(name) {
    return String(name || 'report').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_');
  }
  // เรียง ม.1-6 > ห้อง > เลขที่ > รหัสนักเรียน
  function cmpStudent(a, b) {
    return (a.grade - b.grade) || (a.room - b.room) ||
      ((a.class_no == null ? 9999 : a.class_no) - (b.class_no == null ? 9999 : b.class_no)) ||
      String(a.student_code).localeCompare(String(b.student_code));
  }
  function friendlyError(e) {
    if (!e) return 'เกิดข้อผิดพลาด';
    var m = e.message || String(e);
    if (e.code === '23505') return 'นักเรียนคนนี้ได้รับทุนจากผู้ให้ทุนนี้แล้ว กรุณาแก้ไขรายการเดิม';
    if (e.code === '42501' || /row-level security|permission denied/i.test(m)) return 'ไม่มีสิทธิ์ดำเนินการนี้ (ลองเข้าสู่ระบบใหม่)';
    if (e.code === '23514') return 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบชั้น/ห้อง/จำนวนเงิน';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต';
    return m;
  }

  /* ---------- Toast ---------- */
  function toast(msg, type) {
    var box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:100;display:flex;flex-direction:column;gap:.5rem;max-width:calc(100vw - 2rem)';
      document.body.appendChild(box);
    }
    var t = document.createElement('div');
    t.className = 'fade-up';
    t.style.cssText = 'padding:.75rem 1rem;border-radius:.85rem;color:#fff;font-size:.95rem;box-shadow:0 10px 25px -8px rgba(0,0,0,.35);background:' +
      (type === 'err' ? '#b91c1c' : '#15803d');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 3600);
    setTimeout(function () { t.remove(); }, 4100);
  }

  /* ---------- ตัวเลขวิ่ง ---------- */
  function countUp(el, to, ms) {
    if (!el) return;
    to = Number(to) || 0;
    ms = ms || 900;
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / ms);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = money(to * eased);
      if (p < 1) requestAnimationFrame(step); else el.textContent = money(to);
    }
    requestAnimationFrame(step);
  }

  /* ---------- สร้างรายงาน (HTML ใช้ร่วมกันทั้ง PDF และ Word) ----------
     o = { title, subtitle, columns:[{label,align,width,get(row,i)}], rows,
           total:{label,labelSpan,values:[...]} } */
  function buildReportHTML(o) {
    var cols = o.columns;
    var th = cols.map(function (c) {
      return '<th bgcolor="#b91c1c" style="border:1px solid #7f1d1d;background:#b91c1c;color:#ffffff;padding:6px 8px;text-align:' +
        (c.align || 'left') + ';' + (c.width ? 'width:' + c.width + ';' : '') + '">' + esc(c.label) + '</th>';
    }).join('');
    var body = o.rows.map(function (r, i) {
      return '<tr style="page-break-inside:avoid">' + cols.map(function (c) {
        return '<td style="border:1px solid #9ca3af;padding:5px 8px;text-align:' + (c.align || 'left') + ';' +
          (i % 2 ? 'background:#fef2f2;' : '') + '">' + esc(c.get(r, i)) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var foot = '';
    if (o.total) {
      var t = o.total, vals = t.values || [];
      var rest = cols.length - t.labelSpan - vals.length;
      foot = '<tr style="page-break-inside:avoid;font-weight:bold;background:#fee2e2">' +
        '<td colspan="' + t.labelSpan + '" style="border:1px solid #9ca3af;padding:6px 8px;text-align:right;background:#fee2e2">' + esc(t.label) + '</td>' +
        vals.map(function (v, k) {
          return '<td style="border:1px solid #9ca3af;padding:6px 8px;text-align:' + (cols[t.labelSpan + k].align || 'left') + ';background:#fee2e2">' + esc(v) + '</td>';
        }).join('') +
        new Array(Math.max(0, rest) + 1).join('<td style="border:1px solid #9ca3af;background:#fee2e2">&nbsp;</td>') +
        '</tr>';
    }
    return '<div style="font-family:Sarabun,\'TH SarabunPSK\',Tahoma,sans-serif;color:#111;font-size:13px;line-height:1.45">' +
      '<div style="text-align:center;margin-bottom:10px">' +
      '<div style="font-size:20px;font-weight:bold;color:#7f1d1d">' + esc(C.SCHOOL_NAME || 'โรงเรียน') + '</div>' +
      '<div style="font-size:16px;font-weight:bold;margin-top:2px">' + esc(o.title) + '</div>' +
      (o.subtitle ? '<div style="font-size:14px;margin-top:2px">' + esc(o.subtitle) + '</div>' : '') +
      '<div style="font-size:12px;color:#555;margin-top:2px">ข้อมูล ณ วันที่ ' + esc(todayTH()) + '</div>' +
      '</div>' +
      '<table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>' + th + '</tr></thead><tbody>' + body + foot + '</tbody></table>' +
      '</div>';
  }

  /* ---------- ส่งออก PDF (เรนเดอร์ด้วยฟอนต์ Sarabun ผ่านเบราว์เซอร์ ภาษาไทยไม่เพี้ยน) ---------- */
  async function exportPDF(html, filename, landscape) {
    if (!window.html2pdf) { toast('โหลดตัวสร้าง PDF ไม่สำเร็จ กรุณารีเฟรชหน้า', 'err'); return false; }
    toast('กำลังสร้างไฟล์ PDF…');
    try {
      if (document.fonts && document.fonts.load) {
        await document.fonts.load('400 14px Sarabun');
        await document.fonts.load('700 14px Sarabun');
        await document.fonts.ready;
      }
    } catch (e) { /* ใช้ฟอนต์สำรอง */ }
    var el = document.createElement('div');
    el.style.cssText = 'background:#fff;padding:0;font-family:Sarabun,sans-serif';
    el.innerHTML = html;
    try {
      await window.html2pdf().set({
        margin: [12, 10, 14, 10],
        filename: safeFile(filename) + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] }
      }).from(el).save();
      toast('ดาวน์โหลด PDF เรียบร้อย');
      return true;
    } catch (e) {
      toast('สร้าง PDF ไม่สำเร็จ: ' + (e && e.message ? e.message : e), 'err');
      return false;
    }
  }

  /* ---------- ส่งออก Word (.doc เปิดด้วย Microsoft Word ได้ทันที) ---------- */
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function exportWord(html, filename, landscape) {
    var doc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>' + esc(filename) + '</title>' +
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' +
      '<style>@page{size:' + (landscape ? '29.7cm 21cm' : '21cm 29.7cm') + ';margin:2cm 1.8cm}' +
      "body{font-family:'TH SarabunPSK','Sarabun',Tahoma,sans-serif;font-size:14pt}" +
      'table{border-collapse:collapse;width:100%}</style></head><body>' + html + '</body></html>';
    download(new Blob(['\ufeff', doc], { type: 'application/msword;charset=utf-8' }), safeFile(filename) + '.doc');
    toast('ดาวน์โหลดไฟล์ Word เรียบร้อย');
  }

  window.App = {
    sb: sb, configured: configured, C: C,
    esc: esc, money: money, classLabel: classLabel, todayTH: todayTH, safeFile: safeFile,
    cmpStudent: cmpStudent, friendlyError: friendlyError, toast: toast, countUp: countUp,
    buildReportHTML: buildReportHTML, exportPDF: exportPDF, exportWord: exportWord
  };
})();
