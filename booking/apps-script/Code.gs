/**
 * Приём заявок с сайта записи:
 *   — событие в Google Календаре;
 *   — уведомление вам в Telegram и на почту сразу после заявки;
 *   — напоминание вам за 2 дня до съёмки, с контактами клиента.
 * Клиенту скрипт ничего не пишет — вы связываетесь с ним сами.
 *
 * Как подключить — по шагам в booking/README.md.
 * Ниже нужно проверить только блок НАСТРОЙКИ.
 */

/* ======================= НАСТРОЙКИ ======================= */

// Куда слать уведомления. Пусто = на почту того аккаунта, где создан скрипт.
var NOTIFY_EMAIL = 'bjelobrkovic.ph@gmail.com';

// В какой календарь ЗАПИСЫВАТЬ съёмки. 'primary' = основной календарь того
// аккаунта, под которым создан скрипт (должен быть bjelobrkovic.ph@gmail.com).
var CALENDAR_ID = 'primary';

// Какие ЧУЖИЕ календари учитывать как занятость: если там что-то стоит,
// это время не предлагается клиентам. Календарь из CALENDAR_ID учитывается
// всегда, отдельно писать его сюда не нужно.
// Важно: каждый из этих календарей нужно один раз расшарить на аккаунт,
// под которым работает скрипт (см. README, раздел «Чужие календари»).
var BUSY_CALENDAR_IDS = [
  'elenabjelobrkovic@gmail.com',
  'nowcreativespace305@gmail.com'
];

// Часовой пояс студии. Все даты с сайта понимаются в этом поясе.
var TIMEZONE = 'Europe/Podgorica';

// Технический перерыв между съёмками (минуты) — должен совпадать с bufferMin в config.js.
var BUFFER_MIN = 15;

// --- Уведомления вам в Telegram (см. README, раздел «Telegram») ---
// Пока оба поля пустые, Telegram просто не используется.
var TELEGRAM_BOT_TOKEN = '';
var TELEGRAM_CHAT_ID = '';

// --- Напоминание вам о предстоящих съёмках ---
var REMIND_ME_BEFORE = true;           // присылать напоминание перед съёмкой
var REMINDER_DAYS_BEFORE = 2;          // за сколько дней напоминать
var REMINDER_HOUR = 10;                // в котором часу присылать напоминание

// --- Письма клиенту ---
// Выключено: с клиентом вы связываетесь сами. Поставьте true, если передумаете.
var SEND_CLIENT_CONFIRMATION = false;  // письмо клиенту сразу после записи
var INVITE_CLIENT = false;             // приглашение клиенту в событие календаря

// Подпись в письмах клиенту (используется, только если включено письмо выше).
var SIGNATURE_NAME = 'Elena Bjelobrković Photography';
var CONTACT_PHONE = '+382 67 841 779';

/* ================= КОД (менять не нужно) ================= */

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || '';
    if (action !== 'busy') return json({ ok: true, message: 'Booking endpoint radi.' });

    var from = parseDay(e.parameter.from);
    var to = parseDay(e.parameter.to);
    to.setDate(to.getDate() + 1); // включительно последний день

    // Занятость собирается по всем календарям сразу: своему и расшаренным.
    var busy = getEventsAcrossCalendars(from, to).map(function (ev) {
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
    notifyTelegram(data);
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
  var window = getEventsAcrossCalendars(
    new Date(start.getTime() - buffer),
    new Date(end.getTime() + buffer)
  );
  return window.some(function (ev) {
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

  // Скрытая пометка: по ней потом находим съёмки, о которых надо напомнить.
  event.setTag('booking', JSON.stringify({
    name: data.name,
    email: data.email,
    phone: data.phone,
    typeName: data.typeName,
    packageName: data.packageName
  }));

  return event;
}

/* ---------------------- уведомления вам ---------------------- */

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

/** Сообщение вам в Telegram. Если бот не настроен — тихо пропускается. */
function notifyTelegram(data) {
  var text = [
    '📸 <b>Novo zakazivanje</b>',
    '',
    '<b>' + escapeHtml(data.typeName) + '</b> · ' + escapeHtml(data.packageName) +
      (data.price ? ' (' + escapeHtml(data.price) + ')' : ''),
    '📅 ' + escapeHtml(data.dateLabel),
    '🕒 ' + data.time + ' – ' + data.endTime,
    '',
    '👤 ' + escapeHtml(data.name),
    '📞 ' + escapeHtml(data.phone),
    '✉️ ' + escapeHtml(data.email),
    data.message ? '💬 ' + escapeHtml(data.message) : ''
  ].filter(Boolean).join('\n');

  var buttons = [];
  var wa = whatsappLink(data.phone);
  if (wa) buttons.push({ text: 'Napiši na WhatsApp', url: wa });

  sendTelegram(text, buttons);
}

function sendTelegram(text, buttons) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  var payload = {
    chat_id: String(TELEGRAM_CHAT_ID),
    text: text,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };
  if (buttons && buttons.length) {
    payload.reply_markup = JSON.stringify({ inline_keyboard: [buttons] });
  }

  try {
    UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
  } catch (err) {
    // Telegram не должен ломать запись: заявка уже в календаре и на почте.
    Logger.log('Telegram: ' + err);
  }
}

/** Ссылка на чат с клиентом в WhatsApp — открывается в один клик из Telegram. */
function whatsappLink(phone) {
  var digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 8 ? 'https://wa.me/' + digits : '';
}

function escapeHtml(text) {
  return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------------------- письма клиенту ---------------------- */

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
    'Srdačan pozdrav,',
    signature()
  ].filter(Boolean).join('\n');

  MailApp.sendEmail(data.email, subject, body);
}

/* ---------------------- напоминание вам ---------------------- */

/**
 * Напоминание вам о съёмках, до которых осталось REMINDER_DAYS_BEFORE дней:
 * по одному сообщению на съёмку, с контактами клиента и кнопкой WhatsApp,
 * чтобы вы могли написать ему сами. Запускается раз в день —
 * триггер ставится функцией installReminderTrigger (см. README).
 */
function sendReminders() {
  if (!REMIND_ME_BEFORE) return;

  var today = new Date();
  var target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + REMINDER_DAYS_BEFORE);
  var dayEnd = new Date(target.getTime() + 86400000);
  var date = Utilities.formatDate(target, TIMEZONE, 'dd.MM.yyyy');
  var forEmail = [];

  getCalendar().getEvents(target, dayEnd).forEach(function (ev) {
    var raw = ev.getTag('booking');
    if (!raw || ev.getTag('reminderSent')) return;

    var booking;
    try { booking = JSON.parse(raw); } catch (err) { return; }

    var time = Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'HH:mm');
    var endTime = Utilities.formatDate(ev.getEndTime(), TIMEZONE, 'HH:mm');

    var text = [
      '🔔 <b>Za ' + REMINDER_DAYS_BEFORE + ' dana — fotografisanje</b>',
      '',
      '<b>' + escapeHtml(booking.typeName) + '</b> · ' + escapeHtml(booking.packageName),
      '📅 ' + date + '  🕒 ' + time + ' – ' + endTime,
      '',
      '👤 ' + escapeHtml(booking.name),
      '📞 ' + escapeHtml(booking.phone),
      booking.email ? '✉️ ' + escapeHtml(booking.email) : '',
      '',
      'Vrijeme je da se javite klijentu.'
    ].filter(Boolean).join('\n');

    var buttons = [];
    var wa = whatsappLink(booking.phone);
    if (wa) buttons.push({ text: 'Napiši na WhatsApp', url: wa });

    sendTelegram(text, buttons);

    forEmail.push([
      booking.typeName + ' · ' + booking.packageName,
      'Vrijeme: ' + time + ' – ' + endTime,
      'Klijent: ' + booking.name,
      'Telefon: ' + booking.phone,
      booking.email ? 'E-mail: ' + booking.email : ''
    ].filter(Boolean).join('\n'));

    ev.setTag('reminderSent', new Date().toISOString());
  });

  if (forEmail.length) {
    var to = NOTIFY_EMAIL || Session.getEffectiveUser().getEmail();
    MailApp.sendEmail(
      to,
      'Podsjetnik: fotografisanja ' + date + ' (' + forEmail.length + ')',
      'Za ' + REMINDER_DAYS_BEFORE + ' dana, ' + date + ':\n\n' + forEmail.join('\n\n') +
        '\n\nVrijeme je da se javite klijentima.'
    );
  }

  Logger.log('Podsjetnika poslato: ' + forEmail.length);
}

/**
 * Ставит ежедневный запуск напоминаний. Запустите один раз вручную
 * из редактора скрипта — и потом ещё раз, если поменяете REMINDER_HOUR.
 */
function installReminderTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendReminders') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('sendReminders')
    .timeBased()
    .everyDays(1)
    .atHour(REMINDER_HOUR)
    .create();

  Logger.log('Podsjetnici se šalju svaki dan oko ' + REMINDER_HOUR + ' h.');
}

/* ---------------------- вспомогательное ---------------------- */

function signature() {
  return [SIGNATURE_NAME, CONTACT_PHONE].filter(Boolean).join('\n');
}

/** Календарь, в который записываются съёмки. */
function getCalendar() {
  return CALENDAR_ID === 'primary'
    ? CalendarApp.getDefaultCalendar()
    : CalendarApp.getCalendarById(CALENDAR_ID);
}

/** Все календари, которые считаются занятостью: свой плюс расшаренные. */
function getBusyCalendars() {
  var calendars = [getCalendar()];

  BUSY_CALENDAR_IDS.forEach(function (id) {
    if (!id) return;
    var calendar = null;
    try { calendar = CalendarApp.getCalendarById(id); } catch (err) { calendar = null; }

    if (calendar) calendars.push(calendar);
    // Календарь не расшарен на этот аккаунт — молча пропускаем, чтобы одна
    // неверная строка не сломала запись. Проверить можно функцией testCalendars.
    else Logger.log('Kalendar nije dostupan: ' + id);
  });

  return calendars;
}

/** События из всех календарей за период, без дублей и без отклонённых. */
function getEventsAcrossCalendars(from, to) {
  var seen = {};
  var events = [];

  getBusyCalendars().forEach(function (calendar) {
    calendar.getEvents(from, to).forEach(function (ev) {
      if (isDeclined(ev)) return;

      // Одно и то же событие может лежать сразу в двух календарях.
      var key = ev.getId() + '@' + ev.getStartTime().getTime();
      if (seen[key]) return;
      seen[key] = true;
      events.push(ev);
    });
  });

  return events;
}

/** Приглашение, от которого отказались, занятостью не считается. */
function isDeclined(ev) {
  try {
    return ev.getMyStatus() === CalendarApp.GuestStatus.NO;
  } catch (err) {
    return false;
  }
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

/* ---------------------- проверка настройки ---------------------- */

/**
 * Тестовая заявка: создаёт съёмку на завтра, шлёт письмо и сообщение в Telegram.
 * Запустите вручную из редактора, потом удалите тестовое событие из календаря.
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

/**
 * Проверка календарей: показывает, куда пишутся съёмки и какие чужие
 * календари скрипт реально видит. Запустите вручную и откройте View → Logs.
 */
function testCalendars() {
  var target = getCalendar();
  Logger.log('Snimanja se upisuju u: ' + target.getName() + '  (' + target.getId() + ')');

  BUSY_CALENDAR_IDS.forEach(function (id) {
    var calendar = null;
    try { calendar = CalendarApp.getCalendarById(id); } catch (err) { calendar = null; }
    Logger.log(calendar
      ? 'OK — zauzeća se čitaju iz: ' + id
      : 'NIJE DOSTUPAN: ' + id + ' — podijelite taj kalendar sa nalogom koji pokreće skriptu');
  });
}

/** Проверка только Telegram — придёт короткое сообщение в чат. */
function testTelegram() {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    Logger.log('Telegram nije podešen: popunite TELEGRAM_BOT_TOKEN i TELEGRAM_CHAT_ID.');
    return;
  }
  sendTelegram('✅ Telegram je povezan. Ovdje će stizati nova zakazivanja.');
  Logger.log('Poruka poslata.');
}

/** Показывает chat_id: напишите боту любое сообщение и запустите эту функцию. */
function showTelegramChatId() {
  if (!TELEGRAM_BOT_TOKEN) {
    Logger.log('Prvo popunite TELEGRAM_BOT_TOKEN.');
    return;
  }
  var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/getUpdates',
    { muteHttpExceptions: true });
  var updates = JSON.parse(res.getContentText()).result || [];

  if (!updates.length) {
    Logger.log('Nema poruka. Napišite bot-u bilo šta u Telegramu pa pokrenite ponovo.');
    return;
  }
  updates.forEach(function (u) {
    var chat = (u.message && u.message.chat) || (u.channel_post && u.channel_post.chat);
    if (chat) Logger.log('chat_id: ' + chat.id + '  (' + (chat.title || chat.first_name || '') + ')');
  });
}
