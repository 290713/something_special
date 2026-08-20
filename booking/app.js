/* ==========================================================================
   Zakazivanje termina — logika aplikacije.
   Sve što se mijenja u svakodnevnom radu nalazi se u config.js.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- helpers: datumi ---------------------------------------------- */

  var MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun',
                'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
  var WEEKDAYS = ['nedjelja', 'ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Date -> '2026-09-12' (lokalno, bez UTC pomjeranja) */
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /** '2026-09-12' -> Date (lokalna ponoć) */
  function parseYmd(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  /** '2026-09-12' + '10:30' -> Date */
  function dateAt(dateStr, timeStr) {
    var d = parseYmd(dateStr);
    d.setHours(toMinutes(timeStr) / 60 | 0, toMinutes(timeStr) % 60, 0, 0);
    return d;
  }

  function toMinutes(hm) {
    var p = hm.split(':');
    return (+p[0]) * 60 + (+p[1]);
  }

  function toHM(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  function addMinutes(date, min) { return new Date(date.getTime() + min * 60000); }

  function formatDate(dateStr) {
    var d = parseYmd(dateStr);
    return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + '.';
  }

  function formatDuration(min) {
    var h = Math.floor(min / 60), m = min % 60;
    if (h && m) return h + ' h ' + m + ' min';
    if (h) return h + ' h';
    return m + ' min';
  }

  function formatPrice(pkg) {
    if (pkg.price === '' || pkg.price === null || pkg.price === undefined) return '';
    return (pkg.priceFrom ? 'od ' : '') + pkg.price + ' ' + CONFIG.currency;
  }

  /* ---------- helpers: config ---------------------------------------------- */

  function getType(id) {
    return CONFIG.sessionTypes.filter(function (t) { return t.id === id; })[0] || null;
  }

  function getPackage(type, id) {
    if (!type) return null;
    return type.packages.filter(function (p) { return p.id === id; })[0] || null;
  }

  function getSchedule(type) {
    return (type && type.schedule) ? type.schedule : CONFIG.schedule;
  }

  function minPrice(type) {
    var prices = type.packages
      .map(function (p) { return p.price; })
      .filter(function (p) { return typeof p === 'number'; });
    return prices.length ? Math.min.apply(null, prices) : null;
  }

  /* ---------- state --------------------------------------------------------- */

  var state = {
    typeId: null,
    packageId: null,
    date: null,
    time: null,
    view: new Date(),        // koji mjesec je prikazan u kalendaru
    busy: [],                // zauzeti intervali [{start: Date, end: Date}]
    loadedRanges: {},        // koji mjeseci su već učitani
    offline: !CONFIG.endpoint,
    lastBooking: null
  };

  var el = {};
  ['summary', 'summary-items', 'type-list', 'step-package', 'type-description', 'package-list',
   'type-notes', 'type-extras', 'step-date', 'cal-grid', 'cal-month', 'cal-prev', 'cal-next',
   'cal-hint', 'step-time', 'slot-list', 'slot-empty', 'step-form', 'booking-form', 'form-error',
   'submit-btn', 'screen-success', 'success-summary', 'success-text', 'success-contact',
   'ics-btn', 'restart-btn', 'step-type', 'studio-name', 'foot-name', 'foot-contact'
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  /* ---------- termini ------------------------------------------------------- */

  /** Svi mogući početci fotografisanja za dati dan, bez provjere zauzetosti. */
  function buildSlots(dateStr, durationMin, schedule) {
    var day = parseYmd(dateStr).getDay();
    if (schedule.days.indexOf(day) === -1) return [];

    var start = toMinutes(schedule.start);
    var end = toMinutes(schedule.end);
    var step = schedule.stepMin || 30;
    var out = [];

    // Pauza (bufferMin) se računa samo prema susjednim fotografisanjima, ne prema kraju dana —
    // inače najduži paketi ne bi stali u radno vrijeme.
    for (var m = start; m + durationMin <= end; m += step) out.push(toHM(m));
    return out;
  }

  function isFree(slotStart, slotEnd) {
    var buffer = (CONFIG.bufferMin || 0) * 60000;
    return state.busy.every(function (b) {
      return slotEnd.getTime() + buffer <= b.start.getTime() ||
             slotStart.getTime() >= b.end.getTime() + buffer;
    });
  }

  function isTooSoon(startDate) {
    return startDate.getTime() - Date.now() < (CONFIG.minNoticeHours || 0) * 3600000;
  }

  /** Slobodni termini za dan — uzima u obzir zauzetost i minimalnu najavu. */
  function freeSlots(dateStr) {
    var type = getType(state.typeId);
    var pkg = getPackage(type, state.packageId);
    if (!type || !pkg) return [];

    return buildSlots(dateStr, pkg.durationMin, getSchedule(type)).filter(function (t) {
      var s = dateAt(dateStr, t);
      var e = addMinutes(s, pkg.durationMin);
      return !isTooSoon(s) && isFree(s, e);
    });
  }

  /* ---------- zauzeti termini sa servera ------------------------------------ */

  function loadBusy(fromDate, toDate) {
    if (!CONFIG.endpoint) return Promise.resolve();

    var key = ymd(fromDate) + '_' + ymd(toDate);
    if (state.loadedRanges[key]) return Promise.resolve();

    var url = CONFIG.endpoint + '?action=busy&from=' + ymd(fromDate) + '&to=' + ymd(toDate);
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        state.loadedRanges[key] = true;
        state.offline = false;
        (data.busy || []).forEach(function (b) {
          state.busy.push({ start: new Date(b.start), end: new Date(b.end) });
        });
        renderCalendar();
        if (state.date) renderSlots();
      })
      .catch(function () {
        // Bez veze sa serverom prikazujemo sve termine; potvrda ide ručno.
        state.offline = true;
      });
  }

  function refreshBusy() {
    state.busy = [];
    state.loadedRanges = {};
    return loadBusy(monthStart(state.view), monthEnd(state.view));
  }

  function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
  function monthEnd(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }

  /* ---------- render: vrste fotografisanja ---------------------------------------- */

  function renderTypes() {
    el['type-list'].innerHTML = '';
    CONFIG.sessionTypes.forEach(function (type) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'card';
      b.setAttribute('aria-pressed', state.typeId === type.id ? 'true' : 'false');

      var price = minPrice(type);
      b.innerHTML =
        '<span class="card__name"></span>' +
        '<span class="card__sub"></span>' +
        (price !== null ? '<span class="card__price">od ' + price + ' ' + CONFIG.currency + '</span>' : '');
      b.querySelector('.card__name').textContent = type.name;
      b.querySelector('.card__sub').textContent = type.subtitle || '';

      b.addEventListener('click', function () { selectType(type.id); });
      el['type-list'].appendChild(b);
    });
  }

  function renderPackages() {
    var type = getType(state.typeId);
    el['step-package'].hidden = !type;
    if (!type) return;

    el['type-description'].textContent = type.description || '';
    el['package-list'].innerHTML = '';

    type.packages.forEach(function (pkg) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pack';
      b.setAttribute('aria-pressed', state.packageId === pkg.id ? 'true' : 'false');

      var html = '<span class="pack__name"></span><span class="pack__meta">';
      var price = formatPrice(pkg);
      if (price) html += '<span class="pack__price">' + price + '</span>';
      html += '<span class="pack__dur">' + formatDuration(pkg.durationMin) + '</span></span>';
      if (pkg.summary) html += '<span class="pack__summary"></span>';
      if (pkg.includes && pkg.includes.length) html += '<ul class="pack__list"></ul>';
      if (pkg.notes && pkg.notes.length) html += '<ul class="pack__notes"></ul>';
      b.innerHTML = html;

      b.querySelector('.pack__name').textContent = pkg.name;
      if (pkg.summary) b.querySelector('.pack__summary').textContent = pkg.summary;
      fillList(b.querySelector('.pack__list'), pkg.includes);
      fillList(b.querySelector('.pack__notes'), pkg.notes);

      b.addEventListener('click', function () { selectPackage(pkg.id); });
      el['package-list'].appendChild(b);
    });

    fillList(el['type-notes'], type.notes);
    el['type-extras'].hidden = !type.extras;
    el['type-extras'].textContent = type.extras || '';
  }

  function fillList(node, items) {
    if (!node) return;
    node.innerHTML = '';
    (items || []).forEach(function (text) {
      var li = document.createElement('li');
      li.textContent = text;
      node.appendChild(li);
    });
  }

  /* ---------- render: kalendar ---------------------------------------------- */

  function renderCalendar() {
    var type = getType(state.typeId);
    var pkg = getPackage(type, state.packageId);
    el['step-date'].hidden = !pkg;
    if (!pkg) return;

    var view = state.view;
    el['cal-month'].textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var last = new Date(today.getTime() + (CONFIG.bookAheadDays || 90) * 86400000);

    el['cal-prev'].disabled = monthStart(view) <= monthStart(today);
    el['cal-next'].disabled = monthStart(view) >= monthStart(last);

    var first = monthStart(view);
    var offset = (first.getDay() + 6) % 7;   // sedmica počinje ponedjeljkom
    var days = monthEnd(view).getDate();

    el['cal-grid'].innerHTML = '';
    for (var i = 0; i < offset; i++) {
      var blank = document.createElement('span');
      blank.className = 'day day--empty';
      el['cal-grid'].appendChild(blank);
    }

    for (var d = 1; d <= days; d++) {
      var date = new Date(view.getFullYear(), view.getMonth(), d);
      var str = ymd(date);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'day';
      btn.textContent = d;
      btn.disabled = date < today || date > last || freeSlots(str).length === 0;
      btn.setAttribute('aria-pressed', state.date === str ? 'true' : 'false');
      btn.setAttribute('aria-label', formatDate(str));
      btn.addEventListener('click', (function (s) {
        return function () { selectDate(s); };
      })(str));
      el['cal-grid'].appendChild(btn);
    }

    var sched = getSchedule(type);
    el['cal-hint'].textContent = 'Radno vrijeme: ' + scheduleText(sched) +
      (state.offline ? '' : ' · zauzeti termini se ne prikazuju');
  }

  function scheduleText(s) {
    var names = ['ned', 'pon', 'uto', 'sri', 'čet', 'pet', 'sub'];
    var isEveryDay = s.days.length === 7;
    var label = isEveryDay ? 'svaki dan' : s.days.map(function (d) { return names[d]; }).join(', ');
    return label + ' ' + s.start + '–' + s.end;
  }

  /* ---------- render: termini ------------------------------------------------ */

  function renderSlots() {
    el['step-time'].hidden = !state.date;
    if (!state.date) return;

    var slots = freeSlots(state.date);
    el['slot-list'].innerHTML = '';
    el['slot-empty'].hidden = slots.length > 0;

    slots.forEach(function (t) {
      var pkg = getPackage(getType(state.typeId), state.packageId);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.textContent = t;
      b.setAttribute('aria-pressed', state.time === t ? 'true' : 'false');
      b.setAttribute('aria-label', t + ' – ' + toHM(toMinutes(t) + pkg.durationMin));
      b.addEventListener('click', function () { selectTime(t); });
      el['slot-list'].appendChild(b);
    });
  }

  /* ---------- render: sažetak ------------------------------------------------ */

  function renderSummary() {
    var type = getType(state.typeId);
    var pkg = getPackage(type, state.packageId);
    var items = [];

    if (type) items.push({ text: type.name, reset: 'type' });
    if (pkg) items.push({ text: pkg.name + (formatPrice(pkg) ? ' · ' + formatPrice(pkg) : ''), reset: 'package' });
    if (state.date) items.push({ text: formatDate(state.date), reset: 'date' });
    if (state.time) items.push({ text: state.time, reset: 'time' });

    el.summary.hidden = items.length === 0;
    el['summary-items'].innerHTML = '';

    items.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.innerHTML = '<span></span><span class="chip__x" aria-hidden="true">✕</span>';
      b.querySelector('span').textContent = item.text;
      b.setAttribute('aria-label', 'Promijeni: ' + item.text);
      b.addEventListener('click', function () { resetFrom(item.reset); });
      el['summary-items'].appendChild(b);
    });
  }

  /* ---------- izbor ---------------------------------------------------------- */

  function selectType(id) {
    state.typeId = id;
    state.packageId = null;
    state.date = null;
    state.time = null;
    el['step-form'].hidden = true;
    renderAll();
    scrollTo(el['step-package']);
  }

  function selectPackage(id) {
    state.packageId = id;
    state.date = null;
    state.time = null;
    el['step-form'].hidden = true;
    state.view = new Date();
    renderAll();
    loadBusy(monthStart(state.view), monthEnd(state.view));
    scrollTo(el['step-date']);
  }

  function selectDate(dateStr) {
    state.date = dateStr;
    state.time = null;
    el['step-form'].hidden = true;
    renderAll();
    scrollTo(el['step-time']);
  }

  function selectTime(t) {
    state.time = t;
    el['step-form'].hidden = false;
    el['form-error'].hidden = true;
    renderAll();
    scrollTo(el['step-form']);
  }

  function resetFrom(level) {
    if (level === 'type') { state.typeId = null; state.packageId = null; state.date = null; state.time = null; }
    if (level === 'package') { state.packageId = null; state.date = null; state.time = null; }
    if (level === 'date') { state.date = null; state.time = null; }
    if (level === 'time') { state.time = null; }
    el['step-form'].hidden = true;
    renderAll();
  }

  function renderAll() {
    renderTypes();
    renderPackages();
    renderCalendar();
    renderSlots();
    renderSummary();
    el['step-package'].hidden = !state.typeId;
    el['step-date'].hidden = !state.packageId;
    el['step-time'].hidden = !state.date;
  }

  function scrollTo(node) {
    if (!node || node.hidden) return;
    requestAnimationFrame(function () { node.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }

  /* ---------- slanje zahtjeva ------------------------------------------------- */

  function collectBooking() {
    var type = getType(state.typeId);
    var pkg = getPackage(type, state.packageId);
    var start = dateAt(state.date, state.time);
    var end = addMinutes(start, pkg.durationMin);

    return {
      typeId: type.id,
      typeName: type.name,
      packageId: pkg.id,
      packageName: pkg.name,
      price: pkg.price === '' ? '' : (pkg.priceFrom ? 'od ' : '') + pkg.price + ' ' + CONFIG.currency,
      durationMin: pkg.durationMin,
      date: state.date,
      time: state.time,
      endTime: toHM(toMinutes(state.time) + pkg.durationMin),
      dateLabel: formatDate(state.date),
      onLocation: !!type.schedule,
      name: document.getElementById('f-name').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      message: document.getElementById('f-message').value.trim(),
      startIso: localIso(start),
      endIso: localIso(end)
    };
  }

  /** '2026-09-12T10:00:00' — lokalno vrijeme, bez pomjeranja u UTC */
  function localIso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
  }

  function validate() {
    var ok = true;
    var checks = {
      name: function (v) { return v.length >= 2; },
      phone: function (v) { return v.replace(/\D/g, '').length >= 6; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
    };

    Object.keys(checks).forEach(function (key) {
      var input = document.getElementById('f-' + key);
      var valid = checks[key](input.value.trim());
      document.querySelector('[data-err="' + key + '"]').hidden = valid;
      if (!valid) ok = false;
    });

    var consent = document.getElementById('f-consent').checked;
    document.querySelector('[data-err="consent"]').hidden = consent;
    if (!consent) ok = false;

    return ok;
  }

  function submit(event) {
    event.preventDefault();
    el['form-error'].hidden = true;
    if (!validate()) return;

    var booking = collectBooking();
    el['submit-btn'].disabled = true;
    el['submit-btn'].textContent = 'Šaljem…';

    if (!CONFIG.endpoint) {
      finishOffline(booking);
      return;
    }

    fetch(CONFIG.endpoint, {
      method: 'POST',
      // text/plain namjerno: tako preglednik ne šalje CORS preflight,
      // koji Google Apps Script ne obrađuje.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(booking)
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok) {
          finishOnline(booking);
        } else if (res && res.reason === 'taken') {
          slotTaken();
        } else {
          finishOffline(booking, true);
        }
      })
      .catch(function () { finishOffline(booking, true); });
  }

  function slotTaken() {
    el['submit-btn'].disabled = false;
    el['submit-btn'].textContent = 'Pošalji zahtjev';
    el['form-error'].hidden = false;
    el['form-error'].textContent = 'Nažalost, taj termin je upravo zauzet. Molim vas izaberite drugo vrijeme.';
    state.time = null;
    el['step-form'].hidden = true;
    refreshBusy().then(renderAll);
    renderAll();
    scrollTo(el['step-time']);
  }

  function finishOnline(booking) {
    state.lastBooking = booking;
    showSuccess(booking, 'Vaš zahtjev je poslat i termin je zabilježen u mom kalendaru. ' +
      'Javljam se vam lično u najkraćem roku da potvrdimo sve detalje.');
  }

  function finishOffline(booking, afterError) {
    state.lastBooking = booking;
    window.location.href = mailtoLink(booking);
    downloadIcs(booking);
    showSuccess(booking, (afterError
      ? 'Slanje preko sajta trenutno nije uspjelo, pa sam vam otvorila pripremljenu poruku. '
      : 'Otvorila sam pripremljenu poruku sa svim podacima. ') +
      'Molim vas pošaljite je (ili mi javite na telefon) — termin potvrđujem lično.');
  }

  function showSuccess(booking, text) {
    ['step-type', 'step-package', 'step-date', 'step-time', 'step-form'].forEach(function (id) {
      el[id].hidden = true;
    });
    el.summary.hidden = true;
    el['success-text'].textContent = text;

    var rows = [
      ['Vrsta fotografisanja', booking.typeName],
      ['Paket', booking.packageName],
      ['Datum', booking.dateLabel],
      ['Vrijeme', booking.time + ' – ' + booking.endTime]
    ];
    if (booking.price) rows.push(['Cijena', booking.price]);

    el['success-summary'].innerHTML = '';
    rows.forEach(function (row) {
      var wrap = document.createElement('div');
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = row[0];
      dd.textContent = row[1];
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      el['success-summary'].appendChild(wrap);
    });

    el['screen-success'].hidden = false;
    scrollTo(el['screen-success']);
  }

  /* ---------- .ics i mailto ---------------------------------------------------- */

  function icsStamp(iso) { return iso.replace(/[-:]/g, ''); }

  function icsText(booking) {
    var title = booking.typeName + ' · ' + booking.packageName;
    var desc = [booking.packageName, booking.price, CONFIG.photographer.name].filter(Boolean).join(' | ');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Booking//Photo//SR',
      'BEGIN:VEVENT',
      'UID:' + Date.now() + '@booking',
      'DTSTAMP:' + icsStamp(localIso(new Date())),
      'DTSTART:' + icsStamp(booking.startIso),
      'DTEND:' + icsStamp(booking.endIso),
      'SUMMARY:' + title,
      'DESCRIPTION:' + desc,
      'LOCATION:' + (CONFIG.photographer.studio || ''),
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  function downloadIcs(booking) {
    var blob = new Blob([icsText(booking)], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'termin-' + booking.date + '.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function mailtoLink(booking) {
    var to = CONFIG.photographer.fallbackEmail || '';
    var subject = 'Zahtjev za termin: ' + booking.typeName + ' — ' + booking.dateLabel;
    var body = [
      'Vrsta fotografisanja: ' + booking.typeName,
      'Paket: ' + booking.packageName + (booking.price ? ' (' + booking.price + ')' : ''),
      'Datum: ' + booking.dateLabel,
      'Vrijeme: ' + booking.time + ' – ' + booking.endTime,
      '',
      'Ime i prezime: ' + booking.name,
      'Telefon: ' + booking.phone,
      'E-mail: ' + booking.email,
      booking.message ? 'Poruka: ' + booking.message : ''
    ].filter(Boolean).join('\n');

    return 'mailto:' + encodeURIComponent(to) +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);
  }

  /* ---------- kontakti u podnožju ---------------------------------------------- */

  function renderContacts() {
    var p = CONFIG.photographer;
    if (p.name) {
      el['studio-name'].textContent = p.name;
      el['foot-name'].textContent = p.name;
      document.title = 'Zakazivanje termina · ' + p.name;
    }
    fillContacts(el['foot-contact'], '');
    fillContacts(el['success-contact'], 'Više o meni: ');
  }

  /** Studio, sajt i Instagram — telefon i e-mail se klijentu ne prikazuju. */
  function fillContacts(node, prefix) {
    var p = CONFIG.photographer;
    var items = [];

    if (p.studio) items.push(document.createTextNode(p.studio));
    if (p.website) items.push(externalLink(p.website, p.website.replace(/^https?:\/\//, '')));
    if (p.instagram) items.push(externalLink(p.instagram, 'Instagram'));

    node.textContent = '';
    if (!items.length) return;

    if (prefix) node.appendChild(document.createTextNode(prefix));
    items.forEach(function (item, i) {
      if (i) node.appendChild(document.createTextNode(' · '));
      node.appendChild(item);
    });
  }

  function externalLink(url, label) {
    var a = document.createElement('a');
    a.href = /^https?:\/\//.test(url) ? url : 'https://' + url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    return a;
  }

  /* ---------- start -------------------------------------------------------------- */

  el['cal-prev'].addEventListener('click', function () {
    state.view = new Date(state.view.getFullYear(), state.view.getMonth() - 1, 1);
    renderCalendar();
    loadBusy(monthStart(state.view), monthEnd(state.view));
  });

  el['cal-next'].addEventListener('click', function () {
    state.view = new Date(state.view.getFullYear(), state.view.getMonth() + 1, 1);
    renderCalendar();
    loadBusy(monthStart(state.view), monthEnd(state.view));
  });

  el['booking-form'].addEventListener('submit', submit);

  el['ics-btn'].addEventListener('click', function () {
    if (state.lastBooking) downloadIcs(state.lastBooking);
  });

  el['restart-btn'].addEventListener('click', function () {
    state.typeId = state.packageId = state.date = state.time = null;
    state.lastBooking = null;
    el['screen-success'].hidden = true;
    el['step-type'].hidden = false;
    el['booking-form'].reset();
    el['submit-btn'].disabled = false;
    el['submit-btn'].textContent = 'Pošalji zahtjev';
    renderAll();
    scrollTo(el['step-type']);
  });

  renderContacts();
  renderAll();
})();
