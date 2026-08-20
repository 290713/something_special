/**
 * Приём заявок с сайта записи: письмо на почту + событие в Google Календаре.
 *
 * Как подключить — по шагам в booking/README.md.
 * Ниже нужно проверить только блок НАСТРОЙКИ.
 */

/* ======================= НАСТРОЙКИ ======================= */

// Куда слать уведомления. Пусто = на почту того аккаунта, где создан скрипт.
var NOTIFY_EMAIL = 'bjelobrkovic.ph@gmail.com';

// В какой календарь писать съёмки. 'primary' = основной календарь аккаунта.
var CALENDAR_ID = 'primary';

// Часовой пояс студии. Все даты с сайта понимаются в этом поясе.
var TIMEZONE = 'Europe/Podgorica';

// Технический перерыв между съёмками (минуты) — должен совпадать с bufferMin в config.js.
var BUFFER_MIN = 15;

// Отправлять ли клиенту письмо-подтверждение.
var SEND_CLIENT_CONFIRMATION = true;

// Приглашать ли клиента в событие календаря (он получит приглашение от Google).
var INVITE_CLIENT = false;

/* ================= КОД (менять не нужно) ================= */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    if (action !== 'busy') return json({ ok: true, message: 'Booking endpoint radi.' });

    var from = parseDay(e.parameter.from);
    var to = parseDay(e.parameter.to);
    to.setDate(to.getDate() + 1); // включительно последний день

    var busy = getCalendar().getEvents(from, to)
      .filter(function (ev) { return ev.getMyStatus() !== CalendarApp.GuestStatus.NO; })
      .map(function (ev) {
        // Только границы занятости — без названий событий.
        return { start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString() };
      });

    return json({ ok: true, busy: busy });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    var data = JSON.parse(e.postData.contents);
    var start = parseDateTime(data.startIso);
    var end = parseDateTime(data.endIso);

    if (isTaken(start, end)) return json({ ok: false, reason: 'taken' });

    var event = createEvent(data, start, end);
    notifyPhotographer(data);
    if (SEND_CLIENT_CONFIRMATION && data.email) notifyClient(data);

    return json({ ok: true, eventId: event.getId() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function isTaken(start, end) {
  var buffer = BUFFER_MIN * 60000;
  var window = getCalendar().getEvents(new Date(start.getTime() - buffer), new Date(end.getTime() + buffer));
  return window.some(function (ev) {
    if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return false;
    return ev.getStartTime().getTime() - buffer < end.getTime() &&
           ev.getEndTime().getTime() + buffer > start.getTime();
  });
}

function createEvent(data, start, end) {
  var title = data.typeName + ' · ' + data.packageName + ' — ' + data.name;
  var description = [
    'Paket: ' + data.packageName,
    data.price ? 'Cijena: ' + data.price : '',
    'Trajanje: ' + data.durationMin + ' min',
    '',
    'Klijent: ' + data.name,
    'Telefon: ' + data.phone,
    'E-mail: ' + data.email,
    data.message ? 'Poruka: ' + data.message : '',
    '',
    'Zahtjev poslat preko sajta za zakazivanje.'
  ].filter(Boolean).join('\n');

  var options = { description: description };
  if (data.onLocation) options.location = 'Na lokaciji (dogovoriti sa klijentom)';
  if (INVITE_CLIENT && data.email) {
    options.guests = data.email;
    options.sendInvites = true;
  }

  var event = getCalendar().createEvent(title, start, end, options);
  event.addPopupReminder(24 * 60);
  return event;
}

function notifyPhotographer(data) {
  var to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
  var subject = 'Novo zakazivanje: ' + data.typeName + ' — ' + data.dateLabel + ' u ' + data.time;
  var body = [
    'Novi zahtjev za termin',
    '',
    'Vrsta fotografisanja: ' + data.typeName,
    'Paket: ' + data.packageName + (data.price ? ' (' + data.price + ')' : ''),
    'Datum: ' + data.dateLabel,
    'Vrijeme: ' + data.time + ' – ' + data.endTime + ' (' + data.durationMin + ' min)',
    '',
    'Ime i prezime: ' + data.name,
    'Telefon: ' + data.phone,
    'E-mail: ' + data.email,
    data.message ? 'Poruka: ' + data.message : '',
    '',
    'Termin je već upisan u kalendar.'
  ].filter(Boolean).join('\n');

  var options = { name: 'Booking' };
  if (data.email) options.replyTo = data.email;
  MailApp.sendEmail(to, subject, body, options);
}

function notifyClient(data) {
  var subject = 'Vaš zahtjev za termin je primljen';
  var body = [
    'Poštovani/a ' + data.name + ',',
    '',
    'primila sam vaš zahtjev za fotografisanje:',
    '',
    'Vrsta fotografisanja: ' + data.typeName,
    'Paket: ' + data.packageName + (data.price ? ' (' + data.price + ')' : ''),
    'Datum: ' + data.dateLabel,
    'Vrijeme: ' + data.time + ' – ' + data.endTime,
    '',
    'Javljam se u najkraćem roku da potvrdimo sve detalje.',
    '',
    'Srdačan pozdrav'
  ].join('\n');

  MailApp.sendEmail(data.email, subject, body);
}

function getCalendar() {
  return CALENDAR_ID === 'primary'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CALENDAR_ID);
}

/** '2026-09-12T10:00:00' — читается как местное время студии. */
function parseDateTime(iso) {
  return Utilities.parseDate(iso.replace('T', ' '), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

/** '2026-09-12' — начало дня по времени студии. */
function parseDay(day) {
  return Utilities.parseDate(day, TIMEZONE, 'yyyy-MM-dd');
}

function json(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Проверка настройки: запустите вручную из редактора (кнопка «Выполнить»).
 * Создаёт тестовую заявку на завтра и присылает письмо — потом удалите событие.
 */
function testBooking() {
  var tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  var day = Utilities.formatDate(tomorrow, TIMEZONE, 'yyyy-MM-dd');

  var result = doPost({
    postData: {
      contents: JSON.stringify({
        typeName: 'TEST — Newborn fotografisanje',
        packageName: 'Baby Start',
        price: '150 €',
        durationMin: 120,
        date: day,
        time: '10:00',
        endTime: '12:00',
        dateLabel: day,
        name: 'Test Klijent',
        phone: '+382 00 000 000',
        email: Session.getEffectiveUser().getEmail(),
        message: 'Ovo je test.',
        startIso: day + 'T10:00:00',
        endIso: day + 'T12:00:00'
      })
    }
  });

  Logger.log(result.getContent());
}
