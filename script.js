/*
  خبير الشمس | Yemen Solar Expert — script.js
  =============================================
  المعادلات الهندسية المستخدمة:
    1. Wh/day  = Watts x Hours
    2. Panels  = (Wh / PSH) x F_loss x F_temp
    3. Battery = (Wh x Days) / (V x DoD x eff) x F_heat
    4. Inverter= SurgeLoad x 1.25 / PF (PF=0.8)
    5. Wire    = (2 x L x I x rho) / (V x 0.03)
    6. CC      = (Wp / V) x 1.25
*/

'use strict';

/* =============================================
   قاعدة بيانات الاجهزة
============================================= */
var DEVICES = [
  { id:'led',     name:'لمبة LED',         icon:'&#128161;', w:10,  surge:1.0, motor:false, cat:'اضاءة'        },
  { id:'strip',   name:'شريط LED',          icon:'&#10024;',  w:20,  surge:1.0, motor:false, cat:'اضاءة'        },
  { id:'fan_c',   name:'مروحة سقف',         icon:'&#127744;', w:75,  surge:1.3, motor:true,  cat:'تبريد'        },
  { id:'fan_t',   name:'مروحة طاولة',       icon:'&#128168;', w:45,  surge:1.3, motor:true,  cat:'تبريد'        },
  { id:'tv',      name:'تلفزيون / شاشة',    icon:'&#128250;', w:80,  surge:1.0, motor:false, cat:'الكترونيات'   },
  { id:'phone',   name:'شاحن جوال',         icon:'&#128242;', w:10,  surge:1.0, motor:false, cat:'الكترونيات'   },
  { id:'laptop',  name:'لابتوب',            icon:'&#128187;', w:65,  surge:1.0, motor:false, cat:'الكترونيات'   },
  { id:'router',  name:'راوتر انترنت',      icon:'&#128225;', w:15,  surge:1.0, motor:false, cat:'الكترونيات'   },
  { id:'fridge_s',name:'ثلاجة صغيرة',      icon:'&#129704;', w:100, surge:3.0, motor:true,  cat:'منزلية'       },
  { id:'fridge_l',name:'ثلاجة كبيرة',      icon:'&#127968;', w:150, surge:3.0, motor:true,  cat:'منزلية'       },
  { id:'pump',    name:'مضخة مياه',         icon:'&#128167;', w:370, surge:3.0, motor:true,  cat:'منزلية'       },
  { id:'washer',  name:'غسالة ملابس',       icon:'&#129399;', w:500, surge:2.0, motor:true,  cat:'منزلية'       },
  { id:'blender', name:'خلاط / محضرة',      icon:'&#129379;', w:350, surge:2.0, motor:true,  cat:'مطبخ'         },
  { id:'kettle',  name:'غلاية كهربائية',    icon:'&#9749;',   w:1000,surge:1.0, motor:false, cat:'مطبخ'         },
];

/* =============================================
   بيانات المدن
============================================= */
var CITIES = {
  aden: {
    name:          'عدن',
    psh:           5.5,
    heatFactor:    1.15,
    tempFactor:    1.10,
    infoText:      'عدن — حرارة شديدة تؤثر على البطاريات والالواح. تم اضافة هامش امان 15% على سعة البطاريات تعويضاً عن الحرارة. يُنصح بتهوية جيدة لمنع غليان البطاريات.',
    tiltTip:       'وجّه الالواح نحو الجنوب بميل 15 درجة.',
    tips: [
      'ركّب البطاريات في مكان مظلل وجيد التهوية. الحرارة اكبر عدو للبطارية في عدن.',
      'افحص مستوى ماء بطاريات الاسيد كل شهر. الحرارة تسرع التبخر.',
      'استخدم كيبلات مقاومة للاشعة فوق البنفسجية (UV). شمس عدن تتلف العزل.',
      'وجّه الالواح نحو الجنوب الجغرافي بميل 15 درجة.'
    ]
  },
  dhale: {
    name:          'الضالع',
    psh:           5.0,
    heatFactor:    1.0,
    tempFactor:    1.0,
    infoText:      'الضالع — مناخ معتدل ومرتفعات صافية. زاوية الميل المثالية للالواح 30 درجة نحو الجنوب للحصول على افضل كفاءة سنوية.',
    tiltTip:       'زاوية الميل المثلى في الضالع: 30 درجة نحو الجنوب.',
    tips: [
      'اضبط زاوية ميل الالواح على 30 درجة نحو الجنوب. يزيد الانتاجية 10-15%.',
      'رياح الضالع قد تكون قوية. ثبّت الالواح باطارات صلبة جيداً.',
      'في الشتاء ارفع زاوية الميل قليلاً (35-40 درجة).',
      'البطاريات في الضالع تعمر اطول بسبب الاعتدال الحراري.'
    ]
  }
};

/* =============================================
   جدول اسماك الاسلاك القياسية (IEC 60228)
============================================= */
var WIRE_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];
var RHO_NORMAL = 0.0178;  /* مقاومة النحاس عند 20°C */
var RHO_HOT    = 0.0196;  /* مقاومة النحاس عند 50°C (عدن) */

/* =============================================
   حالة التطبيق
============================================= */
var ST = {
  city:     null,
  devs:     {},    /* { id: {qty,dayH,nightH} } */
  dist:     5,
  voltage:  24,
  autoDays: 2
};

/* =============================================
   SPLASH -> APP
   =============================================

   هذا هو القلب — يستخدم setTimeout لـ:
     1. تشغيل شريط التقدم (2500ms)
     2. تلاشي شاشة البداية (بإضافة كلاس .fading)
     3. بعد 500ms من التلاشي: اخفاء splash باضافة .hidden
     4. في نفس الوقت: ازالة .hidden من appContainer لاظهاره
*/
window.addEventListener('load', function () {
  var splash = document.getElementById('splash');
  var app    = document.getElementById('appContainer');

  /*
   * المرحلة 1: بعد 2500ms — نبدأ التلاشي
   */
  setTimeout(function () {

    /* اضافة كلاس التلاشي لـ CSS transition */
    splash.classList.add('fading');

    /*
     * المرحلة 2: بعد 500ms من التلاشي — اخفاء splash واظهار app
     */
    setTimeout(function () {

      /* اخفاء شاشة البداية */
      splash.classList.add('hidden');

      /* ازالة hidden من الحاوية الرئيسية لاظهارها */
      app.classList.remove('hidden');

      /* بناء قائمة الاجهزة */
      buildDevList();
      refreshLiveBar();

    }, 500);

  }, 2500);
});

/* =============================================
   التنقل بين الخطوات
============================================= */
function goStep(n) {
  if (n === 2 && !ST.city) {
    toast('اختر المدينة اولاً');
    return;
  }

  /* اخفاء اللوحة الحالية */
  var panels = document.querySelectorAll('.step-panel');
  for (var i = 0; i < panels.length; i++) {
    panels[i].classList.remove('active');
  }

  /* اظهار اللوحة المطلوبة */
  var target = document.getElementById('panel' + n);
  if (target) target.classList.add('active');

  /* تحديث مؤشر الخطوات */
  updateDots(n);
  ST.currentStep = n;

  /* الصعود للاعلى */
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateDots(active) {
  for (var i = 1; i <= 4; i++) {
    var dot = document.getElementById('dot' + i);
    if (!dot) continue;
    dot.classList.remove('active', 'done');
    if (i < active)      dot.classList.add('done');
    else if (i === active) dot.classList.add('active');
  }
  /* تحديث الموصلات */
  for (var j = 1; j <= 3; j++) {
    var conn = document.getElementById('conn' + j + (j + 1));
    if (!conn) continue;
    if (j < active) conn.classList.add('done');
    else conn.classList.remove('done');
  }
}

/* =============================================
   اختيار المدينة
============================================= */
function pickCity(el) {
  /* ازالة التحديد من الكل */
  var cards = document.querySelectorAll('.city-card');
  for (var i = 0; i < cards.length; i++) {
    cards[i].classList.remove('selected');
  }

  el.classList.add('selected');
  ST.city = el.dataset.city;

  /* شارة المدينة في الهيدر */
  var badge = document.getElementById('cityBadge');
  badge.textContent = CITIES[ST.city].name;
  badge.classList.remove('hidden');

  /* صندوق المعلومات */
  var box = document.getElementById('cityInfoBox');
  box.textContent = CITIES[ST.city].infoText;
  box.classList.remove('hidden');

  /* تفعيل زر التالي */
  document.getElementById('btnStep1Next').disabled = false;
}

/* =============================================
   الخطوة 2 — بناء قائمة الاجهزة
============================================= */
function buildDevList() {
  /* تهيئة الحالة */
  for (var d = 0; d < DEVICES.length; d++) {
    ST.devs[DEVICES[d].id] = { qty: 0, dayH: 4, nightH: 3 };
  }

  /* تجميع الاجهزة حسب التصنيف */
  var cats = {};
  for (var k = 0; k < DEVICES.length; k++) {
    var dev = DEVICES[k];
    if (!cats[dev.cat]) cats[dev.cat] = [];
    cats[dev.cat].push(dev);
  }

  var html = '';
  var catNames = Object.keys(cats);

  for (var c = 0; c < catNames.length; c++) {
    var catName = catNames[c];
    var catDevs = cats[catName];

    html += '<div class="dev-category">';
    html += '<div class="cat-label">' + catName + '</div>';

    for (var x = 0; x < catDevs.length; x++) {
      var dv = catDevs[x];
      var surgeTag = dv.motor
        ? '<span class="surge-tag">Surge x' + dv.surge + '</span>'
        : '';

      html += '<div class="dev-item" id="dev-' + dv.id + '">';

      /* الهيدر */
      html += '<div class="dev-header" onclick="toggleDev('' + dv.id + '')">';
      html += '  <div class="dev-ico">' + dv.icon + '</div>';
      html += '  <div class="dev-info">';
      html += '    <div class="dev-name">' + dv.name + '</div>';
      html += '    <div class="dev-watt">' + surgeTag + dv.w + ' وات</div>';
      html += '  </div>';
      html += '  <div class="dev-counter">';
      html += '    <button class="cnt-btn minus" onclick="chgQty(event,'' + dv.id + '',-1)">&#8722;</button>';
      html += '    <span class="cnt-num" id="qty-' + dv.id + '">0</span>';
      html += '    <button class="cnt-btn plus"  onclick="chgQty(event,'' + dv.id + '',+1)">+</button>';
      html += '  </div>';
      html += '</div>';

      /* ساعات التشغيل */
      html += '<div class="dev-hours">';
      html += '  <div class="hours-grid">';
      html += '    <div class="hours-col">';
      html += '      <div class="hours-lbl">&#9728; ساعات النهار</div>';
      html += '      <div class="slider-row">';
      html += '        <input type="range" min="0" max="12" value="4" class="hr-slider" id="dayS-' + dv.id + '" oninput="chgHours('' + dv.id + '','day',this.value)">';
      html += '        <span class="hr-num" id="dayV-' + dv.id + '">4</span>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="hours-col">';
      html += '      <div class="hours-lbl">&#127769; ساعات الليل</div>';
      html += '      <div class="slider-row">';
      html += '        <input type="range" min="0" max="12" value="3" class="hr-slider night" id="nightS-' + dv.id + '" oninput="chgHours('' + dv.id + '','night',this.value)">';
      html += '        <span class="hr-num night" id="nightV-' + dv.id + '">3</span>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '  <div class="dev-wh-preview">';
      html += '    <span>استهلاك هذا الجهاز / يوم</span>';
      html += '    <span id="devWh-' + dv.id + '">0 Wh</span>';
      html += '  </div>';
      html += '</div>';

      html += '</div>'; /* end dev-item */
    }

    html += '</div>'; /* end dev-category */
  }

  document.getElementById('devicesList').innerHTML = html;
}

function toggleDev(id) {
  var item = document.getElementById('dev-' + id);
  if (ST.devs[id] && ST.devs[id].qty > 0) {
    item.classList.toggle('open');
  }
}

function chgQty(e, id, delta) {
  e.stopPropagation();
  var s   = ST.devs[id];
  s.qty   = Math.max(0, Math.min(10, s.qty + delta));

  document.getElementById('qty-' + id).textContent = s.qty;

  var item = document.getElementById('dev-' + id);
  if (s.qty > 0) {
    item.classList.add('open');
  } else {
    item.classList.remove('open');
  }

  refreshDevWh(id);
  refreshLiveBar();
}

function chgHours(id, type, val) {
  var n = parseInt(val);
  if (type === 'day') {
    ST.devs[id].dayH = n;
    document.getElementById('dayV-' + id).textContent = n;
  } else {
    ST.devs[id].nightH = n;
    document.getElementById('nightV-' + id).textContent = n;
  }
  refreshDevWh(id);
  refreshLiveBar();
}

function refreshDevWh(id) {
  var dev = getDevById(id);
  if (!dev) return;
  var s   = ST.devs[id];
  var wh  = calcDevWh(dev, s);
  document.getElementById('devWh-' + id).textContent = Math.round(wh) + ' Wh';
}

/*
 * حساب Wh لجهاز واحد
 * الثلاجة: Duty Cycle 40% (لا تعمل باستمرار)
 */
function calcDevWh(dev, s) {
  if (s.qty === 0) return 0;
  var ew = dev.w;
  if (dev.id === 'fridge_s' || dev.id === 'fridge_l') ew = dev.w * 0.4;
  return ew * s.qty * (s.dayH + s.nightH);
}

function refreshLiveBar() {
  var sum = getTotals();
  document.getElementById('lbDevices').textContent = sum.devCount + ' جهاز';
  document.getElementById('lbWh').textContent      = Math.round(sum.totalWh) + ' Wh';
  document.getElementById('lbPeak').textContent    = Math.round(sum.peak) + ' W';
}

function getTotals() {
  var totalWh = 0, dayWh = 0, nightWh = 0, peak = 0, devCount = 0;
  var maxSurgeExtra = 0;

  for (var i = 0; i < DEVICES.length; i++) {
    var dev = DEVICES[i];
    var s   = ST.devs[dev.id];
    if (!s || s.qty === 0) continue;
    devCount++;

    var ew = dev.w;
    if (dev.id === 'fridge_s' || dev.id === 'fridge_l') ew = dev.w * 0.4;

    dayWh   += ew * s.qty * s.dayH;
    nightWh += ew * s.qty * s.nightH;
    peak    += ew * s.qty;

    /* الـ Surge: اضافة فرق اعلى جهاز surge فقط */
    var extra = ew * s.qty * (dev.surge - 1.0);
    if (extra > maxSurgeExtra) maxSurgeExtra = extra;
  }

  totalWh = dayWh + nightWh;
  var surgeLoad = peak + maxSurgeExtra;

  return {
    totalWh:   totalWh,
    dayWh:     dayWh,
    nightWh:   nightWh,
    peak:      peak,
    surgeLoad: surgeLoad,
    devCount:  devCount
  };
}

/* =============================================
   الخطوة 3 — التوصيل
============================================= */
function chgDist(d) {
  var inp = document.getElementById('distInput');
  inp.value = Math.max(1, Math.min(100, parseInt(inp.value || 5) + d));
  ST.dist = parseInt(inp.value);
  refreshWireHint();
}

function onDistInput() {
  ST.dist = parseInt(document.getElementById('distInput').value || 5);
  refreshWireHint();
}

function setDist(v) {
  document.getElementById('distInput').value = v;
  ST.dist = v;
  document.querySelectorAll('.preset').forEach(function (b) { b.classList.remove('sel'); });
  var btn = document.querySelector('.preset[onclick="setDist(' + v + ')"]');
  if (btn) btn.classList.add('sel');
  refreshWireHint();
}

function pickVolt(el) {
  document.querySelectorAll('.volt-opt').forEach(function (v) { v.classList.remove('selected'); });
  el.classList.add('selected');
  ST.voltage = parseInt(el.dataset.v);
  refreshWireHint();
}

function pickAuto(el) {
  document.querySelectorAll('.auto-opt').forEach(function (a) { a.classList.remove('selected'); });
  el.classList.add('selected');
  ST.autoDays = parseInt(el.dataset.d);
}

function refreshWireHint() {
  var sum = getTotals();
  if (sum.peak === 0) {
    document.getElementById('wireHint').textContent = '&#128268; اضف الاجهزة اولاً لرؤية التوصية';
    return;
  }
  var I  = sum.peak / ST.voltage;
  var mm = calcWire(ST.dist, I, ST.city === 'aden');
  document.getElementById('wireHint').textContent =
    'مسافة ' + ST.dist + 'م — تيار ' + Math.round(I) + 'A — سلك ' + mm + ' mm2 موصى به';
}

/*
 * حساب سُمك السلك بمعادلة هبوط الجهد
 *
 * DV_max = V x 0.03       (اقصى هبوط مسموح = 3% من الجهد)
 * A_min  = 2 x L x I x rho / DV_max
 * الضرب في 2: التيار يمر ذهاباً وايابا
 */
function calcWire(L, I, isHot) {
  var rho  = isHot ? RHO_HOT : RHO_NORMAL;
  var dvMax = ST.voltage * 0.03;
  var aMin  = (2 * L * I * rho) / dvMax;
  for (var i = 0; i < WIRE_SIZES.length; i++) {
    if (WIRE_SIZES[i] >= aMin) return WIRE_SIZES[i];
  }
  return WIRE_SIZES[WIRE_SIZES.length - 1];
}

/* =============================================
   الخطوة 4 — الحسابات الكاملة
============================================= */
function doCalc() {
  if (!ST.city) { toast('اختر المدينة اولاً'); return; }

  var sum = getTotals();
  if (sum.devCount === 0) { toast('اضف جهازاً واحداً على الاقل'); return; }

  var city = CITIES[ST.city];
  var V    = ST.voltage;

  /*
   * 2) قوة الالواح
   * P = (Wh_total / PSH) x F_sys x F_temp
   * F_sys  = 1.25 (خسائر النظام: كيبلات + اتربة + شحن + حرارة)
   * F_temp = معامل حرارة الالواح للمدينة
   */
  var pWh   = (sum.totalWh / city.psh) * 1.25 * city.tempFactor;
  var pSize = pickPanelSize(pWh);
  var pCnt  = Math.ceil(pWh / pSize);
  var pTot  = pCnt * pSize;

  /*
   * 3) سعة البطاريات
   * Ah = (Wh x Days) / (V x DoD x eta) x F_heat
   * DoD  = 0.5 (لا نفرّغ البطارية اكثر من 50%)
   * eta  = 0.85 (كفاءة البطارية)
   * F_heat = معامل الحرارة للمدينة (عدن: 1.15)
   */
  var rawAh = (sum.totalWh * ST.autoDays) / (V * 0.5 * 0.85);
  var totAh = Math.ceil(rawAh * city.heatFactor);

  var bSize  = pickBattSize(totAh);
  var bCnt   = Math.ceil(totAh / bSize);
  var bType  = pickBattType(totAh, V);

  /*
   * 4) المحول (Inverter)
   * VA = SurgeLoad x 1.25 / PF
   * PF = 0.8 (احمال مختلطة)
   */
  var invVA  = Math.ceil((sum.surgeLoad * 1.25) / 0.8);
  var invStd = roundUp(invVA, [500,700,1000,1500,2000,3000,4000,5000,6000,8000,10000]);

  /*
   * 5) سُمك السلك
   * I_wire = P_panels / V_sys
   * A = (2 x L x I x rho) / (V x 0.03)
   */
  var I_w    = pTot / V;
  var wireS  = calcWire(ST.dist, I_w, ST.city === 'aden');
  var vdrop  = (2 * ST.dist * I_w * RHO_NORMAL) / wireS;
  var vdropP = ((vdrop / V) * 100).toFixed(1);

  /*
   * 6) وحدة الشحن (Charge Controller)
   * I_cc = (P_panels / V) x 1.25
   */
  var Icc  = Math.ceil((pTot / V) * 1.25);
  var ccA  = roundUp(Icc, [10,20,30,40,50,60,80,100]);

  /* عرض النتائج */
  showResults({
    totalWh: sum.totalWh, dayWh: sum.dayWh, nightWh: sum.nightWh, peak: sum.peak,
    pCnt: pCnt, pSize: pSize, pTot: pTot, pWh: pWh,
    totAh: totAh, bCnt: bCnt, bSize: bSize, bType: bType,
    invStd: invStd, invVA: invVA,
    wireS: wireS, vdropP: vdropP, dist: ST.dist,
    Icc: Icc, ccA: ccA,
    city: city, devCount: sum.devCount
  });

  goStep(4);
}

/* ---- دوال مساعدة ---- */
function pickPanelSize(w) {
  if (w <= 200)  return 100;
  if (w <= 600)  return 200;
  if (w <= 1200) return 300;
  if (w <= 2000) return 400;
  return 500;
}

function pickBattSize(ah) {
  var sizes = [250, 200, 150, 120, 100];
  for (var i = 0; i < sizes.length; i++) {
    if (ah / sizes[i] <= 6) return sizes[i];
  }
  return 100;
}

function pickBattType(ah, v) {
  if (ah * v > 5000) return 'ليثيوم LiFePO4 او جل Gel';
  if (ah > 300)      return 'جل Gel او AGM مغلقة';
  return 'AGM مغلقة او تقليدية';
}

function roundUp(v, arr) {
  for (var i = 0; i < arr.length; i++) {
    if (arr[i] >= v) return arr[i];
  }
  return arr[arr.length - 1];
}

function getDevById(id) {
  for (var i = 0; i < DEVICES.length; i++) {
    if (DEVICES[i].id === id) return DEVICES[i];
  }
  return null;
}

/* =============================================
   عرض النتائج
============================================= */
function showResults(r) {
  var V    = ST.voltage;
  var city = r.city;

  document.getElementById('resultCity').textContent =
    city.name + ' — ' + r.devCount + ' اجهزة';

  /* الاستهلاك */
  document.getElementById('rTotalWh').textContent  = Math.round(r.totalWh);
  document.getElementById('rDayWh').textContent    = Math.round(r.dayWh) + ' Wh';
  document.getElementById('rNightWh').textContent  = Math.round(r.nightWh) + ' Wh';
  document.getElementById('rPeak').textContent     = Math.round(r.peak) + ' W';

  /* الالواح */
  document.getElementById('rPanels').textContent   = r.pCnt;
  document.getElementById('rPanelsD').innerHTML    =
    r.pCnt + ' لوح x ' + r.pSize + ' وات<br>اجمالي: ' + r.pTot + ' وات<br>مطلوب: ' + Math.round(r.pWh) + ' وات';
  document.getElementById('rPanelsTip').textContent = city.tiltTip;

  /* البطاريات */
  document.getElementById('rBattAh').textContent   = r.totAh;
  document.getElementById('rBattD').innerHTML      =
    r.bCnt + ' بطارية x ' + r.bSize + ' Ah<br>جهد: ' + V + 'V<br>النوع: ' + r.bType;
  document.getElementById('rBattTip').innerHTML    =
    'مهم: لا تفرّغ البطارية اكثر من 50%. هذا يُضاعف عمرها الافتراضي.' +
    (ST.city === 'aden' ? ' (اضيف +15% للحرارة)' : '');

  /* المحول */
  document.getElementById('rInv').textContent      = r.invStd;
  document.getElementById('rInvD').innerHTML       =
    'حمل جاري: ' + Math.round(r.peak) + ' W<br>موصى به: ' + r.invStd + ' VA';
  document.getElementById('rInvTip').textContent   =
    'يجب ان يدعم Pure Sine Wave لحماية الاجهزة الحساسة';

  /* الاسلاك */
  document.getElementById('rWire').textContent     = r.wireS;
  document.getElementById('rWireD').innerHTML      =
    'مسافة: ' + r.dist + ' متر<br>هبوط الجهد: ' + r.vdropP + '% (مقبول)';
  document.getElementById('rWireTip').textContent  =
    'استخدم نحاساً خالصاً وليس الومنيوم. النحاس اامن واطول عمراً';

  /* وحدة الشحن */
  document.getElementById('rCC').textContent       = r.ccA;
  document.getElementById('rCCD').innerHTML        =
    'MPPT افضل من PWM بـ 15-30%<br>جهد: ' + V + 'V — تيار: ' + r.Icc + 'A';
  document.getElementById('rCCTip').textContent    =
    'MPPT اغلى ثمناً لكنها توفر 15-30% طاقة اضافية';

  /* النصائح */
  var tips = city.tips.concat([
    'اشتري بطاريات ' + r.bType + ' من مصادر موثوقة. البطاريات المقلدة السبب الاول في تلف المنظومة.',
    'لا تشغّل الغسالة والمضخة معاً. الـ Surge المشترك قد يحرق المحول.',
    'افحص البطاريات كل 3 اشهر. تحقق من الجهد الكامل ومستوى الماء.'
  ]);

  var tHTML = '';
  for (var i = 0; i < tips.length; i++) {
    tHTML += '<li>' + tips[i] + '</li>';
  }
  document.getElementById('tipsList').innerHTML = tHTML;

  /* نص المشاركة */
  var txt =
    'خبير الشمس — روشتة المنظومة الشمسية
' +
    '==============================
' +
    'المنطقة: ' + city.name + '
' +
    'الاستهلاك اليومي: ' + Math.round(r.totalWh) + ' Wh
' +
    '------------------------------
' +
    'الالواح: ' + r.pCnt + ' لوح x ' + r.pSize + 'W = ' + r.pTot + 'W
' +
    'البطاريات: ' + r.bCnt + ' x ' + r.bSize + 'Ah (' + V + 'V)
' +
    'النوع: ' + r.bType + '
' +
    'المحول: ' + r.invStd + ' VA
' +
    'وحدة الشحن MPPT: ' + r.ccA + 'A
' +
    'سُمك الاسلاك: ' + r.wireS + ' mm2
' +
    '------------------------------
' +
    'تنبيه: لا تفرّغ البطارية اكثر من 50%
' +
    city.tiltTip + '
' +
    '==============================
' +
    'Yemen Solar Expert';

  document.getElementById('shareBox').textContent = txt;
  window._shareText = txt;
}

/* =============================================
   واتساب + نسخ
============================================= */
function doWA() {
  if (window._shareText) {
    window.open('https://wa.me/?text=' + encodeURIComponent(window._shareText), '_blank');
  }
}

function doCopy() {
  if (!window._shareText) return;
  var btn = document.getElementById('copyBtn');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(window._shareText).then(function () {
      btn.classList.add('copied');
      btn.innerHTML = '&#10003; تم النسخ';
      toast('تم النسخ بنجاح');
      setTimeout(function () {
        btn.classList.remove('copied');
        btn.innerHTML = '&#128203; نسخ';
      }, 2500);
    });
  } else {
    /* Fallback للمتصفحات القديمة */
    var ta = document.createElement('textarea');
    ta.value = window._shareText;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast('تم النسخ بنجاح');
  }
}

/* =============================================
   اعادة الضبط
============================================= */
function doReset() {
  ST.city     = null;
  ST.devs     = {};
  ST.dist     = 5;
  ST.voltage  = 24;
  ST.autoDays = 2;

  document.querySelectorAll('.city-card').forEach(function (c) { c.classList.remove('selected'); });
  document.getElementById('cityBadge').classList.add('hidden');
  document.getElementById('cityInfoBox').classList.add('hidden');
  document.getElementById('btnStep1Next').disabled = true;
  document.getElementById('distInput').value = 5;
  document.getElementById('wireHint').textContent = 'اضف الاجهزة اولاً';

  buildDevList();
  refreshLiveBar();
  goStep(1);
  toast('تم اعادة الضبط');
}

/* =============================================
   Toast
============================================= */
function toast(msg) {
  var el = document.getElementById('toastMsg');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(function () { el.classList.remove('show'); }, 2500);
}

