/**
 * ================================================
 *  خبير الشمس | Yemen Solar Expert
 *  script.js — محرك الحسابات الهندسية
 *
 *  المعادلات المستخدمة:
 *  1. الاستهلاك اليومي  : Wh = W x h
 *  2. قوة الالواح       : P = Wh / PSH x F_loss x F_temp
 *  3. البطاريات (Ah)    : Ah = Wh x days / (V x DoD x eff) x F_heat
 *  4. المحول (Inverter) : VA = SurgeLoad x 1.25 / PF
 *  5. هبوط الجهد (Wire) : A = (2 x L x I x rho) / DV_max
 *  6. وحدة الشحن (CC)   : I_cc = P_panels / V_sys x 1.25
 * ================================================
 */

'use strict';

/* ================================================
   قاعدة بيانات الاجهزة الكهربائية
   ================================================
   كل جهاز يحتوي على:
   id          : معرف فريد
   name        : الاسم بالعربي
   icon        : الايموجي (HTML entity)
   watts       : الاستهلاك الفعلي بالوات
   surgeFactor : معامل تيار البدء (Surge Multiplier)
                 1.0 = بدون محرك
                 2.0-3.0 = اجهزة تحتوي على كمبريسور
   hasMotor    : هل يحتوي على محرك؟
   category    : التصنيف
*/
const APPLIANCES_DB = [
  // --- اضاءة ---
  {
    id: 'led_bulb',
    name: 'لمبة LED',
    icon: '&#128161;',
    watts: 10,
    surgeFactor: 1.0,
    hasMotor: false,
    category: 'اضاءة'
  },
  {
    id: 'led_strip',
    name: 'شريط اضاءة LED',
    icon: '&#10024;',
    watts: 20,
    surgeFactor: 1.0,
    hasMotor: false,
    category: 'اضاءة'
  },
  // --- تبريد ---
  {
    id: 'fan_ceiling',
    name: 'مروحة سقف',
    icon: '&#127744;',
    watts: 75,
    surgeFactor: 1.3,
    hasMotor: true,
    category: 'تبريد'
  },
  {
    id: 'fan_table',
    name: 'مروحة طاولة',
    icon: '&#128168;',
    watts: 45,
    surgeFactor: 1.3,
    hasMotor: true,
    category: 'تبريد'
  },
  // --- الكترونيات ---
  {
    id: 'tv',
    name: 'تلفزيون / شاشة',
    icon: '&#128250;',
    watts: 80,
    surgeFactor: 1.0,
    hasMotor: false,
    category: 'الكترونيات'
  },
  {
    id: 'phone_charger',
    name: 'شاحن جوال',
    icon: '&#128242;',
    watts: 10,
    surgeFactor: 1.0,
    hasMotor: false,
    category: 'الكترونيات'
  },
  {
    id: 'laptop',
    name: 'لابتوب / كمبيوتر',
    icon: '&#128187;',
    watts: 65,
    surgeFactor: 1.0,
    hasMotor: false,
    category: 'الكترونيات'
  },
  {
    id: 'router',
    name: 'راوتر انترنت',
    icon: '&#128225;',
    watts: 15,
    surgeFactor: 1.0,
    hasMotor: false,
    category: 'الكترونيات'
  },
  // --- اجهزة منزلية ---
  {
    id: 'fridge_small',
    name: 'ثلاجة صغيرة',
    icon: '&#129704;',
    watts: 100,
    surgeFactor: 3.0,
    hasMotor: true,
    category: 'اجهزة منزلية'
    /* ملاحظة: الثلاجة لا تشتغل بشكل مستمر
       Duty Cycle = 40% (تشغيل 40% من الوقت)
       الاستهلاك الفعلي = 100W x 0.4 = 40W متوسط
       لكن Surge = 100 x 3 = 300W عند بدء التشغيل */
  },
  {
    id: 'fridge_large',
    name: 'ثلاجة كبيرة',
    icon: '&#127968;',
    watts: 150,
    surgeFactor: 3.0,
    hasMotor: true,
    category: 'اجهزة منزلية'
  },
  {
    id: 'water_pump',
    name: 'مضخة مياه',
    icon: '&#128167;',
    watts: 370,
    surgeFactor: 3.0,
    hasMotor: true,
    category: 'اجهزة منزلية'
  },
  {
    id: 'washing_machine',
    name: 'غسالة ملابس',
    icon: '&#129399;',
    watts: 500,
    surgeFactor: 2.0,
    hasMotor: true,
    category: 'اجهزة منزلية'
  },
  // --- مطبخ ---
  {
    id: 'blender',
    name: 'خلاط / محضرة',
    icon: '&#129379;',
    watts: 350,
    surgeFactor: 2.0,
    hasMotor: true,
    category: 'مطبخ'
  },
  {
    id: 'electric_kettle',
    name: 'غلاية كهربائية',
    icon: '&#9749;',
    watts: 1000,
    surgeFactor: 1.0,
    hasMotor: false,
    category: 'مطبخ'
  },
];

/* ================================================
   بيانات المدن
   ================================================ */
const CITY_DATA = {
  aden: {
    name: 'عدن',
    emoji: '&#127754;',
    emojiPlain: 'عدن',
    /*
     * PSH = Peak Sun Hours (ساعات الذروة الشمسية)
     * عدن: متوسط 5.5 ساعة ذروة يومياً
     * المصدر: NASA SSE / خط عرض 12.8N
     */
    peakSunHours: 5.5,
    /*
     * معامل الامان الحراري للبطاريات:
     * عدن تصل لـ 40C+ مما يقلل كفاءة بطاريات الاسيد 15-20%
     * نضيف 15% تعويضاً على سعة البطارية
     */
    batteryHeatFactor: 1.15,
    /*
     * معامل انخفاض كفاءة الالواح بسبب الحرارة:
     * كل درجة فوق 25C تخسر الالواح ~0.45% من كفاءتها
     * في عدن صيفاً 50C -> (50-25) x 0.0045 = ~11% خسارة
     */
    panelTempFactor: 1.10,
    infoBanner: 'عدن: حرارة عالية جداً تؤثر على البطاريات والالواح. سيتم اضافة هامش امان 15% على سعة البطاريات تعويضاً عن الحرارة، ويُنصح بتهوية جيدة لمنع غليان البطاريات.',
    tiltTip: 'وجّه الالواح ناحية الجنوب بميل 15 درجة.',
    cityTips: [
      { icon: '&#127777;', text: 'ركّب البطاريات في مكان مظلل وجيد التهوية. الحرارة اكبر عدو للبطارية في عدن.' },
      { icon: '&#128295;', text: 'افحص مستوى ماء بطاريات الاسيد كل شهر. الحرارة تسرع تبخره.' },
      { icon: '&#9728;', text: 'وجّه الالواح ناحية الجنوب الجغرافي بميل 15 درجة لتحقيق افضل انتاجية.' },
      { icon: '&#128268;', text: 'استخدم كيبلات مقاومة للحرارة UV. اشعة عدن تتلف العزل السريع.' },
    ]
  },
  dhale: {
    name: 'الضالع',
    emoji: '&#9968;',
    emojiPlain: 'الضالع',
    /*
     * PSH في الضالع: متوسط 5.0 ساعة ذروة
     * (خط عرض 13.7N، ارتفاع ~1500م)
     */
    peakSunHours: 5.0,
    /*
     * الضالع اكثر اعتدالاً حرارياً
     * لا حاجة لهامش حراري اضافي
     */
    batteryHeatFactor: 1.0,
    panelTempFactor: 1.0,
    infoBanner: 'الضالع: مناخ معتدل ومرتفعات صافية. زاوية الميل المثالية للالواح هي 30 درجة نحو الجنوب للحصول على افضل كفاءة سنوية.',
    tiltTip: 'زاوية الميل المثلى في الضالع: 30 درجة نحو الجنوب الجغرافي.',
    cityTips: [
      { icon: '&#128208;', text: 'اضبط زاوية ميل الالواح على 30 درجة نحو الجنوب. هذا يزيد الانتاجية 10-15%.' },
      { icon: '&#127788;', text: 'رياح الضالع قد تكون قوية. تاكد من تثبيت الالواح باطارات صلبة جيداً.' },
      { icon: '&#127783;', text: 'في الشتاء ارفع زاوية الميل قليلاً (35-40 درجة) للاستفادة من الشمس المنخفضة.' },
      { icon: '&#128267;', text: 'البطاريات في الضالع تعمل بكفاءة اكبر بسبب الاعتدال الحراري. عمرها اطول.' },
    ]
  }
};

/* ================================================
   جدول اسماك الاسلاك القياسية (mm2)
   المصدر: IEC 60228 Standard
   ================================================ */
const WIRE_GAUGES_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];

/*
 * مقاومة النحاس الكهربائية rho
 * rho = 0.0178 ohm.mm2/m عند 20C
 * في الحرارة العالية (50C عدن) تزيد ~10%: 0.0196
 */
const COPPER_RESISTIVITY_NORMAL = 0.0178;
const COPPER_RESISTIVITY_HOT    = 0.0196;

/* ================================================
   حالة التطبيق
   ================================================ */
const state = {
  currentStep:   1,
  city:          null,
  appliances:    {},
  wireDistance:  5,
  systemVoltage: 24,
  autonomyDays:  2,
};

/* ================================================
   التهيئة عند تحميل الصفحة
   ================================================ */
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    var splash = document.getElementById('splash');
    var app    = document.getElementById('app');
    splash.classList.add('fade-out');
    setTimeout(function() {
      splash.style.display = 'none';
      app.style.display    = 'flex';
      buildAppliancesList();
      updateLiveSummary();
      updateWirePreview();
    }, 600);
  }, 2200);
});

/* ================================================
   الخطوة 1 — اختيار المدينة
   ================================================ */

function selectCity(card) {
  // ازالة الاختيار من كل البطاقات
  document.querySelectorAll('.city-card').forEach(function(c) {
    c.classList.remove('selected');
  });

  card.classList.add('selected');
  state.city = card.dataset.city;

  // تحديث شارة المدينة في الهيدر
  var badge      = document.getElementById('cityBadge');
  badge.textContent = CITY_DATA[state.city].name;
  badge.style.display = 'block';

  // عرض لافتة المعلومات
  var banner      = document.getElementById('cityInfoBanner');
  banner.textContent = CITY_DATA[state.city].infoBanner;
  banner.style.display = 'block';

  // تفعيل زر التالي
  document.getElementById('btnNext1').disabled = false;
}

/* ================================================
   الخطوة 2 — بناء قائمة الاجهزة
   ================================================ */

function buildAppliancesList() {
  var container = document.getElementById('appliancesContainer');

  // تجميع الاجهزة حسب التصنيف
  var categories = {};
  APPLIANCES_DB.forEach(function(device) {
    if (!categories[device.category]) {
      categories[device.category] = [];
    }
    categories[device.category].push(device);
  });

  // تهيئة state.appliances
  APPLIANCES_DB.forEach(function(device) {
    state.appliances[device.id] = { qty: 0, dayHours: 4, nightHours: 3 };
  });

  // بناء HTML
  var html = '';

  Object.keys(categories).forEach(function(catName) {
    var devices = categories[catName];
    html += '<div class="appliance-category-group">';
    html += '<div class="category-label">' + catName + '</div>';

    devices.forEach(function(device) {
      var surgeLabel = device.hasMotor
        ? '<span class="surge-tag">Surge x' + device.surgeFactor + '</span>'
        : '';

      html += '<div class="appliance-item" id="item-' + device.id + '">';
      html += '  <div class="appliance-header" onclick="toggleAppliance('' + device.id + '')">';
      html += '    <div class="appliance-emoji">' + device.icon + '</div>';
      html += '    <div class="appliance-info">';
      html += '      <div class="appliance-name">' + device.name + '</div>';
      html += '      <div class="appliance-watt">' + surgeLabel + device.watts + ' وات</div>';
      html += '    </div>';
      html += '    <div class="appliance-counter">';
      html += '      <button class="counter-btn minus" onclick="changeQty(event,'' + device.id + '',-1)">&#8722;</button>';
      html += '      <span class="counter-val" id="qty-' + device.id + '">0</span>';
      html += '      <button class="counter-btn plus" onclick="changeQty(event,'' + device.id + '',+1)">+</button>';
      html += '    </div>';
      html += '  </div>';
      html += '  <div class="appliance-hours">';
      html += '    <div class="hours-grid">';
      html += '      <div class="hours-input-group">';
      html += '        <div class="hours-label"><span class="label-icon">&#9728;</span> ساعات النهار</div>';
      html += '        <div class="hours-slider-wrap">';
      html += '          <input type="range" min="0" max="12" step="1" class="hours-slider" id="day-' + device.id + '" value="4" oninput="updateHours('' + device.id + '','day',this.value)" />';
      html += '          <span class="hours-val-display" id="dayVal-' + device.id + '">4</span>';
      html += '        </div>';
      html += '      </div>';
      html += '      <div class="hours-input-group">';
      html += '        <div class="hours-label"><span class="label-icon">&#127769;</span> ساعات الليل</div>';
      html += '        <div class="hours-slider-wrap">';
      html += '          <input type="range" min="0" max="12" step="1" class="hours-slider night" id="night-' + device.id + '" value="3" oninput="updateHours('' + device.id + '','night',this.value)" />';
      html += '          <span class="hours-val-display night" id="nightVal-' + device.id + '">3</span>';
      html += '        </div>';
      html += '      </div>';
      html += '    </div>';
      html += '    <div class="wh-preview" id="whPreview-' + device.id + '">';
      html += '      <span>الاستهلاك اليومي لهذا الجهاز</span>';
      html += '      <span id="whVal-' + device.id + '">0 Wh</span>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    });

    html += '</div>';
  });

  container.innerHTML = html;
}

function toggleAppliance(id) {
  var item = document.getElementById('item-' + id);
  if (state.appliances[id].qty > 0) {
    item.classList.toggle('active');
  }
}

function changeQty(e, id, delta) {
  e.stopPropagation();

  var a    = state.appliances[id];
  var newQ = Math.max(0, Math.min(10, a.qty + delta));
  a.qty    = newQ;

  document.getElementById('qty-' + id).textContent = newQ;

  var item = document.getElementById('item-' + id);
  if (newQ > 0) {
    item.classList.add('active');
  } else {
    item.classList.remove('active');
  }

  updateWhPreview(id);
  updateLiveSummary();
}

function updateHours(id, type, val) {
  var numVal = parseInt(val);
  if (type === 'day') {
    state.appliances[id].dayHours = numVal;
    document.getElementById('dayVal-' + id).textContent = numVal;
  } else {
    state.appliances[id].nightHours = numVal;
    document.getElementById('nightVal-' + id).textContent = numVal;
  }
  updateWhPreview(id);
  updateLiveSummary();
}

/*
 * حساب استهلاك جهاز واحد يومياً (وات ساعة)
 * للثلاجات: نأخذ Duty Cycle 40% لانها لا تعمل باستمرار
 */
function calcDeviceWh(device, appState) {
  var qty        = appState.qty;
  var dayHours   = appState.dayHours;
  var nightHours = appState.nightHours;
  if (qty === 0) return 0;

  var effectiveWatts = device.watts;
  if (device.id === 'fridge_small' || device.id === 'fridge_large') {
    effectiveWatts = device.watts * 0.4;
  }

  return effectiveWatts * qty * (dayHours + nightHours);
}

function updateWhPreview(id) {
  var device = null;
  for (var i = 0; i < APPLIANCES_DB.length; i++) {
    if (APPLIANCES_DB[i].id === id) { device = APPLIANCES_DB[i]; break; }
  }
  if (!device) return;

  var wh = calcDeviceWh(device, state.appliances[id]);
  document.getElementById('whVal-' + id).textContent = Math.round(wh) + ' Wh';
}

function updateLiveSummary() {
  var summary = getLoadSummary();

  document.getElementById('sumDevices').textContent = summary.activeDevices + ' جهاز';
  document.getElementById('sumWh').textContent      = Math.round(summary.totalWh) + ' Wh';
  document.getElementById('sumWatts').textContent   = Math.round(summary.peakLoad) + ' W';
}

/*
 * جمع ملخص الاحمال الكلية
 * يرجع: totalWh, dayWh, nightWh, peakLoad, surgeLoad, activeDevices
 */
function getLoadSummary() {
  var totalWh       = 0;
  var dayWh         = 0;
  var nightWh       = 0;
  var peakLoad      = 0;
  var activeDevices = 0;
  var maxSurgeExtra = 0;

  APPLIANCES_DB.forEach(function(device) {
    var a = state.appliances[device.id];
    if (!a || a.qty === 0) return;
    activeDevices++;

    var effectiveWatts = device.watts;
    if (device.id === 'fridge_small' || device.id === 'fridge_large') {
      effectiveWatts = device.watts * 0.4;
    }

    dayWh   += effectiveWatts * a.qty * a.dayHours;
    nightWh += effectiveWatts * a.qty * a.nightHours;
    peakLoad += effectiveWatts * a.qty;

    /*
     * حساب Surge:
     * في لحظة البدء، الجهاز ذو اعلى surge يسحب تيار بدء عالٍ
     * نحسب الفرق بين surge والتشغيل العادي لهذا الجهاز
     * ونضيف الفرق الاعلى فقط (لانه نادراً ما تبدأ جميع الاجهزة معاً)
     */
    var surgeExtra = effectiveWatts * a.qty * (device.surgeFactor - 1.0);
    if (surgeExtra > maxSurgeExtra) {
      maxSurgeExtra = surgeExtra;
    }
  });

  totalWh = dayWh + nightWh;
  var surgeLoad = peakLoad + maxSurgeExtra;

  return {
    totalWh:       totalWh,
    dayWh:         dayWh,
    nightWh:       nightWh,
    peakLoad:      peakLoad,
    surgeLoad:     surgeLoad,
    activeDevices: activeDevices
  };
}

/* ================================================
   الخطوة 3 — الاسلاك والاعدادات
   ================================================ */

function changeDistance(delta) {
  var input  = document.getElementById('wireDistance');
  var newVal = Math.max(1, Math.min(100, parseInt(input.value || 5) + delta));
  input.value        = newVal;
  state.wireDistance = newVal;
  updateWirePreview();
}

function setDistance(val) {
  document.getElementById('wireDistance').value = val;
  state.wireDistance = val;
  document.querySelectorAll('.preset-btn').forEach(function(b) {
    b.classList.remove('active');
  });
  var btn = document.querySelector('.preset-btn[onclick="setDistance(' + val + ')"]');
  if (btn) btn.classList.add('active');
  updateWirePreview();
}

function selectVoltage(el) {
  document.querySelectorAll('.volt-option').forEach(function(v) {
    v.classList.remove('selected');
  });
  el.classList.add('selected');
  state.systemVoltage = parseInt(el.dataset.volt);
  updateWirePreview();
}

function selectAutonomy(el) {
  document.querySelectorAll('.auto-option').forEach(function(a) {
    a.classList.remove('selected');
  });
  el.classList.add('selected');
  state.autonomyDays = parseInt(el.dataset.days);
}

function updateWirePreview() {
  var dist     = parseInt(document.getElementById('wireDistance').value || 5);
  state.wireDistance = dist;

  var summary  = getLoadSummary();
  var peakLoad = summary.peakLoad;
  var prevText = document.getElementById('wirePreviewText');

  if (peakLoad === 0) {
    prevText.textContent = 'اضف الاجهزة اولاً لرؤية التوصية';
    return;
  }

  var I  = peakLoad / state.systemVoltage;
  var mm = calcWireGauge(dist, I, state.city === 'aden');
  prevText.textContent = 'مسافة ' + dist + 'م — تيار ' + Math.round(I) + 'A — سلك ' + mm + ' mm2 موصى به';
}

/*
 * حساب سُمك السلك المناسب (Voltage Drop Calculation)
 *
 * المعادلة:
 *   DV_max = V_system x 0.03   (هبوط جهد مسموح = 3% من جهد المنظومة)
 *   A_min  = (2 x L x I x rho) / DV_max
 *
 * الضرب في 2 لان التيار يمر ذهاباً وايابا
 * ثم نختار من الجدول القياسي الحجم الاعلى الاقرب
 *
 * @param {number}  L      - طول السلك بالامتار
 * @param {number}  I      - التيار بالامبير
 * @param {boolean} isHot  - هل الطقس حار (عدن)؟
 * @returns {number} سُمك السلك بـ mm2
 */
function calcWireGauge(L, I, isHot) {
  var rho    = isHot ? COPPER_RESISTIVITY_HOT : COPPER_RESISTIVITY_NORMAL;
  var dV_max = state.systemVoltage * 0.03;  // 3% هبوط مسموح

  /*
   * A_min = (2 x L x I x rho) / DV_max
   * الوحدة: mm2
   */
  var A_calc = (2 * L * I * rho) / dV_max;

  // اختيار اقرب حجم قياسي اعلى من القيمة المحسوبة
  for (var k = 0; k < WIRE_GAUGES_MM2.length; k++) {
    if (WIRE_GAUGES_MM2[k] >= A_calc) {
      return WIRE_GAUGES_MM2[k];
    }
  }
  return WIRE_GAUGES_MM2[WIRE_GAUGES_MM2.length - 1];
}

/* ================================================
   الخطوة 4 — الحسابات الكاملة وعرض النتائج
   ================================================ */

function calculateResults() {
  if (!state.city) {
    showToast('الرجاء اختيار المدينة اولاً');
    return;
  }

  var summary       = getLoadSummary();
  var totalWh       = summary.totalWh;
  var dayWh         = summary.dayWh;
  var nightWh       = summary.nightWh;
  var peakLoad      = summary.peakLoad;
  var surgeLoad     = summary.surgeLoad;
  var activeDevices = summary.activeDevices;

  if (activeDevices === 0) {
    showToast('الرجاء اضافة جهاز واحد على الاقل');
    return;
  }

  var cityData = CITY_DATA[state.city];

  /* -----------------------------------------------
     2) حساب قوة الالواح الشمسية
     -----------------------------------------------
     المعادلة:
       P_panels = (Wh_total / PSH) x F_sys x F_temp
     
     حيث:
       Wh_total = الاستهلاك اليومي الكلي
       PSH      = ساعات الذروة الشمسية (5.5 عدن / 5.0 ضالع)
       F_sys    = معامل خسائر النظام = 1.25
                  (كيبلات 3% + اتربة 5% + شحن/تفريغ 8% + حرارة 9%)
       F_temp   = معامل الحرارة على الالواح للمدينة
  ----------------------------------------------- */
  var PSH          = cityData.peakSunHours;
  var F_sys        = 1.25;
  var F_temp       = cityData.panelTempFactor;
  var totalPanelW  = (totalWh / PSH) * F_sys * F_temp;

  var bestPanelW   = choosePanelSize(totalPanelW);
  var panelCount   = Math.ceil(totalPanelW / bestPanelW);
  var actualPanelW = panelCount * bestPanelW;

  /* -----------------------------------------------
     3) حساب سعة البطاريات
     -----------------------------------------------
     المعادلة:
       Ah = (Wh_total x Days) / (V_sys x DoD x eta_bat) x F_heat
     
     حيث:
       Days   = ايام الاحتياط (اختيار المستخدم)
       V_sys  = جهد المنظومة
       DoD    = عمق التفريغ المسموح = 0.5 (50%)
                ** السر الرئيسي في اطالة عمر البطارية **
                ** التفريغ لـ 50% فقط يضاعف العمر الافتراضي **
       eta_bat = كفاءة البطارية = 0.85
       F_heat  = معامل الحرارة للمدينة (عدن +15%)
  ----------------------------------------------- */
  var DoD     = 0.5;   // عمق التفريغ — 50% لحماية البطاريات
  var eta_bat = 0.85;  // كفاءة البطارية
  var F_heat  = cityData.batteryHeatFactor;

  var rawAh   = (totalWh * state.autonomyDays) / (state.systemVoltage * DoD * eta_bat);
  var totalAh = Math.ceil(rawAh * F_heat);

  var batSizes  = [100, 120, 150, 200, 250];
  var bestBatAh = chooseBatterySize(totalAh, batSizes);
  var batCount  = Math.ceil(totalAh / bestBatAh);
  var batType   = recommendBatteryType(totalAh, state.systemVoltage);

  /* -----------------------------------------------
     4) حساب قوة المحول (Inverter)
     -----------------------------------------------
     المعادلة:
       VA = Surge_Load x F_safety / PF
     
     حيث:
       Surge_Load  = اقصى حمل لحظي شامل بدايات المحركات
       F_safety    = معامل امان = 1.25
       PF          = Power Factor = 0.8 للاحمال المختلطة
       VA = W / PF  (تحويل وات الى فولت-امبير)
  ----------------------------------------------- */
  var F_inv_safety = 1.25;
  var PF           = 0.8;
  var inverterVA   = Math.ceil((surgeLoad * F_inv_safety) / PF);
  var inverterStd  = roundUpToStandard(inverterVA, [500,700,1000,1500,2000,3000,4000,5000,6000,8000,10000]);

  /* -----------------------------------------------
     5) حساب سُمك السلك (Voltage Drop)
     -----------------------------------------------
     تفاصيل المعادلة:
       I_max   = P_panels / V_sys  (اقصى تيار من الالواح)
       DV_max  = V_sys x 0.03      (3% هبوط مسموح)
       A_min   = (2 x L x I x rho) / DV_max
  ----------------------------------------------- */
  var I_wire   = actualPanelW / state.systemVoltage;
  var wireMM   = calcWireGauge(state.wireDistance, I_wire, state.city === 'aden');

  /* حساب هبوط الجهد الفعلي للتحقق */
  var vdrop    = (2 * state.wireDistance * I_wire * COPPER_RESISTIVITY_NORMAL) / wireMM;
  var vdropPct = ((vdrop / state.systemVoltage) * 100).toFixed(1);

  /* -----------------------------------------------
     6) وحدة الشحن (Charge Controller / MPPT)
     -----------------------------------------------
     المعادلة:
       I_cc = (P_panels / V_battery) x 1.25
     
     نوصي بـ MPPT بدل PWM لانها اكفأ بـ 15-30%
  ----------------------------------------------- */
  var I_cc  = Math.ceil((actualPanelW / state.systemVoltage) * 1.25);
  var ccStd = roundUpToStandard(I_cc, [10, 20, 30, 40, 50, 60, 80, 100]);

  // عرض النتائج
  displayResults({
    totalWh: totalWh,
    dayWh: dayWh,
    nightWh: nightWh,
    peakLoad: peakLoad,
    totalPanelW: totalPanelW,
    panelCount: panelCount,
    bestPanelW: bestPanelW,
    actualPanelW: actualPanelW,
    totalAh: totalAh,
    batCount: batCount,
    bestBatAh: bestBatAh,
    batType: batType,
    inverterVA: inverterVA,
    inverterStd: inverterStd,
    wireMM: wireMM,
    vdropPct: vdropPct,
    I_cc: I_cc,
    ccStd: ccStd,
    cityData: cityData,
    activeDevices: activeDevices
  });

  goToStep(4);
}

/* ---- دوال مساعدة للحسابات ---- */

function choosePanelSize(totalPanelW) {
  if (totalPanelW <= 200)  return 100;
  if (totalPanelW <= 600)  return 200;
  if (totalPanelW <= 1200) return 300;
  if (totalPanelW <= 2000) return 400;
  return 500;
}

function chooseBatterySize(totalAh, sizes) {
  var sorted = sizes.slice().sort(function(a,b) { return b - a; });
  for (var i = 0; i < sorted.length; i++) {
    if (totalAh / sorted[i] <= 6) return sorted[i];
  }
  return sizes[0];
}

function recommendBatteryType(totalAh, voltage) {
  if ((totalAh * voltage) > 5000) return 'ليثيوم LiFePO4 او جل Gel';
  if (totalAh > 300)              return 'جل Gel او AGM مغلقة';
  return 'AGM مغلقة او تقليدية بالماء';
}

function roundUpToStandard(val, standards) {
  for (var i = 0; i < standards.length; i++) {
    if (standards[i] >= val) return standards[i];
  }
  return standards[standards.length - 1];
}

/* ================================================
   عرض النتائج في الواجهة
   ================================================ */
function displayResults(r) {
  var cityData = r.cityData;
  var V        = state.systemVoltage;

  // الترويسة
  document.getElementById('resultsSubtitle').textContent =
    cityData.name + ' — ' + r.activeDevices + ' اجهزة';

  // 1) الاستهلاك
  document.getElementById('totalWh').textContent  = Math.round(r.totalWh);
  document.getElementById('dayWh').textContent    = Math.round(r.dayWh) + ' Wh نهاراً';
  document.getElementById('nightWh').textContent  = Math.round(r.nightWh) + ' Wh ليلاً';
  document.getElementById('peakLoad').textContent = Math.round(r.peakLoad) + ' W';

  // 2) الالواح
  document.getElementById('panelCount').textContent = r.panelCount;
  document.getElementById('panelDetail').innerHTML  =
    r.panelCount + ' لوح × ' + r.bestPanelW + ' وات<br>' +
    'اجمالي القوة: <strong>' + r.actualPanelW + ' وات</strong><br>' +
    'الطاقة المطلوبة: ' + Math.round(r.totalPanelW) + ' وات';
  document.getElementById('panelTip').textContent = cityData.tiltTip;

  // 3) البطاريات
  document.getElementById('batteryAh').textContent  = r.totalAh;
  document.getElementById('batteryDetail').innerHTML =
    r.batCount + ' بطارية × ' + r.bestBatAh + ' Ah<br>' +
    'جهد المنظومة: ' + V + ' فولت<br>' +
    'النوع المقترح: ' + r.batType;
  document.getElementById('batteryTip').innerHTML =
    '<strong>مهم:</strong> لا تفرّغ البطارية اكثر من 50% — هذا يُضاعف عمرها الافتراضي' +
    (state.city === 'aden' ? '<br>اُضيف +15% تعويض حراري لعدن' : '');

  // 4) المحول
  document.getElementById('inverterVA').textContent  = r.inverterStd;
  document.getElementById('inverterDetail').innerHTML =
    'الحمل الجاري: ' + Math.round(r.peakLoad) + ' وات<br>' +
    'مقترح: ' + r.inverterStd + ' VA';
  document.getElementById('inverterTip').textContent =
    'تاكد ان المحول يدعم Pure Sine Wave لحماية الاجهزة الحساسة';

  // 5) الاسلاك
  document.getElementById('wireMM').textContent    = r.wireMM;
  document.getElementById('wireDetail').innerHTML  =
    'مسافة: ' + state.wireDistance + ' متر<br>' +
    'هبوط الجهد: ' + r.vdropPct + '% فقط (مقبول)';
  document.getElementById('wireTip').textContent   =
    'استخدم نحاس خالص (Copper) وليس الومنيوم — النحاس اامن واطول عمراً';

  // 6) وحدة الشحن
  document.getElementById('ccAmpere').textContent  = r.ccStd;
  document.getElementById('ccDetail').innerHTML    =
    'نوع مقترح: MPPT (افضل من PWM بـ 15-30%)<br>' +
    'جهد المنظومة: ' + V + ' فولت<br>' +
    'تيار الالواح: ' + Math.round(r.I_cc) + ' امبير';
  document.getElementById('ccTip').textContent     =
    'MPPT اغلى لكنها توفر 15-30% طاقة اضافية — تستحق الاستثمار';

  // 7) نصائح الخبير
  var tipsEl  = document.getElementById('expertTipsList');
  var allTips = cityData.cityTips.concat([
    { icon: '&#128267;', text: 'اشتري بطاريات ' + r.batType + ' من مصادر موثوقة. البطاريات المقلدة السبب الاول في تلف المنظومة.' },
    { icon: '&#9888;', text: 'لا تشغّل الغسالة والمضخة في نفس الوقت. الـ Surge المشترك قد يحرق المحول.' },
    { icon: '&#128267;', text: 'افحص البطاريات كل 3 اشهر. تحقق من الجهد الكامل ومستوى الماء.' },
  ]);

  var tipsHTML = '';
  allTips.forEach(function(t) {
    tipsHTML += '<li><span class="tip-icon">' + t.icon + '</span><span>' + t.text + '</span></li>';
  });
  tipsEl.innerHTML = tipsHTML;

  // 8) نص المشاركة
  buildShareText(r);
}

function buildShareText(r) {
  var V    = state.systemVoltage;
  var city = r.cityData.name;

  var text =
    'خبير الشمس — روشتة المنظومة الشمسية
' +
    '================================
' +
    'المنطقة: ' + city + '
' +
    'الاستهلاك اليومي: ' + Math.round(r.totalWh) + ' Wh
' +
    '--------------------------------
' +
    'الالواح الشمسية:
' +
    '  ' + r.panelCount + ' لوح x ' + r.bestPanelW + ' وات = ' + r.actualPanelW + ' وات
' +
    'البطاريات:
' +
    '  ' + r.batCount + ' بطارية x ' + r.bestBatAh + ' Ah (' + V + 'V)
' +
    '  النوع: ' + r.batType + '
' +
    'المحول (Inverter): ' + r.inverterStd + ' VA
' +
    'وحدة الشحن MPPT: ' + r.ccStd + ' A
' +
    'سُمك الاسلاك: ' + r.wireMM + ' mm2
' +
    '--------------------------------
' +
    'تنبيه: لا تفرّغ البطارية اكثر من 50%
' +
    r.cityData.tiltTip + '
' +
    '================================
' +
    'Yemen Solar Expert';

  document.getElementById('shareTextBox').textContent = text;
  window._shareText = text;
}

function shareWhatsApp() {
  var encoded = encodeURIComponent(window._shareText || '');
  window.open('https://wa.me/?text=' + encoded, '_blank');
}

function copyToClipboard() {
  if (navigator.clipboard && window._shareText) {
    navigator.clipboard.writeText(window._shareText).then(function() {
      var btn = document.getElementById('btnCopy');
      btn.classList.add('copied');
      btn.querySelector('span:last-child').textContent = 'تم النسخ';
      showToast('تم نسخ الروشتة بنجاح');
      setTimeout(function() {
        btn.classList.remove('copied');
        btn.querySelector('span:last-child').textContent = 'نسخ النص';
      }, 2500);
    });
  }
}

/* ================================================
   التنقل بين الخطوات
   ================================================ */

function goToStep(step) {
  if (step === 2 && !state.city) {
    showToast('اختر المدينة اولاً');
    return;
  }

  var currentPanel = document.querySelector('.step-panel.active');
  if (currentPanel) currentPanel.classList.remove('active');

  var nextPanel = document.getElementById('panel' + step);
  if (nextPanel) nextPanel.classList.add('active');

  updateStepper(step);
  state.currentStep = step;

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepper(activeStep) {
  for (var i = 1; i <= 4; i++) {
    var item = document.getElementById('stepItem' + i);
    item.classList.remove('active', 'completed');

    if (i < activeStep)       item.classList.add('completed');
    else if (i === activeStep) item.classList.add('active');
  }

  for (var j = 1; j <= 3; j++) {
    var line = document.getElementById('line' + j + (j + 1));
    if (line) {
      if (j < activeStep) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    }
  }
}

/* ================================================
   إعادة ضبط التطبيق
   ================================================ */
function restartApp() {
  state.city          = null;
  state.appliances    = {};
  state.wireDistance  = 5;
  state.systemVoltage = 24;
  state.autonomyDays  = 2;

  document.querySelectorAll('.city-card').forEach(function(c) {
    c.classList.remove('selected');
  });
  document.getElementById('cityBadge').style.display      = 'none';
  document.getElementById('cityInfoBanner').style.display = 'none';
  document.getElementById('btnNext1').disabled             = true;

  buildAppliancesList();
  updateLiveSummary();
  document.getElementById('wireDistance').value = 5;

  goToStep(1);
  showToast('تم اعادة الضبط بنجاح');
}

/* ================================================
   الإشعار المؤقت Toast
   ================================================ */
function showToast(msg) {
  var toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(function() {
    toast.classList.remove('show');
  }, 2500);
}
