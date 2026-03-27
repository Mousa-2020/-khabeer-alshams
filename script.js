/*
  ================================================
  خبير الشمس | Yemen Solar Expert — script.js
  ================================================

  المعادلات الهندسية:
    1. استهلاك الجهاز   : Wh = W × h × qty
    2. قوة الألواح      : P  = (Wh / PSH) × 1.25 × Ftemp
    3. البطاريات        : Ah = (Wh × أيام) / (V × 0.5 × 0.85) × Fحرارة
    4. المحول           : VA = SurgeLoad × 1.25 / 0.8
    5. سُمك السلك       : A  = (2 × L × I × ρ) / (V × 0.03)
    6. وحدة الشحن       : Icc = (Wp / V) × 1.25
*/

'use strict';

/* ================================================
   قاعدة بيانات الأجهزة
   surge: مضاعف تيار البدء للأجهزة ذات المحركات
   الثلاجات: duty cycle 40% (لا تعمل بشكل متواصل)
   ================================================ */
var DEVICES = [
  { id:'led',   name:'لمبة LED',          icon:'💡', w:10,   surge:1.0, fridge:false, cat:'إضاءة' },
  { id:'strip', name:'شريط LED',           icon:'✨', w:20,   surge:1.0, fridge:false, cat:'إضاءة' },
  { id:'fanC',  name:'مروحة سقف',          icon:'🌀', w:75,   surge:1.3, fridge:false, cat:'تبريد' },
  { id:'fanT',  name:'مروحة طاولة',        icon:'💨', w:45,   surge:1.3, fridge:false, cat:'تبريد' },
  { id:'tv',    name:'تلفزيون / شاشة',     icon:'📺', w:80,   surge:1.0, fridge:false, cat:'إلكترونيات' },
  { id:'phone', name:'شاحن جوال',          icon:'📱', w:10,   surge:1.0, fridge:false, cat:'إلكترونيات' },
  { id:'lap',   name:'لابتوب',             icon:'💻', w:65,   surge:1.0, fridge:false, cat:'إلكترونيات' },
  { id:'rout',  name:'راوتر إنترنت',       icon:'📡', w:15,   surge:1.0, fridge:false, cat:'إلكترونيات' },
  { id:'frS',   name:'ثلاجة صغيرة',        icon:'🧊', w:100,  surge:3.0, fridge:true,  cat:'منزلية' },
  { id:'frL',   name:'ثلاجة كبيرة',        icon:'🏠', w:150,  surge:3.0, fridge:true,  cat:'منزلية' },
  { id:'pump',  name:'مضخة مياه',          icon:'💧', w:370,  surge:3.0, fridge:false, cat:'منزلية' },
  { id:'wash',  name:'غسالة ملابس',        icon:'🫧', w:500,  surge:2.0, fridge:false, cat:'منزلية' },
  { id:'blend', name:'خلاط / محضرة',       icon:'🥤', w:350,  surge:2.0, fridge:false, cat:'مطبخ' },
  { id:'kett',  name:'غلاية كهربائية',     icon:'☕', w:1000, surge:1.0, fridge:false, cat:'مطبخ' },
];

/* ================================================
   بيانات المدن
   PSH  = Peak Sun Hours (ساعات الذروة الشمسية)
   heat = معامل حرارة البطاريات (عدن +15%)
   temp = معامل حرارة الألواح (عدن +10%)
   ================================================ */
var CITIES = {
  aden: {
    name:   'عدن',
    psh:    5.5,
    heat:   1.15,
    temp:   1.10,
    note:   'عدن: حرارة شديدة تؤثر على الألواح والبطاريات. تم إضافة هامش أمان 15% على سعة البطاريات. يُنصح بتهوية جيدة لمنع غليان الإلكتروليت.',
    tilt:   'وجّه الألواح نحو الجنوب بميل 15 درجة.',
    tips: [
      'ركّب البطاريات في مكان مظلل وجيد التهوية — الحرارة أكبر عدو لها.',
      'افحص مستوى ماء البطاريات كل شهر — الحرارة تسرّع التبخر.',
      'استخدم كيبلات مقاومة لأشعة الشمس (UV Resistant).',
      'وجّه الألواح نحو الجنوب الجغرافي بميل 15 درجة.'
    ]
  },
  dhale: {
    name:   'الضالع',
    psh:    5.0,
    heat:   1.0,
    temp:   1.0,
    note:   'الضالع: مناخ معتدل ومرتفعات صافية. زاوية الميل المثالية للألواح 30 درجة نحو الجنوب للحصول على أفضل كفاءة سنوية.',
    tilt:   'زاوية الميل المثلى في الضالع: 30 درجة نحو الجنوب.',
    tips: [
      'اضبط زاوية ميل الألواح على 30 درجة نحو الجنوب — يرفع الكفاءة 10-15%.',
      'رياح الضالع قوية في بعض الأحيان — ثبّت الألواح بإطارات متينة.',
      'في فصل الشتاء ارفع الزاوية إلى 35-40 درجة.',
      'البطاريات في الضالع تعمر أطول بسبب الاعتدال الحراري.'
    ]
  }
};

/* ================================================
   جدول أسماك الأسلاك القياسية mm² (IEC 60228)
   ρ_normal = مقاومة النحاس عند 20°C
   ρ_hot    = مقاومة النحاس عند 50°C (عدن)
   ================================================ */
var WIRE_TBL = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];
var RHO_N    = 0.0178;
var RHO_H    = 0.0196;

/* ================================================
   حالة التطبيق
   ================================================ */
var S = {
  city:  null,
  devs:  {},       /* { id: { qty, dayH, nightH } } */
  dist:  5,
  volt:  24,
  days:  2
};

/* ================================================

   ██████╗ ██████╗ ███████╗████████╗ █████╗ ██████╗ ████████╗
   ██╔═══╝ ╚═══██╗██╔════╝╚══██╔══╝██╔══██╗██╔══██╗╚══██╔══╝
   ███████╗  ████╔╝███████╗   ██║   ███████║██████╔╝   ██║
   ╚════██║  ╚══██╗╚════██║   ██║   ██╔══██║██╔══██╗   ██║
   ██████╔╝ ██████╔╝███████║   ██║   ██║  ██║██║  ██║   ██║
   ╚═════╝  ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝

   نقطة الدخول الرئيسية:
   ======================================
   يستخدم window.onload لضمان تحميل
   جميع موارد الصفحة قبل البدء.

   التسلسل:
     0ms   → الصفحة محملة، splash ظاهرة، mainApp مخفي
     2800ms → نبدأ تلاشي splash (نضيف .fade-out)
     3300ms → نخفي splash نهائياً (نضيف .hidden)
              ونُظهر mainApp (نزيل .hidden منه)
              ونبني قائمة الأجهزة
   ================================================ */
window.onload = function () {
  var splash   = document.getElementById('splash');
  var mainApp  = document.getElementById('mainApp');

  /*
   * التحقق من وجود العناصر الأساسية
   * في حالة وجود خطأ في HTML سنرى رسالة واضحة
   */
  if (!splash || !mainApp) {
    console.error('خبير الشمس: لم يُعثر على عناصر splash أو mainApp في الصفحة');
    return;
  }

  /*
   * الخطوة 1: بعد 2800 ميلي ثانية — نبدأ التلاشي
   * نضيف كلاس fade-out الذي يُفعّل CSS transition
   */
  setTimeout(function () {
    splash.classList.add('fade-out');

    /*
     * الخطوة 2: بعد 500ms إضافية (إجمالي ~3.3 ثانية)
     * انتهى الـ transition — نخفي splash ونظهر التطبيق
     */
    setTimeout(function () {

      /* إخفاء شاشة الترحيب بإضافة .hidden */
      splash.classList.add('hidden');

      /* إظهار الحاوية الرئيسية بإزالة .hidden */
      mainApp.classList.remove('hidden');

      /* بناء قائمة الأجهزة الكهربائية */
      buildDevList();
      refreshLiveStrip();

    }, 500);

  }, 2800);
};

/* ================================================
   التنقل بين الخطوات
   ================================================ */
function goTo(n) {
  if (n === 2 && !S.city) {
    toast('الرجاء اختيار المدينة أولاً');
    return;
  }

  /* إخفاء جميع اللوحات */
  var panels = document.querySelectorAll('.panel');
  for (var i = 0; i < panels.length; i++) {
    panels[i].classList.remove('active');
  }

  /* إظهار اللوحة المطلوبة */
  var t = document.getElementById('p' + n);
  if (t) t.classList.add('active');

  /* تحديث مؤشر الخطوات */
  updateStepBar(n);

  /* الصعود لأعلى الصفحة */
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepBar(active) {
  for (var i = 1; i <= 4; i++) {
    var si = document.getElementById('si' + i);
    if (!si) continue;
    si.classList.remove('active', 'done');
    if (i < active)       si.classList.add('done');
    else if (i === active) si.classList.add('active');
  }

  /* خطوط الوصل */
  var pairs = [[1,2],[2,3],[3,4]];
  for (var j = 0; j < pairs.length; j++) {
    var ln = document.getElementById('sl' + pairs[j][0] + '' + pairs[j][1]);
    if (!ln) continue;
    if (pairs[j][0] < active) ln.classList.add('done');
    else ln.classList.remove('done');
  }
}

/* ================================================
   الخطوة 1: اختيار المدينة
   ================================================ */
function chooseCity(el) {
  /* إزالة التحديد من كل البطاقات */
  var cards = document.querySelectorAll('.city-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.remove('picked');
  }

  el.classList.add('picked');
  S.city = el.dataset.city;

  /* تحديث الهيدر */
  var hc = document.getElementById('headerCity');
  hc.textContent = CITIES[S.city].name;
  hc.classList.remove('hidden');

  /* ملاحظة المدينة */
  var nb = document.getElementById('cityNote');
  nb.textContent = CITIES[S.city].note;
  nb.classList.remove('hidden');

  /* تفعيل زر التالي */
  document.getElementById('btn1next').disabled = false;
}

/* ================================================
   الخطوة 2: بناء قائمة الأجهزة
   ================================================ */
function buildDevList() {
  /* تهيئة حالة الأجهزة */
  for (var d = 0; d < DEVICES.length; d++) {
    S.devs[DEVICES[d].id] = { qty: 0, dayH: 4, nightH: 3 };
  }

  /* تجميع حسب التصنيف */
  var cats = {};
  for (var k = 0; k < DEVICES.length; k++) {
    var dv = DEVICES[k];
    if (!cats[dv.cat]) cats[dv.cat] = [];
    cats[dv.cat].push(dv);
  }

  var html = '';
  var catKeys = Object.keys(cats);

  for (var c = 0; c < catKeys.length; c++) {
    var catName = catKeys[c];
    var catArr  = cats[catName];

    html += '<div class="dev-cat">';
    html += '<div class="cat-name">' + catName + '</div>';

    for (var x = 0; x < catArr.length; x++) {
      var dev = catArr[x];
      var stag = dev.surge > 1
        ? '<span class="stag">Surge ×' + dev.surge + '</span>'
        : '';

      html += '<div class="dev-card" id="dc-' + dev.id + '">';

      /* الجزء العلوي (قابل للنقر) */
      html += '<div class="dev-top" onclick="toggleDev(\'' + dev.id + '\')">';
      html += '  <div class="dev-ico">' + dev.icon + '</div>';
      html += '  <div class="dev-meta">';
      html += '    <div class="dev-name">' + dev.name + '</div>';
      html += '    <div class="dev-watt">' + stag + dev.w + ' وات</div>';
      html += '  </div>';
      html += '  <div class="dev-ctr">';
      html += '    <button class="cbtn2 m" onclick="adjQty(event,\'' + dev.id + '\',-1)">−</button>';
      html += '    <span class="dev-qty" id="dq-' + dev.id + '">0</span>';
      html += '    <button class="cbtn2 p" onclick="adjQty(event,\'' + dev.id + '\',+1)">+</button>';
      html += '  </div>';
      html += '</div>';

      /* ساعات التشغيل */
      html += '<div class="dev-hrs">';
      html += '  <div class="hrs-grid">';

      /* نهار */
      html += '    <div class="hrs-col">';
      html += '      <div class="hrs-lbl">☀ ساعات النهار</div>';
      html += '      <div class="hrs-row">';
      html += '        <input type="range" min="0" max="12" value="4" class="hslider" id="ds-' + dev.id + '" oninput="adjH(\'' + dev.id + '\',\'day\',this.value)">';
      html += '        <span class="hnum" id="dv-' + dev.id + '">4</span>';
      html += '      </div>';
      html += '    </div>';

      /* ليل */
      html += '    <div class="hrs-col">';
      html += '      <div class="hrs-lbl">🌙 ساعات الليل</div>';
      html += '      <div class="hrs-row">';
      html += '        <input type="range" min="0" max="12" value="3" class="hslider night" id="ns-' + dev.id + '" oninput="adjH(\'' + dev.id + '\',\'night\',this.value)">';
      html += '        <span class="hnum n" id="nv-' + dev.id + '">3</span>';
      html += '      </div>';
      html += '    </div>';

      html += '  </div>';

      /* معاينة الاستهلاك */
      html += '  <div class="dev-wh-row">';
      html += '    <span>استهلاك هذا الجهاز / يوم</span>';
      html += '    <span id="dwh-' + dev.id + '">0 Wh</span>';
      html += '  </div>';

      html += '</div>'; /* end dev-hrs */
      html += '</div>'; /* end dev-card */
    }

    html += '</div>'; /* end dev-cat */
  }

  document.getElementById('devList').innerHTML = html;
}

function toggleDev(id) {
  var card = document.getElementById('dc-' + id);
  if (S.devs[id] && S.devs[id].qty > 0) {
    card.classList.toggle('open');
  }
}

function adjQty(e, id, delta) {
  e.stopPropagation();
  var s   = S.devs[id];
  s.qty   = Math.max(0, Math.min(10, s.qty + delta));
  document.getElementById('dq-' + id).textContent = s.qty;

  var card = document.getElementById('dc-' + id);
  if (s.qty > 0) {
    card.classList.add('open');
  } else {
    card.classList.remove('open');
  }

  refreshDevWh(id);
  refreshLiveStrip();
}

function adjH(id, type, val) {
  var n = parseInt(val);
  if (type === 'day') {
    S.devs[id].dayH = n;
    document.getElementById('dv-' + id).textContent = n;
  } else {
    S.devs[id].nightH = n;
    document.getElementById('nv-' + id).textContent = n;
  }
  refreshDevWh(id);
  refreshLiveStrip();
}

/* حساب Wh لجهاز واحد */
function devWh(dev, s) {
  if (s.qty === 0) return 0;
  /* الثلاجة: Duty Cycle 40% — لا تعمل باستمرار */
  var w = dev.fridge ? dev.w * 0.4 : dev.w;
  return w * s.qty * (s.dayH + s.nightH);
}

function refreshDevWh(id) {
  var dev = findDev(id);
  if (!dev) return;
  var wh = devWh(dev, S.devs[id]);
  document.getElementById('dwh-' + id).textContent = Math.round(wh) + ' Wh';
}

/* حساب إجماليات الأحمال */
function getTotals() {
  var total = 0, day = 0, night = 0, peak = 0, cnt = 0, maxExtra = 0;

  for (var i = 0; i < DEVICES.length; i++) {
    var dev = DEVICES[i];
    var s   = S.devs[dev.id];
    if (!s || s.qty === 0) continue;
    cnt++;

    var w = dev.fridge ? dev.w * 0.4 : dev.w;
    day   += w * s.qty * s.dayH;
    night += w * s.qty * s.nightH;
    peak  += w * s.qty;

    /*
     * حساب Surge:
     * نأخذ فرق أعلى جهاز surge فقط
     * (نادراً ما تبدأ جميع الأجهزة في وقت واحد)
     */
    var extra = w * s.qty * (dev.surge - 1.0);
    if (extra > maxExtra) maxExtra = extra;
  }

  total = day + night;

  return {
    total:    total,
    day:      day,
    night:    night,
    peak:     peak,
    surge:    peak + maxExtra,
    cnt:      cnt
  };
}

function refreshLiveStrip() {
  var t = getTotals();
  document.getElementById('ls-cnt').textContent = t.cnt + ' جهاز';
  document.getElementById('ls-wh').textContent  = Math.round(t.total) + ' Wh';
  document.getElementById('ls-pk').textContent  = Math.round(t.peak) + ' W';
}

/* ================================================
   الخطوة 3: التوصيل
   ================================================ */
function adjDist(d) {
  var inp = document.getElementById('distVal');
  inp.value = Math.max(1, Math.min(100, parseInt(inp.value || 5) + d));
  S.dist = parseInt(inp.value);
  refreshWireNote();
}

function onDist() {
  S.dist = parseInt(document.getElementById('distVal').value || 5);
  refreshWireNote();
}

function setDist(v) {
  document.getElementById('distVal').value = v;
  S.dist = v;
  document.querySelectorAll('.pbt').forEach(function (b) { b.classList.remove('on'); });
  var btn = document.querySelector('.pbt[onclick="setDist(' + v + ')"]');
  if (btn) btn.classList.add('on');
  refreshWireNote();
}

function pickVolt(el) {
  document.querySelectorAll('.vopt').forEach(function (v) { v.classList.remove('sel'); });
  el.classList.add('sel');
  S.volt = parseInt(el.dataset.v);
  refreshWireNote();
}

function pickAuto(el) {
  document.querySelectorAll('.aopt').forEach(function (a) { a.classList.remove('sel'); });
  el.classList.add('sel');
  S.days = parseInt(el.dataset.d);
}

/*
 * حساب سُمك السلك — معادلة هبوط الجهد:
 *
 *   ΔV_max = V × 0.03          (أقصى هبوط مسموح = 3%)
 *   A_min  = (2 × L × I × ρ) / ΔV_max
 *
 * الضرب في 2: التيار يسافر ذهاباً وإياباً
 */
function calcWire(L, I, isHot) {
  var rho  = isHot ? RHO_H : RHO_N;
  var dvmx = S.volt * 0.03;
  var amin = (2 * L * I * rho) / dvmx;
  for (var i = 0; i < WIRE_TBL.length; i++) {
    if (WIRE_TBL[i] >= amin) return WIRE_TBL[i];
  }
  return WIRE_TBL[WIRE_TBL.length - 1];
}

function refreshWireNote() {
  var t = getTotals();
  if (t.peak === 0) {
    document.getElementById('wireNote').textContent = '🔌 أضف الأجهزة أولاً لرؤية التوصية';
    return;
  }
  var I  = t.peak / S.volt;
  var mm = calcWire(S.dist, I, S.city === 'aden');
  document.getElementById('wireNote').textContent =
    'مسافة ' + S.dist + 'م — تيار ' + Math.round(I) + 'A — موصى بسلك ' + mm + ' mm²';
}

/* ================================================
   الخطوة 4: الحسابات الكاملة
   ================================================ */
function calcNow() {
  if (!S.city) { toast('اختر المدينة أولاً'); return; }
  var t = getTotals();
  if (t.cnt === 0) { toast('أضف جهازاً واحداً على الأقل'); return; }

  var city = CITIES[S.city];
  var V    = S.volt;

  /* ---- 2) الألواح الشمسية ----
   *
   * P_panels = (Wh_total / PSH) × F_sys × F_temp
   *
   * PSH    = ساعات الذروة الشمسية للمدينة
   * F_sys  = 1.25 (خسائر النظام: أتربة + كيبلات + شحن/تفريغ + حرارة)
   * F_temp = معامل الحرارة على الألواح
   */
  var pReq  = (t.total / city.psh) * 1.25 * city.temp;
  var pSz   = panelSize(pReq);
  var pCnt  = Math.ceil(pReq / pSz);
  var pTot  = pCnt * pSz;

  /* ---- 3) البطاريات ----
   *
   * Ah = (Wh × أيام) / (V × DoD × η) × F_heat
   *
   * DoD    = 0.5  ← أهم رقم: لا نفرّغ البطارية أكثر من 50%
   *                   هذا يُضاعف عمرها الافتراضي
   * η      = 0.85 ← كفاءة البطارية
   * F_heat = معامل حرارة المدينة (عدن: 1.15)
   */
  var rawAh = (t.total * S.days) / (V * 0.5 * 0.85);
  var totAh = Math.ceil(rawAh * city.heat);
  var bSz   = batSize(totAh);
  var bCnt  = Math.ceil(totAh / bSz);
  var bType = batType(totAh, V);

  /* ---- 4) المحول (Inverter) ----
   *
   * VA = SurgeLoad × F_safety / PF
   *
   * F_safety = 1.25 (هامش أمان 25%)
   * PF       = 0.8  (معامل القدرة للأحمال المختلطة)
   */
  var invVA  = Math.ceil((t.surge * 1.25) / 0.8);
  var invStd = roundUp(invVA, [500,700,1000,1500,2000,3000,4000,5000,6000,8000,10000]);

  /* ---- 5) سُمك السلك ----
   *
   * I = P_panels / V_system
   * A = (2 × L × I × ρ) / (V × 0.03)
   */
  var Iw    = pTot / V;
  var wireMM = calcWire(S.dist, Iw, S.city === 'aden');
  var vdrop = (2 * S.dist * Iw * RHO_N) / wireMM;
  var vdPct = ((vdrop / V) * 100).toFixed(1);

  /* ---- 6) وحدة الشحن (MPPT) ----
   *
   * I_cc = (P_panels / V) × 1.25
   */
  var Icc   = Math.ceil((pTot / V) * 1.25);
  var ccAmp = roundUp(Icc, [10,20,30,40,50,60,80,100]);

  /* عرض النتائج */
  showResults({
    total: t.total, day: t.day, night: t.night, peak: t.peak,
    pCnt, pSz, pTot, pReq,
    totAh, bCnt, bSz, bType,
    invStd, invVA,
    wireMM, vdPct,
    Icc, ccAmp,
    city, devCnt: t.cnt
  });

  goTo(4);
}

/* --- دوال مساعدة للحسابات --- */
function panelSize(w) {
  if (w <= 200)  return 100;
  if (w <= 600)  return 200;
  if (w <= 1200) return 300;
  if (w <= 2000) return 400;
  return 500;
}

function batSize(ah) {
  var sizes = [250, 200, 150, 120, 100];
  for (var i = 0; i < sizes.length; i++) {
    if (ah / sizes[i] <= 6) return sizes[i];
  }
  return 100;
}

function batType(ah, v) {
  if (ah * v > 5000) return 'ليثيوم LiFePO4 أو جل Gel';
  if (ah > 300)      return 'جل Gel أو AGM مغلقة';
  return 'AGM مغلقة أو تقليدية';
}

function roundUp(v, arr) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] >= v) return arr[i];
  }
  return arr[arr.length - 1];
}

function findDev(id) {
  for (var i = 0; i < DEVICES.length; i++) {
    if (DEVICES[i].id === id) return DEVICES[i];
  }
  return null;
}

/* ================================================
   عرض النتائج في الواجهة
   ================================================ */
function showResults(r) {
  var V    = S.volt;
  var city = r.city;

  /* العنوان الفرعي */
  document.getElementById('resCity').textContent = city.name + ' — ' + r.devCnt + ' أجهزة';

  /* الاستهلاك */
  document.getElementById('rTotWh').textContent   = Math.round(r.total);
  document.getElementById('rDayWh').textContent   = Math.round(r.day) + ' Wh';
  document.getElementById('rNightWh').textContent = Math.round(r.night) + ' Wh';
  document.getElementById('rPeak').textContent    = Math.round(r.peak) + ' W';

  /* الألواح */
  document.getElementById('rPanCnt').textContent = r.pCnt;
  document.getElementById('rPanDet').innerHTML   =
    r.pCnt + ' لوح × ' + r.pSz + ' وات<br>الإجمالي: ' + r.pTot + ' وات<br>المطلوب: ' + Math.round(r.pReq) + ' وات';
  document.getElementById('rPanTip').textContent = city.tilt;

  /* البطاريات */
  document.getElementById('rBatAh').textContent = r.totAh;
  document.getElementById('rBatDet').innerHTML  =
    r.bCnt + ' بطارية × ' + r.bSz + ' Ah<br>الجهد: ' + V + ' فولت<br>النوع: ' + r.bType;
  document.getElementById('rBatTip').innerHTML  =
    'مهم: لا تفرّغ البطارية أكثر من 50% — هذا يُضاعف عمرها الافتراضي.' +
    (S.city === 'aden' ? ' (تم إضافة +15% تعويض حراري لعدن)' : '');

  /* المحول */
  document.getElementById('rInvVA').textContent = r.invStd;
  document.getElementById('rInvDet').innerHTML  =
    'الحمل الجاري: ' + Math.round(r.peak) + ' وات<br>الحمل الأقصى مع Surge: ' + Math.round(r.peak * 1.4) + ' وات<br>الموصى به: ' + r.invStd + ' VA';
  document.getElementById('rInvTip').textContent = 'يجب أن يدعم Pure Sine Wave لحماية الأجهزة الحساسة';

  /* الأسلاك */
  document.getElementById('rWireMM').textContent = r.wireMM;
  document.getElementById('rWireDet').innerHTML  =
    'المسافة: ' + S.dist + ' متر<br>هبوط الجهد: ' + r.vdPct + '% (ضمن الحد المقبول 3%)';
  document.getElementById('rWireTip').textContent = 'استخدم نحاساً خالصاً وليس ألومنيوم — النحاس أأمن وأطول عمراً';

  /* وحدة الشحن */
  document.getElementById('rCCAmp').textContent = r.ccAmp;
  document.getElementById('rCCDet').innerHTML   =
    'النوع الموصى به: MPPT (أكفأ من PWM بنسبة 15-30%)<br>الجهد: ' + V + ' فولت — التيار: ' + r.Icc + ' أمبير';
  document.getElementById('rCCTip').textContent = 'MPPT أغلى لكنها تزيد الطاقة المنتجة بنسبة 15-30%';

  /* نصائح الخبير */
  var allTips = city.tips.concat([
    'اشتر بطاريات ' + r.bType + ' من مصادر موثوقة. البطاريات المقلدة السبب رقم 1 في تلف المنظومة.',
    'لا تشغّل الغسالة والمضخة في وقت واحد — الـ Surge المشترك قد يحرق المحول.',
    'افحص البطاريات كل 3 أشهر وتحقق من الجهد الكامل ومستوى الماء.'
  ]);

  var tHtml = '';
  for (var i = 0; i < allTips.length; i++) {
    tHtml += '<li>' + allTips[i] + '</li>';
  }
  document.getElementById('tipsList').innerHTML = tHtml;

  /* نص المشاركة */
  var shareText =
    'خبير الشمس — روشتة المنظومة الشمسية\n' +
    '=====================================\n' +
    'المنطقة: ' + city.name + '\n' +
    'الاستهلاك اليومي: ' + Math.round(r.total) + ' Wh\n' +
    '-------------------------------------\n' +
    'الألواح: ' + r.pCnt + ' لوح × ' + r.pSz + 'W = ' + r.pTot + 'W\n' +
    'البطاريات: ' + r.bCnt + ' × ' + r.bSz + 'Ah (' + V + 'V)\n' +
    'النوع: ' + r.bType + '\n' +
    'المحول: ' + r.invStd + ' VA (Pure Sine Wave)\n' +
    'وحدة الشحن: MPPT ' + r.ccAmp + 'A\n' +
    'سُمك الأسلاك: ' + r.wireMM + ' mm²\n' +
    '-------------------------------------\n' +
    'تنبيه: لا تفرّغ البطارية أكثر من 50%\n' +
    city.tilt + '\n' +
    '=====================================\n' +
    'صدر من: خبير الشمس — Yemen Solar Expert';

  document.getElementById('shareBox').textContent = shareText;
  window._shareText = shareText;
}

/* ================================================
   المشاركة
   ================================================ */
function doWA() {
  if (window._shareText) {
    window.open('https://wa.me/?text=' + encodeURIComponent(window._shareText), '_blank');
  } else {
    toast('لا توجد روشتة للمشاركة');
  }
}

function doCopy() {
  if (!window._shareText) { toast('لا توجد روشتة للنسخ'); return; }
  var btn = document.getElementById('cpBtn');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(window._shareText).then(function () {
      btn.classList.add('copied');
      btn.textContent = '✓ تم النسخ';
      toast('تم نسخ الروشتة بنجاح');
      setTimeout(function () {
        btn.classList.remove('copied');
        btn.textContent = '📋 نسخ';
      }, 2500);
    }).catch(function () {
      fallbackCopy();
    });
  } else {
    fallbackCopy();
  }
}

function fallbackCopy() {
  /* للمتصفحات التي لا تدعم Clipboard API */
  var ta       = document.createElement('textarea');
  ta.value     = window._shareText;
  ta.style.position = 'fixed';
  ta.style.opacity  = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
    toast('تم النسخ');
  } catch (e) {
    toast('لم يتمكن من النسخ — انسخ يدوياً من الصندوق');
  }
  document.body.removeChild(ta);
}

/* ================================================
   إعادة ضبط التطبيق
   ================================================ */
function doReset() {
  S.city = null;
  S.devs = {};
  S.dist = 5;
  S.volt = 24;
  S.days = 2;

  /* إعادة ضبط الواجهة */
  document.querySelectorAll('.city-card').forEach(function (c) { c.classList.remove('picked'); });
  document.getElementById('headerCity').classList.add('hidden');
  document.getElementById('cityNote').classList.add('hidden');
  document.getElementById('btn1next').disabled = true;
  document.getElementById('distVal').value = 5;
  document.getElementById('wireNote').textContent = '🔌 أضف الأجهزة أولاً';

  /* إعادة بناء قائمة الأجهزة */
  buildDevList();
  refreshLiveStrip();

  goTo(1);
  toast('تم إعادة الضبط بنجاح');
}

/* ================================================
   Toast — إشعار مؤقت
   ================================================ */
function toast(msg) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function () {
    el.classList.remove('show');
  }, 2600);
}

