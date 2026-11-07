/**
 * Coolimate website forms -> Google Sheet (+ optional email)
 * Paste into: the Google Sheet > Extensions > Apps Script. Deploy as a Web app
 * (Execute as: Me, Who has access: Anyone) and paste the URL into the site's admin mode.
 *
 *  - Newsletter: each email goes to the "Newsletter" tab.
 *  - Join us application: each one goes to the "Applications" tab. When the admin turns on
 *    "email alerts", a formatted email is also sent to TEAM_EMAIL (Reply goes straight to the applicant).
 */
var TEAM_EMAIL = 'official.coolimate@gmail.com';
var MAX = 3000;

function doGet() {
  return out({ ok: true, service: 'coolimate-forms' });
}

function doPost(e) {
  var d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, error: 'bad json' }); }
  if (d.website) return out({ ok: true }); // spam trap field filled in: ignore quietly
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (d.type === 'subscribe') return out(subscribe(d));
    if (d.type === 'apply') return out(apply(d));
    return out({ ok: false, error: 'unknown type' });
  } finally {
    lock.releaseLock();
  }
}

function subscribe(d) {
  var email = clean(d.email).toLowerCase();
  if (!isEmail(email)) return { ok: false, error: 'email' };
  var sh = tab('Newsletter', ['Date', 'Email', 'Language', 'Page']);
  var last = sh.getLastRow();
  if (last > 1) {
    var have = sh.getRange(2, 2, last - 1, 1).getValues().map(function (r) { return String(r[0]).toLowerCase(); });
    if (have.indexOf(email) > -1) return { ok: true, dup: true };
  }
  sh.appendRow([new Date(), safe(email), safe(clean(d.lang)), safe(clean(d.page))]);
  return { ok: true };
}

var FIELDS = [
  ['name', '이름', 'Name'],
  ['location', '사는 곳', 'Location'],
  ['email', '이메일', 'Email'],
  ['org', '소속 (학교·기관)', 'School / organization'],
  ['as', '신청 유형', 'Applying as'],
  ['interests', '관심 분야', 'Interests'],
  ['reason', '신청하게 된 계기', 'What led you to apply'],
  ['motivation', '신청 동기', 'Motivation'],
  ['langs', '사용 언어', 'Languages'],
  ['heard', 'Coolimate를 알게 된 경로', 'How they heard about us'],
  ['time', '참여 가능한 시간', 'Availability']
];

function apply(d) {
  var v = {};
  FIELDS.forEach(function (f) { v[f[0]] = clean(d[f[0]]); });
  v.email = v.email.toLowerCase();
  if (!v.name || !v.location || !isEmail(v.email) || !v.interests || !v.reason || !v.motivation) return { ok: false, error: 'required' };
  var sh = tab('Applications', ['Date'].concat(FIELDS.map(function (f) { return f[2]; })).concat(['Site language', 'Consent']));
  sh.appendRow([new Date()].concat(FIELDS.map(function (f) { return safe(v[f[0]]); })).concat([safe(clean(d.lang)), d.consent ? 'yes' : 'no']));

  var mailed = false, replied = false;
  if (d.notify && MailApp.getRemainingDailyQuota() > 2) {
    MailApp.sendEmail({
      to: TEAM_EMAIL,
      replyTo: v.email,
      name: 'Coolimate Website',
      subject: '[Coolimate 참여 신청] ' + v.name + ' · ' + v.location,
      body: plainMail(v),
      htmlBody: htmlMail(v, sh.getParent().getUrl())
    });
    mailed = true;
    if (d.reply) {
      var r = REPLY[d.lang] || REPLY.en;
      MailApp.sendEmail({ to: v.email, replyTo: TEAM_EMAIL, name: 'Coolimate', subject: r.s, body: r.b.replace('{name}', v.name) });
      replied = true;
    }
  }
  return { ok: true, mailed: mailed, replied: replied };
}

function plainMail(v) {
  var t = '새 참여 신청이 들어왔어요. (New application from the website)\n\n';
  FIELDS.forEach(function (f) { if (v[f[0]]) t += '■ ' + f[1] + ' / ' + f[2] + '\n' + v[f[0]] + '\n\n'; });
  return t + '이 메일에 답장하면 신청자에게 바로 전달돼요.';
}

function htmlMail(v, sheetUrl) {
  var rows = FIELDS.filter(function (f) { return v[f[0]]; }).map(function (f) {
    return '<tr><td style="padding:10px 14px;border-bottom:1px solid #e6ebf1;vertical-align:top;width:170px;color:#5b6573;font-size:13px">' +
      esc(f[1]) + '<br><span style="font-size:11px;color:#8a94a3">' + esc(f[2]) + '</span></td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e6ebf1;font-size:14px;color:#0b1b2b;white-space:pre-wrap">' + esc(v[f[0]]) + '</td></tr>';
  }).join('');
  return '<div style="font-family:Arial,sans-serif;max-width:640px">' +
    '<div style="background:#0b2a4a;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0"><b style="font-size:17px">새 참여 신청이 들어왔어요</b><br><span style="font-size:12px;opacity:.75">New application · coolimate.org Join us</span></div>' +
    '<table style="border-collapse:collapse;width:100%;border:1px solid #e6ebf1;border-top:0">' + rows + '</table>' +
    '<p style="font-size:12px;color:#5b6573;margin-top:14px">이 메일에 <b>답장</b>하면 신청자(' + esc(v.email) + ')에게 바로 전달돼요. 모든 신청은 <a href="' + sheetUrl + '">구글 시트</a>에도 저장돼요.</p></div>';
}

var REPLY = {
  en: { s: 'We received your application · Coolimate', b: 'Hi {name},\n\nThank you for applying to join Coolimate! We have received your application and our team will read it carefully. We will get back to you by email soon.\n\nCoolimate\nhttps://coolimate.org' },
  ko: { s: '참여 신청을 잘 받았어요 · Coolimate', b: '{name} 님, 안녕하세요.\n\nCoolimate에 참여 신청을 해 주셔서 감사합니다. 보내 주신 내용을 팀이 꼼꼼히 읽어 보고, 곧 이메일로 연락드릴게요.\n\nCoolimate 드림\nhttps://coolimate.org' },
  es: { s: 'Hemos recibido tu solicitud · Coolimate', b: 'Hola, {name}:\n\n¡Gracias por querer unirte a Coolimate! Hemos recibido tu solicitud y nuestro equipo la leerá con atención. Te responderemos pronto por correo.\n\nCoolimate\nhttps://coolimate.org' },
  fr: { s: 'Nous avons bien reçu votre candidature · Coolimate', b: 'Bonjour {name},\n\nMerci de vouloir rejoindre Coolimate ! Nous avons bien reçu votre candidature et notre équipe va la lire attentivement. Nous vous répondrons bientôt par e-mail.\n\nCoolimate\nhttps://coolimate.org' },
  ar: { s: 'استلمنا طلبك · Coolimate', b: 'مرحبًا {name}،\n\nشكرًا لرغبتك في الانضمام إلى Coolimate! لقد استلمنا طلبك وسيقرؤه فريقنا بعناية. سنرد عليك قريبًا عبر البريد الإلكتروني.\n\nCoolimate\nhttps://coolimate.org' }
};

function tab(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#eef3f8');
  }
  return sh;
}
function clean(x) {
  if (Array.isArray(x)) x = x.join(', ');
  return String(x == null ? '' : x).replace(/\r/g, '').trim().slice(0, MAX);
}
function safe(x) { return /^[=+\-@]/.test(x) ? "'" + x : x; } // stop text being read as a formula
function isEmail(x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) && x.length < 200; }
function esc(x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

/** Run once from the editor (▶ Run) to grant permissions and create both tabs. */
function setup() {
  tab('Newsletter', ['Date', 'Email', 'Language', 'Page']);
  tab('Applications', ['Date'].concat(FIELDS.map(function (f) { return f[2]; })).concat(['Site language', 'Consent']));
  MailApp.getRemainingDailyQuota();
}
