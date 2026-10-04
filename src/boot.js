// Sign-in screens, roles, team management, data import. Runs once main.js has loaded.
import { configured, list } from "./data.js";

export function boot(ctx) {
  const { S, me, render, toast, $, esc, db, startSync, setErrorHandler, authApi, shopInfo, watchMe, createShop, requestAccess, setRole } = ctx;
  const authEl = document.getElementById("auth");
  const show = html => { authEl.innerHTML = `<div class="auth-card">${html}</div>`; authEl.hidden = false; };
  const hide = () => { authEl.hidden = true; authEl.innerHTML = ""; };
  const ROLE = { owner: "مالک", manager: "مینیجر", staff: "ملازم", pending: "منظوری باقی", disabled: "بند" };
  const brand = `<div class="auth-brand">وارثی بک</div>`;

  if (!configured) {
    show(`${brand}<p>ایپ ابھی Firebase سے جڑی نہیں۔ <code>src/config.js</code> میں Firebase کی سیٹنگ ڈالیں۔</p>`);
    return;
  }

  setErrorHandler(e => {
    if (e && e.code === "permission-denied") toast("آپ کو یہ کام کرنے کی اجازت نہیں");
    else if (e && e.code === "resource-exhausted") toast("آج کی مفت حد پوری ہو گئی، کل دوبارہ کوشش کریں");
  });

  /* ----- login / sign-up ----- */
  let mode = "in";
  function loginScreen(msg) {
    show(`${brand}
      <div class="chips" style="justify-content:center"><button class="chip" data-am="in" aria-pressed="${mode === "in"}">لاگ اِن</button><button class="chip" data-am="up" aria-pressed="${mode === "up"}">نیا اکاؤنٹ</button></div>
      <form class="f" id="authForm">
        ${mode === "up" ? `<div class="fld"><label for="aName">آپ کا نام</label><input id="aName" name="name" required autocomplete="name"></div>` : ""}
        <div class="fld"><label for="aEmail">ای میل</label><input id="aEmail" name="email" type="email" required autocomplete="email" dir="ltr"></div>
        <div class="fld"><label for="aPass">پاس ورڈ ${mode === "up" ? "(کم از کم 6 حروف)" : ""}</label><input id="aPass" name="pass" type="password" required minlength="6" autocomplete="${mode === "up" ? "new-password" : "current-password"}" dir="ltr"></div>
        ${msg ? `<div class="note" style="color:var(--owe)">${esc(msg)}</div>` : ""}
        <button class="btn primary" style="justify-content:center">${mode === "up" ? "اکاؤنٹ بنائیں" : "لاگ اِن"}</button>
        ${mode === "in" ? `<button type="button" class="btn ghost sm" data-am="reset">پاس ورڈ بھول گئے؟</button>` : `<p class="note">نیا اکاؤنٹ بنانے کے بعد مالک کی منظوری سے رسائی ملے گی۔</p>`}
      </form>`);
  }
  const errText = e => ({
    "auth/invalid-credential": "ای میل یا پاس ورڈ غلط ہے", "auth/wrong-password": "پاس ورڈ غلط ہے", "auth/user-not-found": "اس ای میل کا اکاؤنٹ نہیں",
    "auth/email-already-in-use": "اس ای میل کا اکاؤنٹ پہلے سے ہے، لاگ اِن کریں", "auth/weak-password": "پاس ورڈ کم از کم 6 حروف کا ہو",
    "auth/invalid-email": "ای میل درست نہیں", "auth/network-request-failed": "انٹرنیٹ نہیں ملا", "auth/too-many-requests": "بہت زیادہ کوششیں، کچھ دیر بعد کریں"
  }[e && e.code] || "کچھ غلط ہو گیا، دوبارہ کوشش کریں");

  authEl.addEventListener("click", async ev => {
    const t = ev.target.closest("[data-am],[data-auth]"); if (!t) return;
    if (t.dataset.am === "in" || t.dataset.am === "up") { mode = t.dataset.am; loginScreen(); return; }
    if (t.dataset.am === "reset") {
      const em = ($("#aEmail") || {}).value; if (!em) { loginScreen("پہلے اپنی ای میل لکھیں"); return; }
      try { await authApi.reset(em); toast("پاس ورڈ بدلنے کا لنک ای میل پر بھیج دیا"); } catch (e) { loginScreen(errText(e)); }
    }
    if (t.dataset.auth === "out") authApi.signOut();
  });
  authEl.addEventListener("submit", async ev => {
    ev.preventDefault(); const f = ev.target; const d = Object.fromEntries(new FormData(f));
    const btn = f.querySelector("button.primary"); if (btn) btn.disabled = true;
    try {
      if (f.id === "authForm") {
        if (mode === "up") { me.pendingName = d.name.trim(); await authApi.signUp(d.name.trim(), d.email.trim(), d.pass); }
        else await authApi.signIn(d.email.trim(), d.pass);
      }
      if (f.id === "shopForm") { await createShop(curUser, d.shop.trim(), d.name.trim()); }
    } catch (e) {
      console.error(e);
      if (f.id === "shopForm") shopScreen("دکان شروع نہیں ہو سکی۔ صرف مالک کی ای میل سے دکان شروع ہو سکتی ہے۔");
      else loginScreen(errText(e));
    }
  });

  /* ----- after sign-in ----- */
  let curUser = null, unMe = null, started = false;
  function shopScreen(msg) {
    show(`${brand}<p>خوش آمدید! یہ دکان ابھی شروع نہیں ہوئی۔ اگر آپ مالک ہیں تو دکان کا نام لکھ کر شروع کریں۔</p>
      <form class="f" id="shopForm">
        <div class="fld"><label for="sShop">دکان کا نام</label><input id="sShop" name="shop" required value="وارثی ہارڈویئر"></div>
        <div class="fld"><label for="sName">آپ کا نام</label><input id="sName" name="name" required value="${esc(curUser.displayName || "")}"></div>
        ${msg ? `<div class="note" style="color:var(--owe)">${esc(msg)}</div>` : ""}
        <button class="btn primary" style="justify-content:center">دکان شروع کریں</button>
      </form><button class="btn ghost sm" data-auth="out">لاگ آؤٹ</button>`);
  }
  function waitScreen(role) {
    show(`${brand}<p><strong>${esc(me.name || curUser.email)}</strong></p>
      <p>${role === "disabled" ? "آپ کا اکاؤنٹ مالک نے بند کر دیا ہے۔" : "آپ کی درخواست مالک کو بھیج دی گئی ہے۔ منظوری ملتے ہی ایپ خود کھل جائے گی۔"}</p>
      <p class="note" dir="ltr">${esc(curUser.email)}</p><button class="btn" data-auth="out">لاگ آؤٹ</button>`);
  }

  let raf = 0;
  const onData = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (const c of ["branches", "items", "customers", "entries", "sales", "purchases", "expenses", "users"]) S[c] = list(c);
      for (const c of ["branches", "items", "customers"]) S.loaded[c] = true;
      render();
      if (S.openCust && !$("#sheet").hidden && !($("#entryForm") || {}).innerHTML) window.dispatchEvent(new CustomEvent("wb:refreshCust"));
    });
  };

  authApi.onUser(async u => {
    if (unMe) { unMe(); unMe = null; }
    curUser = u;
    if (!u) { started = false; mode = "in"; loginScreen(); return; }
    me.uid = u.uid; me.name = u.displayName || me.pendingName || u.email;
    show(`${brand}<p class="note">لوڈ ہو رہا ہے…</p>`);
    unMe = watchMe(u.uid, async prof => {
      if (!prof) {
        const shop = await shopInfo();
        if (!shop) { shopScreen(); return; }
        try { await requestAccess(u, me.name); } catch (e) { console.error(e); }
        waitScreen("pending"); return;
      }
      me.role = prof.role; me.name = prof.name || me.name; me.branch = prof.branch || "";
      if (prof.role === "pending" || prof.role === "disabled") { waitScreen(prof.role); return; }
      S.canWrite = true; S.isAdmin = prof.role === "owner" || prof.role === "manager"; S.isOwner = prof.role === "owner";
      const who = document.getElementById("who"); if (who) who.textContent = "· " + me.name + " (" + ROLE[prof.role] + ")";
      if (!started) {
        started = true;
        if (me.branch) { try { if (!localStorage.getItem("hk_branch")) S.branch = me.branch; } catch (e) { S.branch = me.branch; } }
        startSync(onData, { users: S.isAdmin });
      }
      hide(); render();
    });
  });

  /* ----- team, account and import, shown on the branches tab ----- */
  S.after = () => {
    const box = document.getElementById("teamBox"); if (!box) return;
    const users = (S.users || []).slice().sort((a, b) => (a.role === "pending" ? -1 : 0) - (b.role === "pending" ? -1 : 0) || (a.name || "").localeCompare(b.name || ""));
    const pend = users.filter(x => x.role === "pending").length;
    const roleSel = x => {
      if (x.id === me.uid || x.role === "owner") return `<span class="pill">${ROLE[x.role] || x.role}</span>`;
      if (!S.isOwner && x.role === "manager") return `<span class="pill">${ROLE.manager}</span>`;
      const opts = (S.isOwner ? ["pending", "staff", "manager", "disabled"] : ["pending", "staff", "disabled"]).map(r => `<option value="${r}" ${x.role === r ? "selected" : ""}>${ROLE[r]}</option>`).join("");
      return `<select data-role="${esc(x.id)}" aria-label="کردار" style="border:1px solid var(--line);background:var(--bg);border-radius:8px;padding:4px 6px">${opts}</select>`;
    };
    const brSel = x => `<select data-ubranch="${esc(x.id)}" aria-label="برانچ" style="border:1px solid var(--line);background:var(--bg);border-radius:8px;padding:4px 6px"><option value="">کوئی بھی</option>${S.branches.map(b => `<option value="${esc(b.id)}" ${x.branch === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select>`;
    box.innerHTML = `
    ${S.isAdmin ? `<section class="card"><div class="card-h"><h3>ملازمین</h3>${pend ? `<span class="pill warn">${pend} نئی درخواست</span>` : ""}</div>
      ${users.length ? `<div class="list">${users.map(x => `<div class="row" style="cursor:default;flex-wrap:wrap"><div class="av">${esc((x.name || "?")[0])}</div><div class="main"><div class="t">${esc(x.name || "")}${x.id === me.uid ? " (آپ)" : ""}</div><div class="s" dir="ltr" style="text-align:right">${esc(x.email || "")}</div></div>
        ${x.role === "pending" ? `<button class="btn pay sm" data-approve="${esc(x.id)}">منظور کریں</button>` : ""}${roleSel(x)}${x.role !== "owner" && S.branches.length > 1 ? brSel(x) : ""}</div>`).join("")}</div>` : `<div class="empty">ابھی کوئی ملازم نہیں۔</div>`}
      <p class="note pad" style="margin:0">ملازم کو ایپ یا ویب سائٹ کا لنک دیں۔ وہ "نیا اکاؤنٹ" سے رجسٹر کرے، پھر یہاں اسے منظور کریں۔ <b>ملازم</b> بل، کھاتے اور اسٹاک درج کر سکتا ہے۔ <b>مینیجر</b> برانچیں، ملازمین اور اندراج حذف بھی کر سکتا ہے۔</p></section>` : ""}
    <section class="card"><div class="card-h"><h3>میرا اکاؤنٹ</h3><span class="pill">${ROLE[me.role] || ""}</span></div>
      <div class="pad" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div class="main" style="flex:1;min-width:0"><strong>${esc(me.name)}</strong><div class="note" dir="ltr" style="text-align:right">${esc((curUser || {}).email || "")}</div></div><button class="btn" data-auth2="out">لاگ آؤٹ</button></div></section>
    ${S.isOwner ? `<section class="card pad" style="display:flex;flex-direction:column;gap:8px"><h3 style="margin:0;font-size:15px">پرانی وارثی بک سے ڈیٹا لائیں</h3>
      <p class="note" style="margin:0">پرانی وارثی بک (Claude والی) میں "برانچیں" کے صفحے سے "سارا ڈیٹا فائل میں" دبا کر فائل بنائیں، پھر یہاں چنیں۔ یہ کام صرف ایک بار کریں۔</p>
      <label class="btn sm" for="impFile" style="align-self:flex-start;cursor:pointer">فائل چنیں (.json)</label><input type="file" id="impFile" accept=".json,application/json" hidden><div id="impMsg"></div></section>` : ""}`;
  };

  document.addEventListener("click", async ev => {
    const t = ev.target.closest("[data-approve],[data-auth2],[data-impgo]"); if (!t) return;
    if (t.dataset.approve) { setRole(t.dataset.approve, "staff"); toast("منظور ہو گیا"); }
    if (t.dataset.auth2 === "out") authApi.signOut();
    if (t.dataset.impgo !== undefined && pendingImport) {
      t.disabled = true; const msg = $("#impMsg");
      try { await db.importAll(pendingImport, (n, tot) => { msg.textContent = `${n} / ${tot} محفوظ ہوئے…`; }); msg.innerHTML = `<span class="c-pay">ڈیٹا آ گیا۔</span>`; toast("پرانا ڈیٹا آ گیا"); }
      catch (e) { console.error(e); msg.innerHTML = `<span class="c-owe">ڈیٹا نہیں آ سکا۔ انٹرنیٹ چیک کر کے دوبارہ کریں۔</span>`; t.disabled = false; }
      pendingImport = null;
    }
  });
  document.addEventListener("change", ev => {
    const t = ev.target;
    if (t.dataset.role) setRole(t.dataset.role, t.value);
    if (t.dataset.ubranch !== undefined && t.dataset.ubranch) db.update("users", t.dataset.ubranch, { branch: t.value });
    if (t.id === "impFile" && t.files && t.files[0]) {
      const r = new FileReader();
      r.onload = () => {
        const msg = $("#impMsg");
        try {
          const j = JSON.parse(String(r.result));
          const cols = ["branches", "items", "customers", "entries", "sales", "purchases", "expenses"];
          const data = {}; let n = 0;
          for (const c of cols) { data[c] = Array.isArray(j[c]) ? j[c].filter(x => x && x.id) : []; n += data[c].length; }
          if (!n) throw new Error("empty");
          pendingImport = data;
          msg.innerHTML = `<p class="note" style="margin:0">${cols.map(c => `${data[c].length}`).join(" · ")} — برانچیں · اشیاء · کھاتے · اندراجات · بل · خریداری · خرچے</p><div class="confirm" style="margin-top:6px">کل ${n} ریکارڈ لانے ہیں؟ <button class="btn primary sm" data-impgo>ہاں، لائیں</button></div>`;
        } catch (e) { msg.innerHTML = `<span class="c-owe">یہ فائل درست نہیں۔ پرانی وارثی بک سے بنی .json فائل چنیں۔</span>`; }
      };
      r.readAsText(t.files[0]); t.value = "";
    }
  });
  let pendingImport = null;
}
