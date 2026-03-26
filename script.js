/**
 * =============================================
 *  خبير الشمس | Yemen Solar Expert
 *  script.js — The Engineering Logic Engine
 *
 *  المعادلات المستخدمة:
 *  ─────────────────────────────────────────
 *  1. الاستهلاك اليومي  : Wh = W × h
 *  2. قوة الألواح       : P_panels = Wh_total / PSH × loss_factor
 *  3. البطاريات (Ah)    : Ah = Wh_total × days / (V × DoD × eff)
 *  4. المحول (Inverter) : VA = (Running_W + Surge_W) × safety
 *  5. هبوط الجهد (Wire) : A_mm² = (2 × L × I × ρ) / ΔV_max
 *  6. وحدة الشحن (CC)   : I_cc = P_panels / V_system × 1.25
 * =============================================
 */

'use strict';

/* =============================================
   DATA — قاعدة بيانات الأجهزة الكهربائية
   ============================================= */

/**
 * كل جهاز يحتوي على:
 * id          : معرّف فريد
 * name        : الاسم بالعربي
 * icon        : الإيموجي
 * watts       : الاستهلاك الفعلي (وات)
 * surgeFactor : معامل تيار البدء (مضاعف Surge)
 *               1.0 = بدون محرك (لا surge)
 *               2.0-3.0 = أجهزة تحتوي على كمبريسور أو محرك
 * hasMotor    : هل يحتوي على محرك (Compressor/Motor)؟
 * category    : التصنيف
 */
const APPLIANCES_DB = [
  // --- إضاءة ---
  {
    id: 'led_bulb', name: 'لمبة LED', icon: '💡',
    watts: 10, surgeFactor: 1.0, hasMotor: false, category: 'إضاءة'
  },
  {
    id: 'led_strip', name: 'شريط إضاءة LED', icon: '✨',
    watts: 20, surgeFactor: 1.0, hasMotor: false, category: 'إضاءة'
  },
  // --- تبريد ---
  {
    id: 'fan_ceiling', name: 'مروحة سقف', icon: '🌀',
    watts: 75, surgeFactor: 1.3, hasMotor: true, category: 'تبريد'
  },
  {
    id: 'fan_table', name: 'مروحة طاولة', icon: '💨',
    watts: 45, surgeFactor: 1.3, hasMotor: true, category: 'تبريد'
  },
  // --- ترفيه وإلكترونيات ---
  {
    id: 'tv', name: 'تلفزيون / شاشة', icon: '📺',
    watts: 80, surgeFactor: 1.0, hasMotor: false, category: 'إلكترونيات'
  },
  {
    id: 'phone_charger', name: 'شاحن جوال', icon: '📱',
    watts: 10, surgeFactor: 1.0, hasMotor: false, category: 'إلكترونيات'
  },
  {
    id: 'laptop', name: 'لابتوب / كمبيوتر', icon: '💻',
    watts: 65, surgeFactor: 1.0, hasMotor: false, category: 'إلكترونيات'
  },
  {
    id: 'router', name: 'راوتر إنترنت', icon: '📡',
    watts: 15, surgeFactor: 1.0, hasMotor: false, category: 'إلكترونيات'
  },
  // --- أجهزة منزلية ---
  {
    id: 'fridge_small', name: 'ثلاجة صغيرة', icon: '🧊',
    watts: 100, surgeFactor: 3.0, hasMotor: true, category: 'أجهزة منزلية'
    // ملاحظة: الثلاجة لا تشتغل بشكل مستمر — معامل التشغيل 40% (Duty Cycle)
    // يعني الاستهلاك الفعلي = 100W × 0.4 = 40W متوسط
    // لكن Surge = 100 × 3 = 300W عند بدء التشغيل
  },
  {
    id: 'fridge_large', name: 'ثلاجة كبيرة', icon: '🏠',
    watts: 150, surgeFactor: 3.0, hasMotor: true, category: 'أجهزة منزلية'
    // نفس المنطق — Duty Cycle 40%
  },
  {
    id: 'water_pump', name: 'مضخة مياه', icon: '💧',
    watts: 370, surgeFactor: 3.0, hasMotor: true, category: 'أجهزة منزلية'
  },
  {
    id: 'washing_machine', name: 'غسالة ملابس', icon: '🫧',
    watts: 500, surgeFactor: 2.0, hasMotor: true, category: 'أجهزة منزلية'
  },
  // --- مطبخ ---
  {
    id: 'blender', name: 'خلاط / محضرة', icon: '🥤',
    watts: 350, surgeFactor: 2.0, hasMotor: true, category: 'مطبخ'
  },
  {
    id: 'electric_kettle', name: 'غلاية كهربائية', icon: '☕',
    watts: 1000, surgeFactor: 1.0, hasMotor: false, category: 'مطبخ'
  },
];

/* =============================================
   CITY DATA — بيانات المدن
   ============================================= */
const CITY_DATA = {
  aden: {
    name: 'عدن',
    emoji: '🌊',
    /**
     * PSH = Peak Sun Hours (ساعات الذروة الشمسية)
     * في عدن: متوسط 5.5 ساعة ذروة يومياً
     * (مصدر: NASA SSE / SolarGIS لخط عرض ~12.8°N)
     */
    peakSunHours: 5.5,
    /**
     * معامل الأمان الحراري للبطاريات
     * في عدن تصل الحرارة لـ 40°C+ مما يقلل كفاءة بطاريات الأسيد بنسبة 15-20%
     * نضيف 15% على سعة البطارية كتعويض
     */
    batteryHeatFactor: 1.15,
    /**
     * معامل انخفاض كفاءة الألواح بسبب الحرارة
     * كل درجة فوق 25°C تخسر الألواح ~0.45% من كفاءتها
     * في عدن صيفاً: تصل لـ 50°C → (50-25) × 0.0045 = ~11% خسارة إضافية
     */
    panelTempFactor: 1.10,
    infoBanner: '🌡️ عدن: حرارة عالية جداً صيفاً تؤثر على البطاريات والألواح. سيتم إضافة هامش أمان 15٪ على سعة البطاريات، وتوصية بتهوية جيدة لمنع "غليان" البطاريات.',
    tiltTip: null,
    cityTips: [
      { icon: '🌡️', text: 'ركّب البطاريات في مكان مظلل وجيد التهوية — الحرارة أكبر عدو لها في عدن.' },
      { icon: '🔧', text: 'افحص مستوى ماء بطاريات الأسيد كل شهر — الحرارة تسرّع تبخره.' },
      { icon: '🌞', text: 'وجّه الألواح ناحية الجنوب الجغرافي بميل بسيط 15° لتحقيق أفضل إنتاجية على مدار السنة.' },
      { icon: '🔌', text: 'استخدم كيبلات ذات جودة عالية ومقاومة للحرارة UV — أشعة عدن شديدة وتتلف العزل السريع.' },
    ]
  },
  dhale: {
    name: 'الضالع',
    emoji: '⛰️',
    /**
     * PSH في الضالع: متوسط 5.0 ساعة ذروة يومياً
     * (خط عرض ~13.7°N، ارتفاع ~1500م)
     */
    peakSunHours: 5.0,
    /**
     * الضالع أكثر اعتدالاً حرارياً — لا حاجة لهامش حراري إضافي على البطاريات
     */
    batteryHeatFactor: 1.0,
    panelTempFactor: 1.0,
    infoBanner: '⛰️ الضالع: مناخ أكثر اعتدالاً ومرتفعات صافية. زاوية الميل المثالية للألواح هي 30° نحو الجنوب للحصول على أفضل كفاءة سنوية.',
    tiltTip: 'زاوية الميل المثلى للألواح في الضالع: 30° نحو الجنوب الجغرافي.',
    cityTips: [
      { icon: '📐', text: 'اضبط زاوية ميل الألواح على 30° نحو الجنوب الجغرافي — هذا يزيد الإنتاجية بنسبة 10-15%.' },
      { icon: '🌬️', text: 'رياح الضالع قد تكون قوية — تأكد من تثبيت الألواح بإطارات صلبة ومربوطة جيداً.' },
      { icon: '🌧️', text: 'في فصل الشتاء ارفع زاوية الميل قليلاً (35-40°) للاستفادة من الشمس المنخفضة.' },
      { icon: '🔋', text: 'البطاريات في الضالع تعمل بكفاءة أفضل بسبب الاعتدال الحراري — عمرها الافتراضي أطول.' },
    ]
  }
};

/* =============================================
   WIRE GAUGE TABLE — جدول سُمك الأسلاك
   ============================================= */
/**
 * أحجام الأسلاك القياسية (mm²) مرتبة تصاعدياً
 * المصدر: IEC 60228 Standard
 */
const WIRE_GAUGES_MM2 = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];

/**
 * مقاومة النحاس الكهربائية
 * ρ (Rho) = 0.0178 Ω·mm²/m (عند 20°C)
 * في الحرارة العالية (50°C) تزيد بـ ~10%: 0.0178 × 1.1 ≈ 0.0196
 */
const COPPER_RESISTIVITY_NORMAL = 0.0178; // Ω·mm²/m عند 20°C
const COPPER_RESISTIVITY_HOT    = 0.0196; // Ω·mm²/m عند 50°C (عدن صيفاً)

/* =============================================
   PANEL SIZES — أحجام الألواح الشائعة في اليمن
   ============================================= */
const PANEL_SIZES_W = [100, 150, 200, 250, 300, 350, 400, 500, 550];

/* =============================================
   APP STATE — حالة التطبيق
   ============================================= */
const state = {
  currentStep: 1,
  city: null,          // 'aden' | 'dhale'
  appliances: {},      // { id: { qty, dayHours, nightHours } }
  wireDistance: 5,     // متر
  systemVoltage: 24,   // فولت
  autonomyDays: 2,     // أيام الاحتياط
};

/* =============================================
   INIT — تهيئة التطبيق
   ============================================= */
document.addEventListener('DOMContentLoaded', () => {
  // بدء الـ Splash وإظهار التطبيق بعد الانتهاء
  setTimeout(() => {
    const splash = document.getElementById('splash');
    const app    = document.getElementById('app');
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.style.display = 'none';
      app.style.display    = 'flex';
      buildAppliancesList();
      updateLiveSummary();
      updateWirePreview();
    }, 600);
  }, 2200);
});

/* =============================================
   STEP 1 — اختيار المدينة
   ============================================= */

/**
 * selectCity — يُفعَّل عند النقر على بطاقة مدينة
 * @param {HTMLElement} card - البطاقة المضغوطة
 */
function selectCity(card) {
  // إزالة الاختيار من كل البطاقات
  document.querySelectorAll('.city-card').forEach(c => c.classList.remove('selected'));

  // تفعيل البطاقة المختارة
  card.classList.add('selected');
  state.city = card.dataset.city;

  // تحديث شارة المدينة في الهيدر
  const badge = document.getElementById('cityBadge');
  badge.textContent = CITY_DATA[state.city].emoji + ' ' + CITY_DATA[state.city].name;
  badge.style.display = 'block';

  // عرض لافتة المعلومات
  const banner = document.getElementById('cityInfoBanner');
  banner.textContent = CITY_DATA[state.city].infoBanner;
  banner.style.display = 'block';

  // تفعيل زر "التالي"
  document.getElementById('btnNext1').disabled = false;
}

/* =============================================
   STEP 2 — بناء قائمة الأجهزة ديناميكياً
   ============================================= */

/**
 * buildAppliancesList
 * يبني واجهة قائمة الأجهزة من APPLIANCES_DB
 * ويجمّعها حسب التصنيف (category)
 */
function buildAppliancesList() {
  const container = document.getElementById('appliancesContainer');

  // تجميع الأجهزة حسب التصنيف
  const categories = {};
  APPLIANCES_DB.forEach(device => {
    if (!categories[device.category]) categories[device.category] = [];
    categories[device.category].push(device);
  });

  // تهيئة state.appliances
  APPLIANCES_DB.forEach(device => {
    state.appliances[device.id] = { qty: 0, dayHours: 4, nightHours: 3 };
  });

  // بناء HTML
  let html = '';
  for (const [catName, devices] of Object.entries(categories)) {
    html += `<div class="appliance-category-group">
      <div class="category-label">${catName}</div>`;

    devices.forEach(device => {
      const surgeLabel = device.hasMotor
        ? `<span class="surge-tag">Surge ×${device.surgeFactor}</span>`
        : '';

      html += `
        <div class="appliance-item" id="item-${device.id}">
          <div class="appliance-header" onclick="toggleAppliance('${device.id}')">
            <div class="appliance-emoji">${device.icon}</div>
            <div class="appliance-info">
              <div class="appliance-name">${device.name}</div>
              <div class="appliance-watt">
                ${surgeLabel}${device.watts} وات
              </div>
            </div>
            <div class="appliance-counter">
              <button class="counter-btn minus" onclick="changeQty(event,'${device.id}',-1)">−</button>
              <span class="counter-val" id="qty-${device.id}">٠</span>
              <button class="counter-btn plus" onclick="changeQty(event,'${device.id}',+1)">+</button>
            </div>
          </div>
          <div class="appliance-hours">
            <div class="hours-grid">
              <!-- ساعات النهار -->
              <div class="hours-input-group">
                <div class="hours-label"><span class="label-icon">🌞</span> ساعات النهار</div>
                <div class="hours-slider-wrap">
                  <input
                    type="range" min="0" max="12" step="1"
                    class="hours-slider"
                    id="day-${device.id}"
                    value="4"
                    oninput="updateHours('${device.id}','day',this.value)"
                  />
                  <span class="hours-val-display" id="dayVal-${device.id}">٤</span>
                </div>
              </div>
              <!-- ساعات الليل -->
              <div class="hours-input-group">
                <div class="hours-label"><span class="label-icon">🌙</span> ساعات الليل</div>
                <div class="hours-slider-wrap">
                  <input
                    type="range" min="0" max="12" step="1"
                    class="hours-slider night"
                    id="night-${device.id}"
                    value="3"
                    oninput="updateHours('${device.id}','night',this.value)"
                  />
                  <span class="hours-val-display night" id="nightVal-${device.id}">٣</span>
                </div>
              </div>
            </div>
            <!-- معاينة الاستهلاك الفوري -->
            <div class="wh-preview" id="whPreview-${device.id}">
              <span>الاستهلاك اليومي لهذا الجهاز</span>
              <span id="whVal-${device.id}">٠ وات·ساعة</span>
            </div>
          </div>
        </div>`;
    });

    html += `</div>`;
  }

  container.innerHTML = html;
}

/**
 * toggleAppliance — فتح/إغلاق تفاصيل الجهاز
 */
function toggleAppliance(id) {
  const item = document.getElementById(`item-${id}`);
  if (state.appliances[id].qty > 0) {
    item.classList.toggle('active');
  }
}

/**
 * changeQty — تغيير كمية الجهاز
 * @param {Event}  e   - الحدث (لمنع bubble)
 * @param {string} id  - معرّف الجهاز
 * @param {number} delta - +1 أو -1
 */
function changeQty(e, id, delta) {
  e.stopPropagation();

  const a    = state.appliances[id];
  const newQ = Math.max(0, Math.min(10, a.qty + delta));
  a.qty      = newQ;

  // تحديث العرض بالأرقام العربية
  document.getElementById(`qty-${id}`).textContent = toArabicNum(newQ);

  const item = document.getElementById(`item-${id}`);
  if (newQ > 0) {
    item.classList.add('active');
  } else {
    item.classList.remove('active');
  }

  updateWhPreview(id);
  updateLiveSummary();
}

/**
 * updateHours — تحديث ساعات التشغيل
 */
function updateHours(id, type, val) {
  const numVal = parseInt(val);
  state.appliances[id][type === 'day' ? 'dayHours' : 'nightHours'] = numVal;
  document.getElementById(`${type === 'day' ? 'dayVal' : 'nightVal'}-${id}`).textContent = toArabicNum(numVal);
  updateWhPreview(id);
  updateLiveSummary();
}

/**
 * updateWhPreview — يحدث معاينة وات·ساعة لجهاز واحد
 */
function updateWhPreview(id) {
  const device = APPLIANCES_DB.find(d => d.id === id);
  const a      = state.appliances[id];
  if (!device) return;

  const wh = calcDeviceWh(device, a);
  document.getElementById(`whVal-${id}`).textContent =
    toArabicNum(Math.round(wh)) + ' وات·ساعة';
}

/**
 * calcDeviceWh — حساب استهلاك جهاز واحد يومياً (وات·ساعة)
 * للثلاجات نأخذ 40% Duty Cycle لأنها لا تعمل بشكل متواصل
 */
function calcDeviceWh(device, appState) {
  const { qty, dayHours, nightHours } = appState;
  if (qty === 0) return 0;

  let effectiveWatts = device.watts;
  // الأجهزة التي تحتوي على Compressor (ثلاجة / مكيف) تعمل ~40% من الوقت فقط
  if (['fridge_small', 'fridge_large'].includes(device.id)) {
    effectiveWatts = device.watts * 0.4;
  }

  return effectiveWatts * qty * (dayHours + nightHours);
}

/**
 * updateLiveSummary — تحديث شريط الملخص المباشر
 */
function updateLiveSummary() {
  const { totalWh, peakLoad, activeDevices } = getLoadSummary();

  document.getElementById('sumDevices').textContent = toArabicNum(activeDevices) + ' جهاز';
  document.getElementById('sumWh').textContent =
    toArabicNum(Math.round(totalWh)) + ' Wh';
  document.getElementById('sumWatts').textContent =
    toArabicNum(Math.round(peakLoad)) + ' W';
}

/**
 * getLoadSummary — يجمع ملخص الأحمال
 * يُرجع: totalWh, dayWh, nightWh, peakLoad, surgeLoad, activeDevices
 */
function getLoadSummary() {
  let totalWh = 0, dayWh = 0, nightWh = 0;
  let peakLoad = 0, surgeLoad = 0, activeDevices = 0;
  let maxSurgeDevice = 0;

  APPLIANCES_DB.forEach(device => {
    const a   = state.appliances[device.id];
    if (a.qty === 0) return;
    activeDevices++;

    let effectiveWatts = device.watts;
    if (['fridge_small', 'fridge_large'].includes(device.id)) {
      effectiveWatts = device.watts * 0.4;
    }

    const devDayWh   = effectiveWatts * a.qty * a.dayHours;
    const devNightWh = effectiveWatts * a.qty * a.nightHours;
    dayWh   += devDayWh;
    nightWh += devNightWh;
    totalWh += devDayWh + devNightWh;

    // الحمل الفوري (Running Load) — جميع الأجهزة تعمل في نفس الوقت
    peakLoad += effectiveWatts * a.qty;

    /**
     * حساب Surge Power:
     * نأخذ الجهاز ذو أعلى surge في لحظة البدء
     * + باقي الأجهزة في وضع التشغيل العادي
     */
    const deviceSurge = device.watts * a.qty * device.surgeFactor;
    if (deviceSurge > maxSurgeDevice) maxSurgeDevice = deviceSurge;
    surgeLoad += effectiveWatts * a.qty;
  });

  // Surge Load الكلي = أعلى surge + باقي الأحمال بدونه
  surgeLoad = (surgeLoad - 0) + maxSurgeDevice;

  return { totalWh, dayWh, nightWh, peakLoad, surgeLoad, activeDevices };
}

/* =============================================
   STEP 3 — الأسلاك والإعدادات
   ============================================= */

function changeDistance(delta) {
  const input = document.getElementById('wireDistance');
  const newVal = Math.max(1, Math.min(100, parseInt(input.value || 5) + delta));
  input.value = newVal;
  state.wireDistance = newVal;
  updateWirePreview();
}

function setDistance(val) {
  document.getElementById('wireDistance').value = val;
  state.wireDistance = val;
  document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`.preset-btn[onclick="setDistance(${val})"]`)?.classList.add('active');
  updateWirePreview();
}

function selectVoltage(el) {
  document.querySelectorAll('.volt-option').forEach(v => v.classList.remove('selected'));
  el.classList.add('selected');
  state.systemVoltage = parseInt(el.dataset.volt);
  updateWirePreview();
}

function selectAutonomy(el) {
  document.querySelectorAll('.auto-option').forEach(a => a.classList.remove('selected'));
  el.classList.add('selected');
  state.autonomyDays = parseInt(el.dataset.days);
}

/**
 * updateWirePreview — معاينة سُمك السلك في الخطوة 3
 */
function updateWirePreview() {
  const dist = parseInt(document.getElementById('wireDistance').value || 5);
  state.wireDistance = dist;

  const { peakLoad } = getLoadSummary();
  const I  = peakLoad / state.systemVoltage; // التيار بالأمبير
  const mm = calcWireGauge(dist, I, state.city === 'aden');
  const prevText = document.getElementById('wirePreviewText');

  if (peakLoad === 0) {
    prevText.textContent = 'أضف الأجهزة أولاً لرؤية التوصية';
    return;
  }

  prevText.textContent =
    `مسافة ${dist}م — تيار ${Math.round(I)}A → سلك ${mm} مم² موصى به`;
}

/**
 * calcWireGauge — حساب سُمك السلك المناسب
 *
 * المعادلة الأساسية:
 *   ΔV_max = V_system × 0.03    (هبوط جهد مسموح به = 3% من جهد المنظومة)
 *   A_min  = (2 × L × I × ρ) / ΔV_max
 *
 * ثم نختار من الجدول القياسي الحجم الأقرب الأعلى
 *
 * @param {number}  L      - طول السلك بالأمتار
 * @param {number}  I      - التيار بالأمبير
 * @param {boolean} isHot  - هل الطقس حار (عدن)؟
 * @returns {number} سُمك السلك بمم²
 */
function calcWireGauge(L, I, isHot = false) {
  const rho      = isHot ? COPPER_RESISTIVITY_HOT : COPPER_RESISTIVITY_NORMAL;
  const dV_max   = state.systemVoltage * 0.03; // 3% هبوط مسموح

  /**
   *  المعادلة:
   *  A = (2 × L × I × ρ) / ΔV
   *  الضرب في 2 لأن التيار يمر ذهاباً وإياباً
   */
  const A_calc = (2 * L * I * rho) / dV_max;

  // اختيار أقرب حجم قياسي أعلى من القيمة المحسوبة
  for (const gauge of WIRE_GAUGES_MM2) {
    if (gauge >= A_calc) return gauge;
  }
  return WIRE_GAUGES_MM2[WIRE_GAUGES_MM2.length - 1];
}

/* =============================================
   STEP 4 — حسابات النتيجة الكاملة
   ============================================= */

/**
 * calculateResults — المحرك الرئيسي للحسابات الهندسية
 */
function calculateResults() {
  if (!state.city) {
    showToast('⚠️ الرجاء اختيار المدينة أولاً');
    return;
  }

  const { totalWh, dayWh, nightWh, peakLoad, surgeLoad, activeDevices } = getLoadSummary();

  if (activeDevices === 0) {
    showToast('⚠️ الرجاء إضافة جهاز واحد على الأقل');
    return;
  }

  const cityData = CITY_DATA[state.city];

  /* -----------------------------------------------
     1) الاستهلاك اليومي
     ----------------------------------------------- */
  // لا توجد معادلة — نجمع مباشرة من الأجهزة

  /* -----------------------------------------------
     2) حساب قوة الألواح الشمسية المطلوبة
     -----------------------------------------------
     المعادلة:
       P_panels = (Wh_total / PSH) × F_sys × F_temp
     
     حيث:
       Wh_total = الاستهلاك اليومي
       PSH      = ساعات الذروة الشمسية (حسب المدينة)
       F_sys    = معامل خسائر النظام = 1.25
                  (تشمل: خسارة الشحن/التفريغ 8%، كيبلات 3%، أتربة 5%، درجة حرارة 9%)
       F_temp   = معامل الحرارة على الألواح (للمدينة)
  ----------------------------------------------- */
  const PSH         = cityData.peakSunHours;
  const F_sys       = 1.25;
  const F_temp      = cityData.panelTempFactor;
  const totalPanelW = (totalWh / PSH) * F_sys * F_temp;

  // اختيار حجم اللوح المناسب (الأكثر شيوعاً في السوق)
  const bestPanelW = choosePanelSize(totalPanelW);
  const panelCount = Math.ceil(totalPanelW / bestPanelW);
  const actualPanelW = panelCount * bestPanelW;

  /* -----------------------------------------------
     3) حساب سعة البطاريات
     -----------------------------------------------
     المعادلة:
       Ah = (Wh_total × Days) / (V_sys × DoD × η_batt)
     
     حيث:
       Wh_total = الاستهلاك اليومي
       Days     = أيام الاحتياط (اختيار المستخدم)
       V_sys    = جهد المنظومة
       DoD      = عمق التفريغ المسموح = 0.5 (50%)
                  ** هذا هو السر الرئيسي لإطالة عمر البطارية **
                  ** كلما فرّغت البطارية أقل، عاشت أطول **
       η_batt   = كفاءة البطارية = 0.85 (15% خسارة في الشحن/التفريغ)
       F_heat   = معامل الحرارة للمدينة (عدن +15%)
  ----------------------------------------------- */
  const DoD     = 0.5;   // عمق التفريغ — 50% أمان للبطاريات
  const eta_bat = 0.85;  // كفاءة البطارية العادية
  const F_heat  = cityData.batteryHeatFactor;

  const rawAh   = (totalWh * state.autonomyDays) / (state.systemVoltage * DoD * eta_bat);
  const totalAh = Math.ceil(rawAh * F_heat);

  // اقتراح عدد وسعة البطاريات
  const batSizes  = [100, 120, 150, 200, 250];
  const bestBatAh = chooseBatterySize(totalAh, batSizes);
  const batCount  = Math.ceil(totalAh / bestBatAh);

  // توصية نوع البطارية
  const batType = recommendBatteryType(totalAh, state.systemVoltage);

  /* -----------------------------------------------
     4) حساب قوة المحول (Inverter)
     -----------------------------------------------
     المعادلة:
       VA_inverter = Surge_Load × F_safety
     
     حيث:
       Surge_Load = أقصى حمل لحظي شامل بدايات المحركات
       F_safety   = معامل أمان = 1.25 (25% هامش)
     
     ملاحظة: نحول من Watt إلى VA بقسمة على Power Factor
       PF = 0.8 للأحمال المختلطة
       VA = W / PF
  ----------------------------------------------- */
  const F_inv_safety = 1.25;
  const PF           = 0.8;
  const inverterVA   = Math.ceil((surgeLoad * F_inv_safety) / PF);

  // تقريب لأقرب حجم تجاري
  const inverterStd = roundUpToStandard(inverterVA,
    [500, 700, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000]);

  /* -----------------------------------------------
     5) حساب سُمك السلك (Voltage Drop)
     -----------------------------------------------
     المعادلة الكاملة:
       I_max   = P_panels / V_sys
       ΔV_max  = V_sys × 0.03        (3% هبوط مسموح)
       A_min   = (2 × L × I × ρ) / ΔV_max
     
     الضرب في 2: لأن التيار يسافر ذهاباً وإياباً
  ----------------------------------------------- */
  const I_wire   = (actualPanelW / state.systemVoltage);
  const wireMM   = calcWireGauge(state.wireDistance, I_wire, state.city === 'aden');
  const vdrop    = (2 * state.wireDistance * I_wire * COPPER_RESISTIVITY_NORMAL) / wireMM;
  const vdropPct = ((vdrop / state.systemVoltage) * 100).toFixed(1);

  /* -----------------------------------------------
     6) وحدة الشحن (Charge Controller / MPPT)
     -----------------------------------------------
     المعادلة:
       I_cc = (P_panels / V_battery) × F_safety
     
     نوصي بـ MPPT بدل PWM لأنها أكفأ بـ 10-30%
  ----------------------------------------------- */
  const I_cc   = Math.ceil((actualPanelW / state.systemVoltage) * 1.25);
  const ccStd  = roundUpToStandard(I_cc, [10, 20, 30, 40, 50, 60, 80, 100]);

  /* -----------------------------------------------
     عرض النتائج
  ----------------------------------------------- */
  displayResults({
    // الاستهلاك
    totalWh, dayWh, nightWh, peakLoad,
    // الألواح
    totalPanelW, panelCount, bestPanelW, actualPanelW,
    // البطاريات
    totalAh, batCount, bestBatAh, batType,
    // المحول
    inverterVA, inverterStd,
    // الأسلاك
    wireMM, vdrop, vdropPct,
    // وحدة الشحن
    I_cc, ccStd,
    // معلومات إضافية
    cityData, activeDevices
  });

  goToStep(4);
}

/**
 * choosePanelSize — اختيار حجم اللوح المناسب
 */
function choosePanelSize(totalPanelW) {
  if (totalPanelW <= 200)  return 100;
  if (totalPanelW <= 600)  return 200;
  if (totalPanelW <= 1200) return 300;
  if (totalPanelW <= 2000) return 400;
  return 500;
}

/**
 * chooseBatterySize — اختيار سعة البطارية المناسبة
 */
function chooseBatterySize(totalAh, sizes) {
  // اختيار الحجم الذي يحتاج أقل عدد من البطاريات ولكن ليس كبير جداً
  for (const s of [...sizes].sort((a,b) => b-a)) {
    if (totalAh / s <= 6) return s;
  }
  return sizes[0];
}

/**
 * recommendBatteryType — توصية نوع البطارية
 */
function recommendBatteryType(totalAh, voltage) {
  if (totalAh * voltage > 5000) return 'ليثيوم LiFePO4 (الأفضل) أو جل Gel';
  if (totalAh > 300)             return 'جل Gel أو AGM مغلقة';
  return 'AGM مغلقة أو تقليدية فيها ماء';
}

/**
 * roundUpToStandard — تقريب للحجم التجاري الأعلى
 */
function roundUpToStandard(val, standards) {
  for (const s of standards) {
    if (s >= val) return s;
  }
  return standards[standards.length - 1];
}

/* =============================================
   DISPLAY RESULTS — عرض النتائج
   ============================================= */
function displayResults(r) {
  const { cityData } = r;

  // الترويسة
  document.getElementById('resultsSubtitle').textContent =
    `${cityData.emoji} منظومتك في ${cityData.name} — ${r.activeDevices} أجهزة`;

  // 1) الاستهلاك اليومي
  document.getElementById('totalWh').textContent   = toArabicNum(Math.round(r.totalWh));
  document.getElementById('dayWh').textContent     = toArabicNum(Math.round(r.dayWh)) + ' Wh نهاراً';
  document.getElementById('nightWh').textContent   = toArabicNum(Math.round(r.nightWh)) + ' Wh ليلاً';
  document.getElementById('peakLoad').textContent  = toArabicNum(Math.round(r.peakLoad)) + ' W';

  // 2) الألواح الشمسية
  document.getElementById('panelCount').textContent = toArabicNum(r.panelCount);
  document.getElementById('panelDetail').innerHTML  =
    `${toArabicNum(r.panelCount)} لوح × ${toArabicNum(r.bestPanelW)} وات<br>` +
    `إجمالي القوة: <strong>${toArabicNum(r.actualPanelW)} وات</strong><br>` +
    `الطاقة المطلوبة: ${toArabicNum(Math.round(r.totalPanelW))} وات`;
  document.getElementById('panelTip').textContent =
    cityData.tiltTip || `وجّه الألواح ناحية الجنوب بميل ${state.city === 'aden' ? '15°' : '30°'}`;

  // 3) البطاريات
  document.getElementById('batteryAh').textContent = toArabicNum(r.totalAh);
  document.getElementById('batteryDetail').innerHTML =
    `${toArabicNum(r.batCount)} بطارية × ${toArabicNum(r.bestBatAh)} Ah<br>` +
    `جهد المنظومة: ${toArabicNum(state.systemVoltage)} فولت<br>` +
    `النوع المقترح: ${r.batType}`;
  document.getElementById('batteryTip').innerHTML =
    `⚡ <strong>مهم:</strong> لا تفرّغ البطارية أكثر من 50٪ — هذا يُضاعف عمرها الافتراضي` +
    (state.city === 'aden' ? '<br>🌡️ أُضيف +15٪ تعويض حراري لعدن' : '');

  // 4) المحول
  document.getElementById('inverterVA').textContent = toArabicNum(r.inverterStd);
  document.getElementById('inverterDetail').innerHTML =
    `الحمل الجاري: ${toArabicNum(Math.round(r.peakLoad))} وات<br>` +
    `أعلى Surge: ${toArabicNum(Math.round(r.peakLoad * 1.5))} وات<br>` +
    `مقترح: ${toArabicNum(r.inverterStd)} VA`;
  document.getElementById('inverterTip').textContent =
    'تأكد أن المحول يدعم "Pure Sine Wave" لحماية الأجهزة الحساسة';

  // 5) الأسلاك
  document.getElementById('wireMM').textContent   = r.wireMM;
  document.getElementById('wireDetail').innerHTML =
    `مسافة: ${toArabicNum(state.wireDistance)} متر<br>` +
    `التيار: ${toArabicNum(Math.round(r.I_cc))} أمبير<br>` +
    `هبوط الجهد: ${r.vdropPct}٪ ✓`;
  document.getElementById('wireTip').textContent =
    `استخدم نحاس خالص (Copper) وليس ألمنيوم — النحاس أكثر أماناً وأطول عمراً`;

  // 6) وحدة الشحن
  document.getElementById('ccAmpere').textContent  = toArabicNum(r.ccStd);
  document.getElementById('ccDetail').innerHTML    =
    `نوع مقترح: MPPT (أفضل من PWM بـ 15-30٪)<br>` +
    `جهد المنظومة: ${toArabicNum(state.systemVoltage)} فولت<br>` +
    `تيار الألواح: ${toArabicNum(Math.round(r.I_cc))} أمبير`;
  document.getElementById('ccTip').textContent     =
    'MPPT أغلى ثمناً لكنها توفر 15-30٪ طاقة إضافية — تستحق الاستثمار';

  // 7) نصائح الخبير
  const tipsEl = document.getElementById('expertTipsList');
  const allTips = [
    ...cityData.cityTips,
    { icon: '🔋', text: `اشتري بطاريات ${r.batType} من مصادر موثوقة — البطاريات المقلّدة السبب الأول في تلف المنظومة.` },
    { icon: '📐', text: `وحدة الشحن MPPT ${r.ccStd} أمبير: تأكد أن فولتاج الدخول يتوافق مع ألواحك (Voc).` },
    { icon: '🌡️', text: `افحص البطاريات كل 3 أشهر — تحقق من الجهد الكامل (${state.systemVoltage === 12 ? '12.6V' : state.systemVoltage === 24 ? '25.2V' : '50.4V'}) ومستوى الماء.` },
    { icon: '⚡', text: `لا تشغّل الغسالة والمضخة في نفس الوقت — الـ Surge المشترك قد يحرق المحول.` },
  ];
  tipsEl.innerHTML = allTips
    .map(t => `<li><span class="tip-icon">${t.icon}</span><span>${t.text}</span></li>`)
    .join('');

  // 8) نص المشاركة (واتساب)
  buildShareText(r);
}

/**
 * buildShareText — بناء نص الروشتة للمشاركة عبر واتساب
 */
function buildShareText(r) {
  const { cityData } = r;
  const V = state.systemVoltage;

  const text =
`☀️ روشتة خبير الشمس
━━━━━━━━━━━━━━━━━━━━
📍 المنطقة: ${cityData.name} ${cityData.emoji}
📊 الاستهلاك اليومي: ${Math.round(r.totalWh)} Wh
━━━━━━━━━━━━━━━━━━━━
🌞 الألواح الشمسية:
   ${r.panelCount} لوح × ${r.bestPanelW} وات = ${r.actualPanelW} وات
🔋 البطاريات:
   ${r.batCount} بطارية × ${r.bestBatAh} Ah (${V}V)
   النوع: ${r.batType}
⚙️ المحول (Inverter): ${r.inverterStd} VA
🎛️ وحدة الشحن: MPPT ${r.ccStd} A
🔌 سُمك الأسلاك: ${r.wireMM} مم²
━━━━━━━━━━━━━━━━━━━━
⚠️ هامش أمان البطارية: لا تفرّغ أكثر من 50٪
${cityData.tiltTip ? '📐 ' + cityData.tiltTip : ''}
━━━━━━━━━━━━━━━━━━━━
🤖 صدر من تطبيق خبير الشمس`;

  document.getElementById('shareTextBox').textContent = text;
  window._shareText = text;
}

function shareWhatsApp() {
  const encoded = encodeURIComponent(window._shareText || '');
  window.open(`https://wa.me/?text=${encoded}`, '_blank');
}

function copyToClipboard() {
  if (navigator.clipboard && window._shareText) {
    navigator.clipboard.writeText(window._shareText).then(() => {
      const btn = document.getElementById('btnCopy');
      btn.classList.add('copied');
      btn.querySelector('span:last-child').textContent = 'تم النسخ ✓';
      showToast('✓ تم نسخ الروشتة');
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.querySelector('span:last-child').textContent = 'نسخ النص';
      }, 2500);
    });
  }
}

/* =============================================
   STEP NAVIGATION — التنقل بين الخطوات
   ============================================= */

/**
 * goToStep — الانتقال إلى خطوة معينة
 */
function goToStep(step) {
  if (step === 2 && !state.city) {
    showToast('⚠️ اختر المدينة أولاً');
    return;
  }

  // إخفاء اللوحة الحالية
  const currentPanel = document.querySelector('.step-panel.active');
  if (currentPanel) currentPanel.classList.remove('active');

  // إظهار اللوحة الجديدة
  const nextPanel = document.getElementById(`panel${step}`);
  if (nextPanel) nextPanel.classList.add('active');

  // تحديث مؤشرات الـ Stepper
  updateStepper(step);
  state.currentStep = step;

  // الصعود لأعلى الصفحة
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * updateStepper — تحديث مؤشرات الـ Stepper البصرية
 */
function updateStepper(activeStep) {
  for (let i = 1; i <= 4; i++) {
    const item = document.getElementById(`stepItem${i}`);
    item.classList.remove('active', 'completed');

    if (i < activeStep)      item.classList.add('completed');
    else if (i === activeStep) item.classList.add('active');
  }

  // تحديث خطوط الوصل
  for (let i = 1; i <= 3; i++) {
    const line = document.getElementById(`line${i}${i+1}`);
    if (line) {
      line.classList.toggle('active', i < activeStep);
    }
  }
}

/* =============================================
   UTILITIES — أدوات مساعدة
   ============================================= */

/**
 * toArabicNum — تحويل الأرقام الإنجليزية إلى عربية
 */
function toArabicNum(n) {
  if (n === undefined || n === null) return '٠';
  return String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[d]);
}

/**
 * showToast — عرض إشعار مؤقت في أسفل الشاشة
 */
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

/**
 * restartApp — إعادة ضبط التطبيق من البداية
 */
function restartApp() {
  // إعادة state
  state.city          = null;
  state.appliances    = {};
  state.wireDistance  = 5;
  state.systemVoltage = 24;
  state.autonomyDays  = 2;

  // إعادة UI
  document.querySelectorAll('.city-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('cityBadge').style.display   = 'none';
  document.getElementById('cityInfoBanner').style.display = 'none';
  document.getElementById('btnNext1').disabled          = true;

  // إعادة بناء قائمة الأجهزة
  buildAppliancesList();
  updateLiveSummary();

  // العودة للخطوة الأولى
  goToStep(1);
  showToast('🔄 تم إعادة الضبط');
}