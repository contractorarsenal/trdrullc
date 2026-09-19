/*
 * UI: shared DOM helpers and the onboarding flow (profile -> follow-ups -> calibration -> session plan).
 * No simulation logic lives here.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {}, D = TYS.Difficulty, Session = TYS.Session;
  var UI = TYS.UI = {};

  UI.$ = function (id) { return document.getElementById(id); };
  UI.el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  UI.setText = function (n, s) { if (n._t !== s) { n._t = s; n.textContent = s; } };
  UI.setCls = function (n, name, on) { if (n._c === undefined) n._c = {}; if (n._c[name] !== on) { n._c[name] = on; n.classList.toggle(name, on); } };
  UI.announce = function (msg) { var n = UI.$('sr-live'); n.textContent = ''; setTimeout(function () { n.textContent = msg; }, 30); };
  UI.focus = function (n) { try { n.focus({ preventScroll: true }); } catch (e) { /* ignore */ } };
  UI.reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  UI.VIEWS = ['view-intro', 'view-onboard', 'view-terminal', 'view-results', 'view-replay'];
  UI.showView = function (name) { UI.VIEWS.forEach(function (v) { UI.$(v).hidden = v !== 'view-' + name; }); root.scrollTo(0, 0); };

  /* ------------------------------------------------------------ onboarding */
  var LEVEL_ORDER = ['beginner', 'student', 'experienced', 'advanced'];
  UI.onboarding = function (done) {
    var host = UI.$('ob-root'), ob = { step: 'level', profile: { level: null, experience: null, struggles: [], test: null }, calibrated: null };

    function head(step, title, sub) {
      var f = document.createDocumentFragment();
      f.appendChild(UI.el('p', 'ob-step', step)); var h = UI.el('h2', 'ob-h', title); h.tabIndex = -1; f.appendChild(h);
      if (sub) f.appendChild(UI.el('p', 'ob-sub', sub)); return { frag: f, h: h };
    }
    function mount(nodes, h) { host.textContent = ''; host.appendChild(nodes); UI.showView('onboard'); UI.focus(h); }

    function stepLevel() {
      var hd = head('Step 1 of 3', 'How would you describe yourself?', 'This sets how fast the markets move and how much you see. You can change it before you start.');
      var ul = UI.el('ul', 'opt-list'); ul.setAttribute('role', 'radiogroup'); ul.setAttribute('aria-label', 'Trader level');
      LEVEL_ORDER.forEach(function (l) {
        var m = D.mod(l), li = UI.el('li'), b = UI.el('button', 'opt'); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(ob.profile.level === l));
        b.appendChild(UI.el('b', '', m.label)); b.appendChild(UI.el('span', '', '“' + m.tagline + '”'));
        b.addEventListener('click', function () { ob.profile.level = l; ob.step = 'follow'; render(); }); li.appendChild(b); ul.appendChild(li);
      });
      hd.frag.appendChild(ul); mount(hd.frag, hd.h);
    }

    function stepFollow() {
      var hd = head('Step 2 of 3', 'A few quick questions', 'Three short ones. They only decide which scenarios you see first.');
      var f = hd.frag;
      // experience
      f.appendChild(UI.el('p', 'q-h', 'How long have you been trading?')); var c1 = UI.el('div', 'chips');
      Session.EXPERIENCE.forEach(function (e) { var b = UI.el('button', 'chip', e.label); b.type = 'button'; b.setAttribute('aria-pressed', String(ob.profile.experience === e.id));
        b.addEventListener('click', function () { ob.profile.experience = e.id; refresh(); }); c1.appendChild(b); }); f.appendChild(c1);
      // struggles (up to 2)
      f.appendChild(UI.el('p', 'q-h', 'What do you struggle with most? Pick up to two.')); var c2 = UI.el('div', 'chips');
      Session.STRUGGLES.forEach(function (s) { var on = ob.profile.struggles.indexOf(s.id) !== -1, b = UI.el('button', 'chip', s.label); b.type = 'button'; b.setAttribute('aria-pressed', String(on));
        if (!on && ob.profile.struggles.length >= 2) b.disabled = true;
        b.addEventListener('click', function () { var i = ob.profile.struggles.indexOf(s.id); if (i !== -1) ob.profile.struggles.splice(i, 1); else if (ob.profile.struggles.length < 2) ob.profile.struggles.push(s.id); refresh(); }); c2.appendChild(b); }); f.appendChild(c2);
      // what to test
      f.appendChild(UI.el('p', 'q-h', 'What would you rather test?')); var c3 = UI.el('div', 'chips');
      Session.TESTS.forEach(function (t) { var b = UI.el('button', 'chip', t.label); b.type = 'button'; b.setAttribute('aria-pressed', String(ob.profile.test === t.id));
        b.addEventListener('click', function () { ob.profile.test = t.id; refresh(); }); c3.appendChild(b); }); f.appendChild(c3);
      var acts = UI.el('div', 'ob-actions'), next = UI.el('button', 'btn btn-primary', 'Continue'), back = UI.el('button', 'btn btn-outline', 'Back'), skip = UI.el('button', 'chip', 'Skip questions');
      next.type = back.type = skip.type = 'button';
      next.addEventListener('click', function () { ob.step = 'calibrate'; render(); }); back.addEventListener('click', function () { ob.step = 'level'; render(); });
      skip.addEventListener('click', function () { ob.profile.experience = ob.profile.experience; ob.step = 'calibrate'; render(); });
      acts.appendChild(next); acts.appendChild(back); acts.appendChild(skip); f.appendChild(acts);
      function refresh() { var y = root.scrollY; render(); root.scrollTo(0, y); }
      mount(f, hd.h);
    }

    function stepCalibrate() {
      var cal = D.calibrate(ob.profile.level, ob.profile.experience); ob.calibrated = ob.calibrated || cal.chosen;
      var hd = head('Step 3 of 3', 'Your difficulty', 'This is how the simulator will treat you. Nothing is scored.'); var f = hd.frag;
      if (cal.differs) {
        var nb = UI.el('div', 'note-box'); nb.appendChild(UI.el('b', '', 'A suggestion. ')); nb.appendChild(document.createTextNode(cal.note)); f.appendChild(nb);
        var ul = UI.el('ul', 'opt-list');
        [cal.recommended, cal.chosen].forEach(function (l, i) { var li = UI.el('li'), b = UI.el('button', 'opt'); b.type = 'button'; b.setAttribute('aria-pressed', String(ob.calibrated === l));
          b.appendChild(UI.el('b', '', D.mod(l).label + (i === 0 ? '  (suggested)' : '  (your choice)'))); b.appendChild(UI.el('span', '', D.mod(l).blurb));
          b.addEventListener('click', function () { ob.calibrated = l; render(); }); li.appendChild(b); ul.appendChild(li); }); f.appendChild(ul);
      } else { ob.calibrated = cal.chosen; var box = UI.el('div', 'note-box'); box.appendChild(UI.el('b', '', D.mod(cal.chosen).label + '. ')); box.appendChild(document.createTextNode(D.mod(cal.chosen).blurb)); f.appendChild(box); }
      f.appendChild(UI.el('p', 'q-h', 'What will be different'));
      var dl = UI.el('ul', 'diff-list'); Session.explain({ level: ob.calibrated || cal.chosen }).forEach(function (t) { dl.appendChild(UI.el('li', '', t)); }); f.appendChild(dl);
      var acts = UI.el('div', 'ob-actions'), next = UI.el('button', 'btn btn-primary', 'See my session'), back = UI.el('button', 'btn btn-outline', 'Back'); next.type = back.type = 'button';
      next.addEventListener('click', function () { ob.profile.level = ob.calibrated || cal.chosen; ob.step = 'plan'; render(); }); back.addEventListener('click', function () { ob.step = 'follow'; render(); }); acts.appendChild(next); acts.appendChild(back); f.appendChild(acts);
      mount(f, hd.h);
    }

    function stepPlan() {
      var profile = Session.cleanProfile(ob.profile), plan = Session.buildPlan(profile);
      var hd = head('Your session', plan.length + ' scenarios', D.mod(profile.level).label + '. In this order.'); var f = hd.frag;
      var ol = UI.el('ol', 'plan'); plan.forEach(function (p) { var s = TYS.Scenarios.get(p.id), li = UI.el('li'); li.appendChild(UI.el('b', '', s.title)); li.appendChild(UI.el('small', '', s.category)); ol.appendChild(li); }); f.appendChild(ol);
      var acts = UI.el('div', 'ob-actions'), go = UI.el('button', 'btn btn-primary', 'Start session'), back = UI.el('button', 'btn btn-outline', 'Back'); go.type = back.type = 'button';
      go.addEventListener('click', function () { done(profile); }); back.addEventListener('click', function () { ob.step = 'calibrate'; render(); }); acts.appendChild(go); acts.appendChild(back); f.appendChild(acts);
      f.appendChild(UI.el('p', 'fine', 'Educational simulation only. No real assets or funds are used.'));
      mount(f, hd.h);
    }

    function render() { ({ level: stepLevel, follow: stepFollow, calibrate: stepCalibrate, plan: stepPlan })[ob.step](); }
    render();
  };
})(typeof window !== 'undefined' ? window : globalThis);
