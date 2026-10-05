import "./style.css";
import { configured, db, list, newId, startSync, stopSync, setErrorHandler, authApi, shopInfo, watchMe, createShop, requestAccess, setRole } from "./data.js";
import { isNative, saveFile, pickPhoneContact, openWhatsApp } from "./native.js";

const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=n=>{n=Math.round(Number(n)||0);return (n<0?"-":"")+"Rs "+Math.abs(n).toLocaleString("en-PK")};
const fq=n=>{n=Number(n)||0;return Number.isInteger(n)?n.toLocaleString("en-PK"):n.toFixed(2)};
const dayStart=(d=new Date())=>{const x=new Date(d);x.setHours(0,0,0,0);return x.getTime()};
const monthStart=()=>{const x=new Date();x.setDate(1);x.setHours(0,0,0,0);return x.getTime()};
const dstr=t=>{const d=new Date(t);return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+" "+d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})};
const initial=s=>(String(s||"?").trim()[0]||"?");
const nowId=()=>Date.now().toString(36).slice(-6).toUpperCase();

const ICON={
 home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg>',
 khata:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/></svg>',
 sale:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
 stock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 8l9-5 9 5-9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/></svg>',
 report:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
 cash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v.01M18 15v.01"/></svg>',
 branch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21V9l8-5 8 5v12M9 21v-6h6v6"/></svg>'
};
const TABS=[["home","خلاصہ"],["khata","کھاتے"],["sale","بل"],["cash","روزنامچہ"],["report","رپورٹس"],["stock","اسٹاک"],["branch","برانچیں"]];

const S={branches:[],items:[],customers:[],entries:[],sales:[],purchases:[],expenses:[],contacts:null,billMode:"sale",pcart:[],pSupp:"",pPaid:"",saleMode:"cash",pMode:"cash",saleLedger:true,pLedger:true,shopName:"",updCost:true,cashDate:"",rp:"month",rFrom:"",rTo:"",loaded:{},tab:"home",branch:"all",q:"",stockQ:"",kind:"customer",
  canWrite:true,isAdmin:false,uid:null,noDb:false,cart:[],saleCust:"",salePaid:""};
try{S.branch=localStorage.getItem("hk_branch")||"all";S.tab=localStorage.getItem("hk_tab")||"home"}catch(e){}
const me={uid:null,name:"",role:null};

/* ---------- derived ---------- */
const branchName=id=>(S.branches.find(b=>b.id===id)||{}).name||"—";
const inBranch=x=>S.branch==="all"||x.branch===S.branch;
function balances(){const m={};for(const e of S.entries){m[e.cust]=(m[e.cust]||0)+(e.type==="gave"?1:-1)*(Number(e.amount)||0)}return m}
const todayStr=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const sumA=a=>a.reduce((x,y)=>x+(Number(y.amt)||0),0);
function cashFlow(from,to){
  const inR=[],out=[],ck=id=>S.customers.find(c=>c.id===id)||{};
  for(const s of S.sales)if(inBranch(s)&&s.date>=from&&s.date<to&&s.paid>0)inR.push({date:s.date,amt:s.paid,label:"بل #"+s.no+" · "+(s.custName||"نقد گاہک")});
  for(const e of S.entries){if(!inBranch(e)||e.date<from||e.date>=to||e.sale||e.purchase)continue;const c=ck(e.cust),sup=c.kind==="supplier";
    if(!sup&&e.type==="got")inR.push({date:e.date,amt:e.amount,label:"وصولی · "+(c.name||"")+(e.note?" · "+e.note:"")});
    if(sup&&e.type==="gave")out.push({date:e.date,amt:e.amount,label:"ادائیگی · "+(c.name||"")+(e.note?" · "+e.note:"")});}
  for(const p of S.purchases)if(inBranch(p)&&p.date>=from&&p.date<to&&p.paid>0)out.push({date:p.date,amt:p.paid,label:"خریداری #"+p.no+" · "+(p.suppName||"")});
  for(const x of S.expenses)if(inBranch(x)&&x.date>=from&&x.date<to){if(x.dir==="in")inR.push({date:x.date,amt:x.amount,label:"آمد · "+(x.note||""),exp:x.id});else out.push({date:x.date,amt:x.amount,label:"خرچہ · "+(x.note||""),exp:x.id})}
  return {inR,out};
}
const stockOf=(it,b)=>{const s=it.stock||{};if(b==="all")return Object.values(s).reduce((a,v)=>a+(Number(v)||0),0);return Number(s[b])||0};

/* ---------- render shell ---------- */
function renderTabs(){
  $("#tabs").innerHTML=TABS.map(([k,l])=>`<button data-tab="${k}" ${S.tab===k?'aria-current="page"':""}>${ICON[k]}<span>${l}</span></button>`).join("");
}
function renderBranchSel(){
  const sel=$("#branchSel");
  const opts=`<option value="all">تمام برانچیں</option>`+S.branches.map(b=>`<option value="${esc(b.id)}">${esc(b.name)}</option>`).join("");
  if(sel.innerHTML!==opts)sel.innerHTML=opts;
  if(S.branch!=="all"&&!S.branches.some(b=>b.id===S.branch)&&S.loaded.branches)S.branch="all";
  sel.value=S.branch;
}
function render(){
  const ae=document.activeElement,keep=ae&&ae.id&&$("#main").contains(ae)?{id:ae.id,a:ae.selectionStart,b:ae.selectionEnd}:null;
  renderTabs();renderBranchSel();
  const m=$("#main");
  m.innerHTML=({home:vHome,khata:vKhata,sale:vBill,cash:vCash,report:vReport,stock:vStock,branch:vBranch}[S.tab]||vHome)();
  fillNames();
  if(S.tab==="sale"){if(S.billMode==="purchase")updPTotal();else updTotal()}
  if(S.after)S.after();
  if(keep){const el=document.getElementById(keep.id);if(el){el.focus();try{if(keep.a!=null)el.setSelectionRange(keep.a,keep.b)}catch(e){}}}
}
function readOnlyBanner(){return S.canWrite?"":`<div class="banner">آپ کے پاس صرف دیکھنے کی اجازت ہے۔</div>`}

/* ---------- views ---------- */
function vHome(){
  const bal=balances(),custs=S.customers.filter(inBranch);
  let recv=0,payb=0;for(const c of custs){const v=bal[c.id]||0;if(v>0)recv+=v;else payb-=v}
  const t0=dayStart(),m0=monthStart();
  const sales=S.sales.filter(inBranch);
  const today=sales.filter(s=>s.date>=t0),month=sales.filter(s=>s.date>=m0);
  const sum=(a,f)=>a.reduce((x,y)=>x+(Number(f(y))||0),0);
  const cashToday=sumA(cashFlow(t0,t0+864e5).inR);
  const profit=sum(month,s=>sum(s.lines||[],l=>(l.price-(l.cost||0))*l.qty));
  const low=S.items.filter(it=>{const q=stockOf(it,S.branch);return (Number(it.min)||0)>0&&q<=Number(it.min)}).slice(0,8);
  const recent=[...S.entries].filter(inBranch).sort((a,b)=>b.date-a.date).slice(0,8);
  const cname=id=>(S.customers.find(c=>c.id===id)||{}).name||"—";
  return `${readOnlyBanner()}
  <div class="sec-head"><h2 class="h">آج کا خلاصہ</h2><div class="spacer"></div><span class="pill">${S.branch==="all"?"تمام برانچیں":esc(branchName(S.branch))}</span></div>
  <div class="stats">
    <div class="card stat owe"><span class="lbl">کل لینے ہیں (گاہکوں سے)</span><span class="val">${fmt(recv)}</span></div>
    <div class="card stat pay"><span class="lbl">کل دینے ہیں</span><span class="val">${fmt(payb)}</span></div>
    <div class="card stat"><span class="lbl">آج کی فروخت · ${today.length} بل</span><span class="val">${fmt(sum(today,s=>s.total))}</span></div>
    <div class="card stat"><span class="lbl">آج نقد وصولی</span><span class="val">${fmt(cashToday)}</span></div>
  </div>
  <div class="stats">
    <div class="card stat"><span class="lbl">اس ماہ فروخت</span><span class="val">${fmt(sum(month,s=>s.total))}</span></div>
    <div class="card stat"><span class="lbl">اس ماہ اندازاً منافع</span><span class="val">${fmt(profit)}</span></div>
    <div class="card stat"><span class="lbl">گاہک / سپلائر</span><span class="val">${custs.length}</span></div>
    <div class="card stat"><span class="lbl">اشیاء اسٹاک میں</span><span class="val">${S.items.length}</span></div>
  </div>
  ${S.canWrite?`<div class="chips"><button class="btn primary" data-go="sale">+ نیا بل</button><button class="btn" data-act="newCust">+ نیا گاہک</button><button class="btn" data-act="newItem">+ نئی چیز</button></div>`:""}
  <div class="grid2">
    <section class="card"><div class="card-h"><h3>کم اسٹاک</h3><span class="pill warn">${low.length}</span></div>
      ${low.length?`<div class="list">${low.map(it=>`<button class="row" data-item="${esc(it.id)}"><div class="main"><div class="t">${esc(it.name)}</div><div class="s">کم از کم ${fq(it.min)} ${esc(it.unit||"")}</div></div><span class="pill warn num">${fq(stockOf(it,S.branch))} ${esc(it.unit||"")}</span></button>`).join("")}</div>`
      :`<div class="empty">جن چیزوں کا اسٹاک "کم از کم" حد سے نیچے جائے گا، وہ یہاں نظر آئیں گی۔</div>`}
    </section>
    <section class="card"><div class="card-h"><h3>تازہ اندراجات</h3></div>
      ${recent.length?`<div class="list">${recent.map(e=>`<button class="row" data-cust="${esc(e.cust)}"><div class="main"><div class="t">${esc(cname(e.cust))}</div><div class="s"><span class="num">${dstr(e.date)}</span> · ${esc(e.note||(e.type==="gave"?"ادھار دیا":"رقم ملی"))}</div></div><div class="amt"><div class="v ${e.type==="gave"?"c-owe":"c-pay"}">${fmt(e.amount)}</div><div class="k c-muted">${e.type==="gave"?"دیے":"ملے"}</div></div></button>`).join("")}</div>`
      :`<div class="empty">ابھی کوئی لین دین درج نہیں ہوا۔ "کھاتے" میں گاہک بنا کر پہلا اندراج کریں۔</div>`}
    </section>
  </div>`;
}

function vKhata(){
  const bal=balances(),q=S.q.trim().toLowerCase();
  let list=S.customers.filter(c=>inBranch(c)&&(c.kind||"customer")===S.kind);
  if(q)list=list.filter(c=>(c.name||"").toLowerCase().includes(q)||(c.phone||"").includes(q));
  list.sort((a,b)=>Math.abs(bal[b.id]||0)-Math.abs(bal[a.id]||0));
  let recv=0,payb=0;for(const c of list){const v=bal[c.id]||0;if(v>0)recv+=v;else payb-=v}
  return `${readOnlyBanner()}
  <div class="sec-head"><h2 class="h">کھاتے</h2><div class="spacer"></div>${S.canWrite?`<button class="btn primary" data-act="newCust">+ ${S.kind==="supplier"?"نیا سپلائر":"نیا گاہک"}</button>`:""}</div>
  <div class="chips"><button class="chip" data-kind="customer" aria-pressed="${S.kind==="customer"}">گاہک</button><button class="chip" data-kind="supplier" aria-pressed="${S.kind==="supplier"}">سپلائر</button></div>
  <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
    <div class="card stat owe"><span class="lbl">آپ کو لینے ہیں</span><span class="val">${fmt(recv)}</span></div>
    <div class="card stat pay"><span class="lbl">آپ نے دینے ہیں</span><span class="val">${fmt(payb)}</span></div>
  </div>
  <input class="search" id="q" type="search" placeholder="نام یا فون نمبر سے تلاش" value="${esc(S.q)}">
  <section class="card">
  ${list.length?`<div class="list">${list.map(c=>{const v=bal[c.id]||0;return `<button class="row" data-cust="${esc(c.id)}"><div class="av">${esc(initial(c.name))}</div><div class="main"><div class="t">${esc(c.name)}</div><div class="s"><span class="num">${esc(c.phone||"")}</span>${S.branch==="all"&&S.branches.length>1?` · ${esc(branchName(c.branch))}`:""}</div></div><div class="amt"><div class="v ${v>0?"c-owe":v<0?"c-pay":"c-muted"}">${fmt(Math.abs(v))}</div><div class="k ${v>0?"c-owe":v<0?"c-pay":"c-muted"}">${v>0?"لینے ہیں":v<0?"دینے ہیں":"حساب برابر"}</div></div></button>`}).join("")}</div>`
  :`<div class="empty"><strong>${q?"کوئی نتیجہ نہیں ملا":S.kind==="supplier"?"ابھی کوئی سپلائر نہیں":"ابھی کوئی گاہک نہیں"}</strong><span>${q?"تلاش کے الفاظ بدل کر دیکھیں۔":"گاہک کا نام اور فون نمبر ڈالیں، پھر ادھار اور وصولی کا حساب یہیں رکھیں۔"}</span>${!q&&S.canWrite?`<button class="btn primary" data-act="newCust">+ پہلا ${S.kind==="supplier"?"سپلائر":"گاہک"} بنائیں</button>`:""}</div>`}
  </section>`;
}

/* who pays how: cash / credit / part, optional ledger entry, quick-add party */
function payBlock(k,total){
  const sale=k==="sale",mode=sale?S.saleMode:S.pMode,party=sale?S.saleCust:S.pSupp,paid=sale?S.salePaid:S.pPaid,led=sale?S.saleLedger:S.pLedger;
  const list=S.customers.filter(c=>sale?(c.kind||"customer")==="customer":c.kind==="supplier");
  const who=sale?"گاہک":"سپلائر",pid=sale?"saleCust":"pSupp";
  const M=sale?[["cash","پورا نقد"],["credit","پورا ادھار"],["part","کچھ نقد، باقی ادھار"]]:[["cash","پوری ادائیگی نقد"],["credit","پورا ادھار"],["part","کچھ نقد، باقی ادھار"]];
  return `<div class="fld"><label for="${pid}">${who}</label><div style="display:flex;gap:6px"><select id="${pid}" style="flex:1;min-width:0"><option value="">${sale?"کاؤنٹر گاہک (نام کے بغیر)":"نام کے بغیر"}</option>${list.map(c=>`<option value="${esc(c.id)}" ${party===c.id?"selected":""}>${esc(c.name)}${c.phone?" · \u2066"+esc(c.phone)+"\u2069":""}</option>`).join("")}</select><button type="button" class="btn sm" data-quick="${sale?"customer":"supplier"}">+ نیا ${who}</button></div></div>
    <div class="fld"><span class="lbl-sm">ادائیگی</span><div class="seg" role="group" aria-label="ادائیگی">${M.map(([v,l])=>`<button type="button" data-pm="${k}:${v}" aria-pressed="${mode===v}">${l}</button>`).join("")}</div></div>
    ${mode==="part"?`<div class="fld"><label for="${sale?"salePaid":"pPaid"}">${sale?"نقد وصول":"نقد ادا کیا"}</label><input id="${sale?"salePaid":"pPaid"}" class="num" inputmode="decimal" placeholder="0" value="${esc(paid)}"></div>`:""}
    ${party&&mode==="cash"?`<label class="note" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="${sale?"saleLedger":"pLedger"}" ${led?"checked":""}> ${who} کے کھاتے میں بھی درج کریں (نقد بھی ریکارڈ میں رہے گا)</label>`:""}`;
}
function payCalc(k,total){
  const sale=k==="sale",mode=sale?S.saleMode:S.pMode;
  const paid=mode==="cash"?total:mode==="credit"?0:Math.min(num(sale?S.salePaid:S.pPaid),total);
  return {mode,paid,due:Math.max(0,total-paid)};
}
function vSale(){
  if(!S.canWrite)return readOnlyBanner()+vSalesList();
  const branches=S.branches;
  const bid=S.branch!=="all"?S.branch:(branches[0]||{}).id;
  if(!bid)return `<h2 class="h">نیا بل</h2><div class="card empty"><strong>پہلے ایک برانچ بنائیں</strong><span>بل اور اسٹاک برانچ کے حساب سے رکھے جاتے ہیں۔</span><button class="btn primary" data-go="branch">برانچیں کھولیں</button></div>`;
  const total=S.cart.reduce((a,l)=>a+l.qty*l.price,0);
  const custs=S.customers.filter(c=>(c.kind||"customer")==="customer");
  return `<div class="sec-head"><h2 class="h">نیا بل</h2><div class="spacer"></div><span class="pill">${esc(branchName(bid))}${S.branch==="all"?" (پہلی برانچ)":""}</span></div>
  <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
    <div class="fld"><label for="itemPick">چیز شامل کریں</label>
      <input id="itemPick" list="itemList" placeholder="نام لکھیں یا چنیں" autocomplete="off">
      <datalist id="itemList">${S.items.map(it=>`<option value="${esc(it.name)}">${fq(stockOf(it,bid))} ${esc(it.unit||"")} · Rs ${fq(it.sale)}</option>`).join("")}</datalist>
    </div>
    ${S.cart.length?`<div>${S.cart.map((l,i)=>`<div class="cart-line"><div style="min-width:0"><div class="t" style="font-weight:600">${esc(l.name)}</div><div class="note">موجود: <span class="num">${fq(stockOf(S.items.find(x=>x.id===l.item)||{},bid))}</span> ${esc(l.unit||"")}</div></div><input id="q${i}" data-cq="${i}" inputmode="decimal" value="${l.qty}" aria-label="تعداد"><input id="p${i}" data-cp="${i}" inputmode="decimal" value="${l.price}" aria-label="ریٹ"><button class="x" data-rm="${i}" aria-label="ہٹائیں">×</button></div>`).join("")}
      <div class="total-bar"><span>کل رقم</span><span class="num" id="cartTotal">${fmt(total)}</span></div></div>`
    :`<div class="note">اوپر سے چیز چنیں۔ تعداد اور ریٹ بدل سکتے ہیں۔</div>`}
    ${payBlock("sale",total)}
    <div class="note" id="saleHint"></div>
    <div class="actions"><button class="btn" data-act="clearCart" ${S.cart.length?"":"disabled"}>صاف کریں</button><button class="btn primary" data-act="saveSale" ${S.cart.length?"":"disabled"}>بل محفوظ کریں</button></div>
  </section>
  ${vSalesList()}`;
}
function vBill(){
  const chips=`<div class="chips"><button class="chip" data-bill="sale" aria-pressed="${S.billMode==="sale"}">فروخت کا بل</button><button class="chip" data-bill="purchase" aria-pressed="${S.billMode==="purchase"}">خریداری (سپلائر سے مال)</button></div>`;
  return chips+(S.billMode==="purchase"?vPurchase():vSale());
}
function vPurchase(){
  if(!S.canWrite)return readOnlyBanner()+vPurchList();
  const bid=S.branch!=="all"?S.branch:(S.branches[0]||{}).id;
  if(!bid)return `<div class="card empty"><strong>پہلے ایک برانچ بنائیں</strong><button class="btn primary" data-go="branch">برانچیں کھولیں</button></div>`;
  const total=S.pcart.reduce((a,l)=>a+l.qty*l.price,0);
  const supps=S.customers.filter(c=>c.kind==="supplier");
  return `<div class="sec-head"><h2 class="h">خریداری کا بل</h2><div class="spacer"></div><span class="pill">${esc(branchName(bid))}${S.branch==="all"?" (پہلی برانچ)":""}</span></div>
  <section class="card pad" style="display:flex;flex-direction:column;gap:12px">
    <div class="fld"><label for="pItemPick">آنے والی چیز</label>
      <input id="pItemPick" list="pItemList" placeholder="نام لکھیں یا چنیں" autocomplete="off">
      <datalist id="pItemList">${S.items.map(it=>`<option value="${esc(it.name)}">${fq(stockOf(it,bid))} ${esc(it.unit||"")} · خرید Rs ${fq(it.cost)}</option>`).join("")}</datalist>
      <span class="note">نئی چیز ہو تو پہلے "اسٹاک" میں شامل کریں۔</span>
    </div>
    ${S.pcart.length?`<div>${S.pcart.map((l,i)=>`<div class="cart-line"><div style="min-width:0"><div style="font-weight:600">${esc(l.name)}</div><div class="note">ابھی: <span class="num">${fq(stockOf(S.items.find(x=>x.id===l.item)||{},bid))}</span> ${esc(l.unit||"")}</div></div><input id="pq${i}" data-pq="${i}" inputmode="decimal" value="${l.qty}" aria-label="تعداد"><input id="pp${i}" data-pp="${i}" inputmode="decimal" value="${l.price}" aria-label="خرید ریٹ"><button class="x" data-prm="${i}" aria-label="ہٹائیں">×</button></div>`).join("")}
      <div class="total-bar"><span>کل رقم</span><span class="num" id="pTotal">${fmt(total)}</span></div></div>`
    :`<div class="note">چیز چنیں، پھر تعداد اور خرید ریٹ لکھیں۔ محفوظ کرنے پر اسٹاک بڑھ جائے گا۔</div>`}
    ${payBlock("purchase",total)}
    <label class="note" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="updCost" ${S.updCost?"checked":""}> اسٹاک میں خرید ریٹ بھی نئے ریٹ سے بدل دیں</label>
    <div class="note" id="pHint"></div>
    <div class="actions"><button class="btn" data-act="clearP" ${S.pcart.length?"":"disabled"}>صاف کریں</button><button class="btn primary" data-act="savePurchase" ${S.pcart.length?"":"disabled"}>خریداری محفوظ کریں</button></div>
  </section>
  ${vPurchList()}`;
}
function vPurchList(){
  const list=S.purchases.filter(inBranch).sort((a,b)=>b.date-a.date).slice(0,40);
  return `<section class="card"><div class="card-h"><h3>حالیہ خریداری</h3><span class="pill">${list.length}</span></div>
  ${list.length?`<div class="list">${list.map(p=>`<button class="row" data-purv="${esc(p.id)}"><div class="main"><div class="t">خریداری #<span class="num">${esc(p.no)}</span> · ${esc(p.suppName||"نقد")}</div><div class="s"><span class="num">${dstr(p.date)}</span> · ${(p.lines||[]).length} چیزیں${S.branches.length>1?" · "+esc(branchName(p.branch)):""}</div></div><div class="amt"><div class="v">${fmt(p.total)}</div>${p.total>p.paid?`<div class="k c-pay">دینے ہیں ${fmt(p.total-p.paid)}</div>`:`<div class="k c-muted">نقد</div>`}</div></button>`).join("")}</div>`
  :`<div class="empty">سپلائر سے آنے والے مال کے بل یہاں آئیں گے۔</div>`}</section>`;
}
function vCash(){
  const d=S.cashDate||todayStr(),from=new Date(d+"T00:00:00").getTime(),to=from+864e5;
  const prev=cashFlow(0,from),open=sumA(prev.inR)-sumA(prev.out);
  const {inR,out}=cashFlow(from,to),tin=sumA(inR),tout=sumA(out);
  const rowsOf=(a,cls)=>a.sort((x,y)=>x.date-y.date).map(r=>`<div class="led-row" style="grid-template-columns:minmax(0,1fr) 100px"><div style="min-width:0"><div>${esc(r.label)}</div><div class="meta"><span class="num">${new Date(r.date).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>${r.exp&&S.isAdmin?` · <button class="btn ghost sm" style="padding:0 4px" data-delexp="${esc(r.exp)}">حذف</button>`:""}</div><div id="dx_${esc(r.exp||"")}"></div></div><span class="n ${cls}">${fq(r.amt)}</span></div>`).join("");
  return `${readOnlyBanner()}
  <div class="sec-head"><h2 class="h">روزنامچہ</h2><div class="spacer"></div>
    <input type="date" id="cashDate" class="search" style="flex:0 0 auto;min-width:0" value="${d}" aria-label="تاریخ">
    ${S.canWrite?`<button class="btn pay" data-act="newInc">+ آمد</button><button class="btn owe" data-act="newExp">+ خرچہ</button>`:""}</div>
  <div class="stats">
    <div class="card stat"><span class="lbl">پچھلا کیش (حساب سے)</span><span class="val">${fmt(open)}</span></div>
    <div class="card stat pay"><span class="lbl">آج آمد</span><span class="val">${fmt(tin)}</span></div>
    <div class="card stat owe"><span class="lbl">آج ادائیگی و خرچ</span><span class="val">${fmt(tout)}</span></div>
    <div class="card stat"><span class="lbl">دن کے آخر میں کیش</span><span class="val">${fmt(open+tin-tout)}</span></div>
  </div>
  <div class="grid2">
    <section class="card"><div class="card-h"><h3>آمد (نقد وصول)</h3><span class="pill pay num">${fmt(tin)}</span></div>
      ${inR.length?`<div class="led" style="border:0;border-radius:0">${rowsOf(inR,"c-pay")}</div>`:`<div class="empty">اس دن کوئی نقد وصولی نہیں۔ بل کی نقد رقم اور گاہکوں سے ملنے والی رقم خود یہاں آتی ہے۔ کوئی اور رقم آئے تو "+ آمد" سے لکھیں۔</div>`}</section>
    <section class="card"><div class="card-h"><h3>ادائیگی و خرچ</h3><span class="pill owe num">${fmt(tout)}</span></div>
      ${out.length?`<div class="led" style="border:0;border-radius:0">${rowsOf(out,"c-owe")}</div>`:`<div class="empty">اس دن کوئی ادائیگی یا خرچہ نہیں۔ بجلی، کرایہ، تنخواہ جیسے خرچے "+ خرچہ" سے لکھیں۔</div>`}</section>
  </div>
  <p class="note">روزنامچہ خود بنتا ہے: فروخت کی نقد رقم، گاہکوں سے وصولی، سپلائر کو ادائیگی، نقد خریداری، اور ہاتھ سے لکھی آمد اور خرچے۔ "پچھلا کیش" شروع سے اب تک کا حساب ہے۔</p>`;
}
/* ---------- reports ---------- */
function rRange(){
  const d0=dayStart(),D=864e5,now=new Date();
  switch(S.rp){
    case "today":return [d0,d0+D,"آج"];
    case "yday":return [d0-D,d0,"کل"];
    case "week":{const wd=(now.getDay()+6)%7;return [d0-wd*D,d0+D,"یہ ہفتہ"]}
    case "month":return [monthStart(),d0+D,"یہ مہینہ"];
    case "lmonth":{const a=new Date(now.getFullYear(),now.getMonth()-1,1).getTime();return [a,monthStart(),"پچھلا مہینہ"]}
    case "year":return [new Date(now.getFullYear(),0,1).getTime(),d0+D,"یہ سال"];
    case "custom":{const f=S.rFrom?new Date(S.rFrom+"T00:00:00").getTime():monthStart(),t=S.rTo?new Date(S.rTo+"T00:00:00").getTime()+D:d0+D;return [f,Math.max(t,f+D),"منتخب تاریخیں"]}
  }
  return [monthStart(),d0+D,"یہ مہینہ"];
}
const expCat=x=>String(x.note||"متفرق").split(" · ")[0]||"متفرق";
function reportData(){
  const [from,to,label]=rRange(),inR=x=>inBranch(x)&&x.date>=from&&x.date<to;
  const sales=S.sales.filter(inR),purch=S.purchases.filter(inR),allX=S.expenses.filter(inR),exps=allX.filter(x=>x.dir!=="in"&&x.pl!==false),incs=allX.filter(x=>x.dir==="in"&&x.pl!==false);
  const sum=(a,f)=>a.reduce((x,y)=>x+(Number(f(y))||0),0);
  const saleT=sum(sales,s=>s.total),paidT=sum(sales,s=>s.paid);
  const cogs=sum(sales,s=>sum(s.lines||[],l=>(l.cost||0)*l.qty));
  const expT=sum(exps,x=>x.amount),incT=sum(incs,x=>x.amount),purT=sum(purch,p=>p.total);
  const ck=id=>S.customers.find(c=>c.id===id)||{};
  const rec=sum(S.entries.filter(e=>inR(e)&&e.type==="got"&&!e.sale&&!e.purchase&&ck(e.cust).kind!=="supplier"),e=>e.amount);
  const supPaid=sum(S.entries.filter(e=>inR(e)&&e.type==="gave"&&ck(e.cust).kind==="supplier"),e=>e.amount);
  // daily / monthly series
  const days=Math.round((to-from)/864e5),monthly=days>62,buckets=new Map();
  if(monthly){const d=new Date(from);d.setDate(1);while(d.getTime()<to){buckets.set(d.getFullYear()+"-"+d.getMonth(),{t:d.getTime(),v:0,n:0});d.setMonth(d.getMonth()+1)}}
  else for(let t=from;t<to;t+=864e5)buckets.set(dayStart(t),{t,v:0,n:0});
  for(const s of sales){const d=new Date(s.date),k=monthly?d.getFullYear()+"-"+d.getMonth():dayStart(s.date);const b=buckets.get(k);if(b){b.v+=Number(s.total)||0;b.n++}}
  // items
  const im=new Map();for(const s of sales)for(const l of s.lines||[]){const k=l.item||l.name;const o=im.get(k)||{name:l.name,unit:l.unit||"",qty:0,rev:0,prof:0};o.qty+=l.qty;o.rev+=l.qty*l.price;o.prof+=(l.price-(l.cost||0))*l.qty;im.set(k,o)}
  const items=[...im.values()].sort((a,b)=>b.rev-a.rev);
  // customers by sales
  const cm=new Map();for(const s of sales){const k=s.cust||"_cash";const o=cm.get(k)||{name:s.custName||"نقد گاہک",n:0,v:0,cr:0};o.n++;o.v+=Number(s.total)||0;o.cr+=(s.total-s.paid)||0;cm.set(k,o)}
  const custSales=[...cm.values()].sort((a,b)=>b.v-a.v);
  // expenses by category
  const em=new Map();for(const x of exps){const k=expCat(x);em.set(k,(em.get(k)||0)+(Number(x.amount)||0))}
  const expCats=[...em.entries()].sort((a,b)=>b[1]-a[1]);
  // balances (all-time, as of now)
  const bal=balances(),lastGot={};for(const e of S.entries)if(e.type==="got")lastGot[e.cust]=Math.max(lastGot[e.cust]||0,e.date);
  const recv=S.customers.filter(c=>inBranch(c)&&(c.kind||"customer")==="customer"&&(bal[c.id]||0)>0).map(c=>({c,v:bal[c.id],last:lastGot[c.id]||0})).sort((a,b)=>b.v-a.v);
  const pay=S.customers.filter(c=>inBranch(c)&&c.kind==="supplier"&&(bal[c.id]||0)<0).map(c=>({c,v:-bal[c.id]})).sort((a,b)=>b.v-a.v);
  // branches
  const br=S.branches.map(b=>{const bs=S.sales.filter(s=>s.branch===b.id&&s.date>=from&&s.date<to),bxa=S.expenses.filter(x=>x.branch===b.id&&x.date>=from&&x.date<to&&x.pl!==false),bi=sum(bxa.filter(x=>x.dir==="in"),x=>x.amount),bx=bxa.filter(x=>x.dir!=="in");
    const st=sum(bs,s=>s.total),bc=sum(bs,s=>sum(s.lines||[],l=>(l.cost||0)*l.qty)),be=sum(bx,x=>x.amount);return {name:b.name,sales:st,n:bs.length,gross:st-bc,exp:be,net:st-bc-be+bi}});
  return {from,to,label,sales,saleT,paidT,credit:saleT-paidT,cogs,gross:saleT-cogs,expT,incT,net:saleT-cogs-expT+incT,purT,purCredit:purT-sum(purch,p=>p.paid),rec,supPaid,
    series:[...buckets.values()],monthly,items,custSales,expCats,recv,pay,br,nPurch:purch.length};
}
function chartSvg(series,monthly){
  if(!series.length)return "";
  const n=series.length,H=190,padL=52,padB=24,padT=10,bw=Math.max(8,Math.min(28,Math.floor(560/n)-4)),gap=Math.max(2,Math.round(bw*.25));
  const W=padL+n*(bw+gap)+8,max=Math.max(...series.map(b=>b.v),1);
  const pow=Math.pow(10,Math.floor(Math.log10(max))),step=[1,2,2.5,5,10].map(m=>m*pow).find(st=>max/st<=4)||pow*10,top=Math.ceil(max/step)*step;
  const y=v=>padT+(H-padT-padB)*(1-v/top);
  let g="";for(let v=0;v<=top+1e-9;v+=step){g+=`<line class="grid" x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL-6}" y="${y(v)+3}" text-anchor="end">${v>=1e6?(v/1e6)+"M":v>=1e3?(v/1e3)+"k":v}</text>`}
  const every=Math.ceil(n/(monthly?12:10));
  const bars=series.map((b,i)=>{const x=padL+i*(bw+gap)+gap/2,h=Math.max(0,y(0)-y(b.v)),d=new Date(b.t);
    const lbl=monthly?d.toLocaleDateString("en-GB",{month:"short",year:"2-digit"}):d.toLocaleDateString("en-GB",{day:"numeric",month:"short"});
    const r=Math.min(4,bw/2,h);
    const path=h>0?`<path class="bar" d="M${x},${y(0)} V${y(b.v)+r} Q${x},${y(b.v)} ${x+r},${y(b.v)} H${x+bw-r} Q${x+bw},${y(b.v)} ${x+bw},${y(b.v)+r} V${y(0)} Z"/>`:"";
    return `<g data-tip="${esc(lbl)}: ${esc(fmt(b.v))} · ${b.n} بل">${path}<rect x="${x-gap/2}" y="${padT}" width="${bw+gap}" height="${H-padT-padB}" fill="transparent"/>${i%every===0?`<text x="${x+bw/2}" y="${H-8}" text-anchor="middle">${esc(lbl)}</text>`:""}</g>`}).join("");
  return `<div class="chart-wrap" id="chartWrap"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${monthly?"ماہانہ":"روزانہ"} فروخت">${g}${bars}</svg><div class="tip" id="tip" hidden></div></div>`;
}
function vReport(){
  const R=reportData(),P=[["today","آج"],["yday","کل"],["week","یہ ہفتہ"],["month","یہ مہینہ"],["lmonth","پچھلا مہینہ"],["year","یہ سال"],["custom","تاریخیں چنیں"]];
  const dl=true;
  const tbl=(head,rows,empty)=>rows.length?`<div class="tbl-wrap"><table><thead><tr>${head.map((h,i)=>`<th${i?' class="n"':""}>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`:`<div class="empty">${empty}</div>`;
  const ago=t=>t?Math.floor((Date.now()-t)/864e5):null;
  return `<div class="sec-head"><h2 class="h">رپورٹس</h2><div class="spacer"></div><span class="pill">${S.branch==="all"?"تمام برانچیں":esc(branchName(S.branch))}</span></div>
  <div class="chips">${P.map(([k,l])=>`<button class="chip" data-rp="${k}" aria-pressed="${S.rp===k}">${l}</button>`).join("")}</div>
  ${S.rp==="custom"?`<div class="range-row"><label for="rFrom" class="note">سے</label><input type="date" id="rFrom" value="${S.rFrom}"><label for="rTo" class="note">تک</label><input type="date" id="rTo" value="${S.rTo||todayStr()}"></div>`:""}
  <p class="note" style="margin:0"><span class="num">${new Date(R.from).toLocaleDateString("en-GB")}</span> سے <span class="num">${new Date(R.to-1).toLocaleDateString("en-GB")}</span> تک</p>
  <div class="stats">
    <div class="card stat"><span class="lbl">کل فروخت · ${R.sales.length} بل</span><span class="val">${fmt(R.saleT)}</span></div>
    <div class="card stat"><span class="lbl">مجموعی منافع</span><span class="val">${fmt(R.gross)}</span></div>
    <div class="card stat"><span class="lbl">خرچے</span><span class="val">${fmt(R.expT)}</span></div>
    <div class="card stat ${R.net>=0?"pay":"owe"}"><span class="lbl">خالص منافع</span><span class="val">${fmt(R.net)}</span></div>
  </div>
  <section class="card"><div class="card-h"><h3>${R.monthly?"ماہانہ":"روزانہ"} فروخت</h3><span class="note">${esc(R.label)}</span></div>
    ${R.saleT>0?chartSvg(R.series,R.monthly):`<div class="empty">اس عرصے میں کوئی فروخت نہیں۔</div>`}</section>
  <div class="grid2">
    <section class="card"><div class="card-h"><h3>نفع و نقصان</h3><button class="btn ghost sm" data-act="copySummary">واٹس ایپ کے لیے کاپی</button></div>
      <div class="kv">
        <span class="k">کل فروخت</span><span class="v">${fmt(R.saleT)}</span>
        <span class="k">خرید لاگت (بکے مال کی)</span><span class="v">− ${fmt(R.cogs)}</span>
        <span class="sep"></span>
        <span class="k"><b>مجموعی منافع</b>${R.saleT?` <span class="pill num">${Math.round(R.gross/R.saleT*100)}%</span>`:""}</span><span class="v">${fmt(R.gross)}</span>
        ${R.incT?`<span class="k">دیگر آمدنی</span><span class="v">+ ${fmt(R.incT)}</span>`:""}
        <span class="k">خرچے</span><span class="v">− ${fmt(R.expT)}</span>
        <span class="sep"></span>
        <span class="k big"><b>خالص منافع</b></span><span class="v big ${R.net>=0?"c-pay":"c-owe"}">${fmt(R.net)}</span>
      </div>
      <p class="note pad" style="padding-top:0;margin:0">منافع ہر چیز کے خرید ریٹ سے نکالا گیا ہے۔ جن چیزوں کا خرید ریٹ خالی ہو، ان کا پورا ریٹ منافع گنا جاتا ہے۔</p>
    </section>
    <section class="card"><div class="card-h"><h3>نقد اور ادھار</h3></div>
      <div class="kv">
        <span class="k">نقد فروخت</span><span class="v">${fmt(R.paidT)}</span>
        <span class="k">ادھار فروخت</span><span class="v c-owe">${fmt(R.credit)}</span>
        <span class="k">گاہکوں سے وصولی</span><span class="v c-pay">${fmt(R.rec)}</span>
        <span class="sep"></span>
        <span class="k">خریداری · ${R.nPurch} بل</span><span class="v">${fmt(R.purT)}</span>
        <span class="k">اس میں ادھار خریداری</span><span class="v">${fmt(R.purCredit)}</span>
        <span class="k">سپلائرز کو ادائیگی</span><span class="v">${fmt(R.supPaid)}</span>
      </div>
    </section>
  </div>
  ${S.branch==="all"&&S.branches.length>1?`<section class="card"><div class="card-h"><h3>برانچوں کا موازنہ</h3></div>${tbl(["برانچ","بل","فروخت","مجموعی منافع","خرچے","خالص منافع"],R.br.map(b=>`<tr><td><strong>${esc(b.name)}</strong></td><td class="n num">${b.n}</td><td class="n num">${fq(Math.round(b.sales))}</td><td class="n num">${fq(Math.round(b.gross))}</td><td class="n num">${fq(Math.round(b.exp))}</td><td class="n num ${b.net>=0?"c-pay":"c-owe"}">${fq(Math.round(b.net))}</td></tr>`),"")}</section>`:""}
  <section class="card"><div class="card-h"><h3>سب سے زیادہ بکنے والی چیزیں</h3>${dl&&R.items.length?`<button class="btn ghost sm" data-csv="items">CSV فائل</button>`:""}</div>
    ${tbl(["چیز","تعداد","فروخت","منافع"],R.items.slice(0,15).map(i=>`<tr><td>${esc(i.name)}</td><td class="n num">${fq(i.qty)} ${esc(i.unit)}</td><td class="n num">${fq(Math.round(i.rev))}</td><td class="n num ${i.prof>=0?"":"c-owe"}">${fq(Math.round(i.prof))}</td></tr>`),"اس عرصے میں کوئی چیز نہیں بکی۔")}</section>
  <div class="grid2">
    <section class="card"><div class="card-h"><h3>بڑے گاہک (اس عرصے میں)</h3></div>
      ${tbl(["گاہک","بل","خریداری"],R.custSales.slice(0,10).map(c=>`<tr><td>${esc(c.name)}</td><td class="n num">${c.n}</td><td class="n num">${fq(Math.round(c.v))}</td></tr>`),"کوئی فروخت نہیں۔")}</section>
    <section class="card"><div class="card-h"><h3>خرچوں کی تفصیل</h3></div>
      ${tbl(["قسم","رقم"],R.expCats.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="n num">${fq(Math.round(v))}</td></tr>`),"اس عرصے میں کوئی خرچہ درج نہیں۔")}</section>
  </div>
  <section class="card"><div class="card-h"><h3>گاہکوں کے بقایا جات (آج تک)</h3><div style="display:flex;gap:6px;align-items:center"><span class="pill owe num">${fmt(R.recv.reduce((a,r)=>a+r.v,0))}</span>${dl&&R.recv.length?`<button class="btn ghost sm" data-csv="recv">CSV فائل</button>`:""}</div></div>
    ${tbl(["گاہک","فون","بقایا","آخری وصولی"],R.recv.map(r=>{const a=ago(r.last);return `<tr data-cust="${esc(r.c.id)}" style="cursor:pointer"><td><strong>${esc(r.c.name)}</strong></td><td class="n num">${esc(r.c.phone||"")}</td><td class="n num c-owe">${fq(Math.round(r.v))}</td><td class="n">${a===null?`<span class="pill warn">کبھی نہیں</span>`:`<span class="pill ${a>30?"warn":""}">${a===0?"آج":`<span class="num">${a}</span> دن پہلے`}</span>`}</td></tr>`}),"کسی گاہک کے ذمے بقایا نہیں۔")}</section>
  <section class="card"><div class="card-h"><h3>سپلائرز کو دینے ہیں (آج تک)</h3><span class="pill pay num">${fmt(R.pay.reduce((a,r)=>a+r.v,0))}</span></div>
    ${tbl(["سپلائر","فون","دینے ہیں"],R.pay.map(r=>`<tr data-cust="${esc(r.c.id)}" style="cursor:pointer"><td><strong>${esc(r.c.name)}</strong></td><td class="n num">${esc(r.c.phone||"")}</td><td class="n num c-pay">${fq(Math.round(r.v))}</td></tr>`),"کسی سپلائر کے پیسے باقی نہیں۔")}</section>
  <section class="card"><div class="card-h"><h3>اسٹاک رپورٹ (آج تک)</h3>${dl&&S.items.length?`<button class="btn ghost sm" data-csv="stock">CSV فائل</button>`:""}</div>
    ${(()=>{const b=S.branch,its=[...S.items].sort((x,y)=>stockOf(y,b)*(y.cost||0)-stockOf(x,b)*(x.cost||0));const tv=its.reduce((a,i)=>a+stockOf(i,b)*(Number(i.cost)||0),0),tsv=its.reduce((a,i)=>a+stockOf(i,b)*(Number(i.sale)||0),0),low=its.filter(i=>(Number(i.min)||0)>0&&stockOf(i,b)<=Number(i.min)).length;
      return `<div class="kv"><span class="k">مالیت خرید ریٹ پر</span><span class="v">${fmt(tv)}</span><span class="k">مالیت فروخت ریٹ پر</span><span class="v">${fmt(tsv)}</span><span class="k">کم اسٹاک والی چیزیں</span><span class="v">${low}</span></div>`+
      tbl(["چیز","اسٹاک","خرید ریٹ","مالیت"],its.slice(0,25).map(i=>`<tr data-item="${esc(i.id)}" style="cursor:pointer"><td>${esc(i.name)}</td><td class="n num">${fq(stockOf(i,b))} ${esc(i.unit||"")}</td><td class="n num">${fq(i.cost)}</td><td class="n num">${fq(Math.round(stockOf(i,b)*(Number(i.cost)||0)))}</td></tr>`),"اسٹاک میں کوئی چیز نہیں۔")})()}
  </section>`;
}
function csvOf(rows){return "\ufeff"+rows.map(r=>r.map(v=>{v=String(v??"");return /[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}).join(",")).join("\r\n")}
async function exportCsv(kind){
  const R=reportData(),b=S.branch,tag=todayStr();let rows,name;
  if(kind==="items"){rows=[["Item","Qty","Unit","Sales","Profit"],...R.items.map(i=>[i.name,i.qty,i.unit,Math.round(i.rev),Math.round(i.prof)])];name="items-sold-"+tag+".csv"}
  if(kind==="recv"){rows=[["Customer","Phone","Balance","Last payment"],...R.recv.map(r=>[r.c.name,r.c.phone||"",Math.round(r.v),r.last?new Date(r.last).toLocaleDateString("en-GB"):""])];name="receivables-"+tag+".csv"}
  if(kind==="stock"){rows=[["Item","Category","Stock","Unit","Cost","Sale","Value"],...S.items.map(i=>[i.name,i.cat||"",stockOf(i,b),i.unit||"",i.cost||0,i.sale||0,Math.round(stockOf(i,b)*(Number(i.cost)||0))])];name="stock-"+tag+".csv"}
  try{await saveFile(name,csvOf(rows),"text/csv");}catch(e){toast("فائل محفوظ نہیں ہو سکی")}
}
function summaryText(){
  const R=reportData();
  return `وارثی بک — ${R.label}${S.branch!=="all"?" ("+branchName(S.branch)+")":""}
${new Date(R.from).toLocaleDateString("en-GB")} – ${new Date(R.to-1).toLocaleDateString("en-GB")}
فروخت: ${fmt(R.saleT)} (${R.sales.length} بل)
نقد: ${fmt(R.paidT)} · ادھار: ${fmt(R.credit)}
مجموعی منافع: ${fmt(R.gross)}
خرچے: ${fmt(R.expT)}
خالص منافع: ${fmt(R.net)}
وصولی: ${fmt(R.rec)}
کل بقایا (گاہک): ${fmt(R.recv.reduce((a,r)=>a+r.v,0))}`;
}

function vSalesList(){
  const list=S.sales.filter(inBranch).sort((a,b)=>b.date-a.date).slice(0,40);
  return `<section class="card"><div class="card-h"><h3>حالیہ بل</h3><span class="pill">${list.length}</span></div>
  ${list.length?`<div class="list">${list.map(s=>`<button class="row" data-salev="${esc(s.id)}"><div class="main"><div class="t">بل #<span class="num">${esc(s.no)}</span> · ${esc(s.custName||"نقد گاہک")}</div><div class="s"><span class="num">${dstr(s.date)}</span> · ${(s.lines||[]).length} چیزیں${S.branches.length>1?" · "+esc(branchName(s.branch)):""}</div></div><div class="amt"><div class="v">${fmt(s.total)}</div>${s.total>s.paid?`<div class="k c-owe">ادھار ${fmt(s.total-s.paid)}</div>`:`<div class="k c-pay">نقد</div>`}</div></button>`).join("")}</div>`
  :`<div class="empty">محفوظ کیے گئے بل یہاں آئیں گے۔</div>`}</section>`;
}

function vStock(){
  const q=S.stockQ.trim().toLowerCase(),b=S.branch;
  let list=[...S.items];if(q)list=list.filter(it=>(it.name||"").toLowerCase().includes(q)||(it.cat||"").toLowerCase().includes(q));
  list.sort((a,b2)=>(a.name||"").localeCompare(b2.name||""));
  const value=list.reduce((a,it)=>a+stockOf(it,b)*(Number(it.cost)||0),0);
  return `${readOnlyBanner()}
  <div class="sec-head"><h2 class="h">اسٹاک</h2><div class="spacer"></div>${S.canWrite?`<button class="btn primary" data-act="newItem">+ نئی چیز</button>`:""}</div>
  <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))">
    <div class="card stat"><span class="lbl">کل اشیاء</span><span class="val">${list.length}</span></div>
    <div class="card stat"><span class="lbl">اسٹاک کی مالیت (خرید ریٹ)</span><span class="val">${fmt(value)}</span></div>
  </div>
  <input class="search" id="sq" type="search" placeholder="چیز یا قسم سے تلاش (مثلاً پائپ، پینٹ)" value="${esc(S.stockQ)}">
  <section class="card">${list.length?`<div class="tbl-wrap"><table><thead><tr><th>چیز</th><th>قسم</th><th class="n">${b==="all"?"کل اسٹاک":"اسٹاک"}</th><th class="n">فروخت ریٹ</th><th class="n">خرید ریٹ</th></tr></thead><tbody>
  ${list.map(it=>{const s=stockOf(it,b),low=(Number(it.min)||0)>0&&s<=Number(it.min);return `<tr data-item="${esc(it.id)}" style="cursor:pointer"><td><strong>${esc(it.name)}</strong></td><td class="c-muted">${esc(it.cat||"")}</td><td class="n"><span class="pill ${low?"warn":""} num">${fq(s)} ${esc(it.unit||"")}</span></td><td class="n num">${fq(it.sale)}</td><td class="n num c-muted">${fq(it.cost)}</td></tr>`}).join("")}
  </tbody></table></div>`:`<div class="empty"><strong>${q?"کوئی چیز نہیں ملی":"ابھی اسٹاک میں کوئی چیز نہیں"}</strong><span>ہر چیز کا نام، یونٹ (عدد، فٹ، کلو، لیٹر، بیگ)، خرید اور فروخت ریٹ ڈالیں۔ پھر "آمد" سے اسٹاک بڑھائیں۔</span>${!q&&S.canWrite?`<button class="btn primary" data-act="newItem">+ پہلی چیز شامل کریں</button>`:""}</div>`}</section>`;
}

function vBranch(){
  const bal=balances(),t0=monthStart();
  return `<div class="sec-head"><h2 class="h">برانچیں</h2><div class="spacer"></div>${S.isAdmin?`<button class="btn primary" data-act="newBranch">+ نئی برانچ</button>`:""}</div>
  ${S.branches.length?`<div class="grid2">${S.branches.map(br=>{
    const cs=S.customers.filter(c=>c.branch===br.id);let recv=0;for(const c of cs){const v=bal[c.id]||0;if(v>0)recv+=v}
    const ms=S.sales.filter(s=>s.branch===br.id&&s.date>=t0).reduce((a,s)=>a+(Number(s.total)||0),0);
    const val=S.items.reduce((a,it)=>a+stockOf(it,br.id)*(Number(it.cost)||0),0);
    return `<section class="card"><div class="card-h"><h3>${esc(br.name)}</h3>${S.isAdmin?`<button class="btn ghost sm" data-editbranch="${esc(br.id)}">ترمیم</button>`:""}</div>
      <div class="pad" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><div class="note">اس ماہ فروخت</div><div class="num" style="font-weight:600">${fmt(ms)}</div></div>
        <div><div class="note">لینے ہیں</div><div class="num c-owe" style="font-weight:600">${fmt(recv)}</div></div>
        <div><div class="note">اسٹاک مالیت</div><div class="num" style="font-weight:600">${fmt(val)}</div></div>
        <div><div class="note">گاہک</div><div class="num" style="font-weight:600">${cs.length}</div></div>
      </div>${br.address?`<div class="pad note" style="padding-top:0">${esc(br.address)}</div>`:""}
      <div class="pad" style="padding-top:0"><button class="btn sm" data-setbranch="${esc(br.id)}">اس برانچ پر کام کریں</button></div></section>`}).join("")}</div>`
  :`<div class="card empty"><strong>کوئی برانچ نہیں</strong><span>اپنی دکان کو پہلی برانچ کے طور پر شامل کریں۔</span>${S.isAdmin?`<button class="btn primary" data-act="newBranch">+ برانچ بنائیں</button>`:""}</div>`}
  <div id="teamBox"></div>`;
}

/* ---------- sheets ---------- */
function openSheet(title,body){const sh=$("#sheet");sh.innerHTML=`<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}" dir="rtl" lang="ur"><div class="sheet-h"><h3>${esc(title)}</h3><button class="x" data-close aria-label="بند کریں">×</button></div>${body}</div>`;sh.hidden=false;const f=sh.querySelector("input,select,textarea");if(f)setTimeout(()=>f.focus(),30);fillNames()}
function closeSheet(){$("#sheet").hidden=true;$("#sheet").innerHTML="";S.openCust=null;S.openItem=null;S.afterCust=null}
function toast(t){const el=$("#toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2200)}
const branchOptions=(sel)=>S.branches.map(b=>`<option value="${esc(b.id)}" ${sel===b.id?"selected":""}>${esc(b.name)}</option>`).join("");
const defBranch=()=>S.branch!=="all"?S.branch:(S.branches[0]||{}).id||"";

function sheetCustForm(c){
  c=c||{kind:S.kind,branch:defBranch()};
  openSheet(c.id?"کھاتہ تبدیل کریں":(c.kind==="supplier"?"نیا سپلائر":"نیا گاہک"),`<form class="f" data-form="cust" data-id="${esc(c.id||"")}">
    <div class="chips">${(isNative||hasPicker())?`<button type="button" class="btn sm primary" data-act="pickNative">فون کے رابطوں سے چنیں</button>`:""}
      <label class="btn sm" for="vcfIn" style="cursor:pointer">${S.contacts?"رابطوں کی فائل بدلیں":"رابطوں کی فائل (VCF) سے چنیں"}</label>
      ${S.contacts?`<button type="button" class="btn sm" data-act="showContacts">محفوظ رابطے دکھائیں (${S.contacts.length})</button>`:""}
      <input type="file" id="vcfIn" accept=".vcf,text/vcard,text/x-vcard" hidden></div>
    ${!S.contacts&&!hasPicker()&&!isNative?`<p class="note" style="margin:0">اینڈرائیڈ: Contacts ایپ ← Settings ← Export سے .vcf فائل بنائیں اور یہاں چنیں۔ فائل صرف آپ کے فون میں پڑھی جاتی ہے، کہیں محفوظ نہیں ہوتی۔</p>`:""}
    <div id="contactBox"></div>
    <div class="fld"><label for="cName">نام</label><input id="cName" name="name" required value="${esc(c.name||"")}"></div>
    <div class="two"><div class="fld"><label for="cPhone">فون نمبر</label><input id="cPhone" name="phone" inputmode="tel" class="num" placeholder="03xx xxxxxxx" value="${esc(c.phone||"")}"></div>
    <div class="fld"><label for="cKind">قسم</label><select id="cKind" name="kind"><option value="customer" ${c.kind!=="supplier"?"selected":""}>گاہک</option><option value="supplier" ${c.kind==="supplier"?"selected":""}>سپلائر</option></select></div></div>
    <div class="fld"><label for="cBranch">برانچ</label><select id="cBranch" name="branch">${branchOptions(c.branch)}</select></div>
    <div class="fld"><label for="cAddr">پتہ / نوٹ</label><input id="cAddr" name="address" value="${esc(c.address||"")}"></div>
    ${!c.id?`<div class="fld"><label for="cOpen">پرانا بقایا (اگر ہو) — گاہک سے لینے ہیں / سپلائر کو دینے ہیں</label><input id="cOpen" name="opening" class="num" inputmode="decimal" placeholder="0"></div>`:""}
    <div class="actions"><button type="button" class="btn" data-close>منسوخ</button><button class="btn primary">محفوظ کریں</button></div></form>`);
}
/* ---------- WhatsApp ---------- */
const shopLine=()=>S.shopName?"\n— "+S.shopName:"";
function waReminder(c,v){
  if(c.kind==="supplier")return v<0?`السلام علیکم ${c.name}،\nہمارے حساب کے مطابق آپ کے ${fmt(-v)} ہمارے ذمے باقی ہیں۔ جلد ادا کر دیں گے، ان شاء اللہ۔${shopLine()}`:`السلام علیکم ${c.name}،\nہمارا حساب ${v>0?"آپ کے ذمے "+fmt(v)+" بنتا ہے":"برابر ہے"}۔${shopLine()}`;
  return v>0?`السلام علیکم ${c.name}،\nآپ کے کھاتے میں ${fmt(v)} باقی ہیں۔ براہ کرم سہولت سے ادائیگی کر دیں۔ شکریہ${shopLine()}`:`السلام علیکم ${c.name}،\nآپ کا کھاتہ ${v<0?"ہمارے ذمے "+fmt(-v):"برابر"} ہے۔ شکریہ${shopLine()}`;
}
function waStatement(c,rows,v){
  const sup=c.kind==="supplier";
  const lines=rows.slice(0,15).reverse().map(e=>`${new Date(e.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}  ${e.note||(e.type==="gave"?(sup?"ادائیگی":"ادھار"):(sup?"مال آیا":"وصولی"))}  ${e.type==="gave"?"+":"−"}${fq(e.amount)}`);
  return `السلام علیکم ${c.name}،\n*کھاتے کی تفصیل*${rows.length>15?" (آخری 15 اندراج)":""}\n\n${lines.join("\n")}\n\n*${v>0?(sup?"آپ کے ذمے":"آپ کے ذمے باقی"):v<0?(sup?"ہمارے ذمے باقی":"ہمارے ذمے"):"حساب برابر"}: ${fmt(Math.abs(v))}*${shopLine()}`;
}
function waBill(s,purchase){
  return `${purchase?"*خریداری":"*بل"} #${s.no}*  ${new Date(s.date).toLocaleDateString("en-GB")}\n${s.custName||s.suppName||""}\n\n`+(s.lines||[]).map(l=>`${l.name}\n   ${fq(l.qty)} ${l.unit||""} × ${fq(l.price)} = ${fq(l.qty*l.price)}`).join("\n")+`\n\n*کل: ${fmt(s.total)}*\nنقد: ${fmt(s.paid)}`+(s.total>s.paid?`\nادھار: ${fmt(s.total-s.paid)}`:"")+shopLine();
}
function waButtons(phone,pairs){
  const ok=String(phone||"").replace(/\D/g,"").length>=10;
  if(!ok)return `<span class="note">واٹس ایپ کے لیے فون نمبر ڈالیں</span>`;
  return pairs.map(([label,key])=>`<button class="btn sm wa" data-wa="${key}">${WA_ICON}${label}</button>`).join("");
}
const WA_ICON='<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3z"/></svg>';
let WA={};
function sheetCust(id){
  const c=S.customers.find(x=>x.id===id);if(!c)return;S.openCust=id;
  const es=S.entries.filter(e=>e.cust===id).sort((a,b)=>a.date-b.date);
  let run=0;const rows=es.map(e=>{run+=(e.type==="gave"?1:-1)*(Number(e.amount)||0);return {...e,run}}).reverse();
  const v=run;
  WA={remind:[c.phone,waReminder(c,v)],stmt:[c.phone,waStatement(c,rows,v)]};
  openSheet(c.name,`
   <div class="bal-box ${v>0?"owe":v<0?"pay":"zero"}"><div><div class="note">${v>0?"آپ نے لینے ہیں":v<0?"آپ نے دینے ہیں":"حساب برابر ہے"}</div><div class="v ${v>0?"c-owe":v<0?"c-pay":""}">${fmt(Math.abs(v))}</div></div>
     <div class="note"><span class="num">${esc(c.phone||"")}</span><br>${esc(branchName(c.branch))}</div></div>
   ${S.canWrite?(c.kind==="supplier"?`<div class="two" style="margin-top:12px"><button class="btn owe" data-entry="gave">ادائیگی کی</button><button class="btn pay" data-entry="got">مال خریدا (ادھار)</button></div>`:`<div class="two" style="margin-top:12px"><button class="btn owe" data-entry="gave">ادھار دیا / مال دیا</button><button class="btn pay" data-entry="got">رقم ملی</button></div>`):""}
   <div id="entryForm"></div>
   <div class="chips" style="margin:12px 0">
     ${waButtons(c.phone,[[c.kind==="supplier"?"حساب کا پیغام":"بقایا یاددہانی","remind"],["پورا کھاتہ بھیجیں","stmt"]])}
     ${S.canWrite?`<button class="btn sm" data-editcust="${esc(c.id)}">ترمیم</button>`:""}
   </div>
   ${rows.length?`<div class="led"><div class="led-row hd"><span>تفصیل</span><span style="text-align:end">دیے / ملے</span><span style="text-align:end">بقایا</span></div>
   ${rows.map(e=>`<div class="led-row"><div style="min-width:0"><div>${esc(e.note||(c.kind==="supplier"?(e.type==="gave"?"ادائیگی کی":"مال خریدا"):(e.type==="gave"?"ادھار دیا":"رقم ملی")))}</div><div class="meta"><span class="num">${dstr(e.date)}</span>${e.byName?` · ${esc(e.byName)}`:""}${S.isAdmin?` · <button class="btn ghost sm" style="padding:0 4px" data-delentry="${esc(e.id)}">حذف</button>`:""}</div><div id="del_${esc(e.id)}"></div></div><span class="n ${e.type==="gave"?"c-owe":"c-pay"}">${e.type==="gave"?"+":"−"}${fq(e.amount)}</span><span class="n">${fq(e.run)}</span></div>`).join("")}</div>`
   :`<div class="empty">ابھی کوئی لین دین نہیں۔ اوپر کے بٹن سے پہلا اندراج کریں۔</div>`}
  `);
}
function entryFormHtml(type){
  return `<form class="f" data-form="entry" data-type="${type}" style="margin-top:12px;padding:12px;border:1px solid var(--line);border-radius:var(--r)">
    <div class="two"><div class="fld"><label for="eAmt">${(S.customers.find(x=>x.id===S.openCust)||{}).kind==="supplier"?(type==="gave"?"کتنی ادائیگی کی":"کتنے کا مال ملا"):(type==="gave"?"کتنے کا ادھار":"کتنی رقم ملی")}</label><input id="eAmt" name="amount" class="num" inputmode="decimal" required></div>
    <div class="fld"><label for="eDate">تاریخ</label><input id="eDate" name="date" type="date" value="${new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10)}"></div></div>
    <div class="fld"><label for="eNote">تفصیل</label><input id="eNote" name="note" placeholder="${type==="gave"?"مثلاً 10 بیگ سیمنٹ":"مثلاً نقد / بینک ٹرانسفر"}"></div>
    <div class="actions"><button type="button" class="btn" data-cancelentry>منسوخ</button><button class="btn ${type==="gave"?"owe":"pay"}">محفوظ کریں</button></div></form>`;
}
function sheetItemForm(it){
  it=it||{};
  openSheet(it.id?"چیز میں ترمیم":"نئی چیز",`<form class="f" data-form="item" data-id="${esc(it.id||"")}">
    <div class="fld"><label for="iName">نام</label><input id="iName" name="name" required value="${esc(it.name||"")}" placeholder="مثلاً PVC پائپ ½ انچ"></div>
    <div class="two"><div class="fld"><label for="iCat">قسم</label><input id="iCat" name="cat" list="catList" value="${esc(it.cat||"")}" placeholder="پلمبنگ، الیکٹرک، پینٹ…"><datalist id="catList">${[...new Set(S.items.map(x=>x.cat).filter(Boolean))].map(c=>`<option value="${esc(c)}">`).join("")}</datalist></div>
    <div class="fld"><label for="iUnit">یونٹ</label><input id="iUnit" name="unit" list="unitList" value="${esc(it.unit||"عدد")}"><datalist id="unitList"><option value="عدد"><option value="فٹ"><option value="میٹر"><option value="کلو"><option value="لیٹر"><option value="بیگ"><option value="درجن"><option value="ڈبہ"><option value="رول"></datalist></div></div>
    <div class="two"><div class="fld"><label for="iCost">خرید ریٹ</label><input id="iCost" name="cost" class="num" inputmode="decimal" value="${esc(it.cost??"")}"></div>
    <div class="fld"><label for="iSale">فروخت ریٹ</label><input id="iSale" name="sale" class="num" inputmode="decimal" required value="${esc(it.sale??"")}"></div></div>
    <div class="two"><div class="fld"><label for="iMin">کم از کم اسٹاک (الرٹ)</label><input id="iMin" name="min" class="num" inputmode="decimal" value="${esc(it.min??"")}"></div>
    ${!it.id?`<div class="fld"><label for="iOpen">موجودہ اسٹاک (${esc(branchName(defBranch()))})</label><input id="iOpen" name="open" class="num" inputmode="decimal" placeholder="0"></div>`:"<div></div>"}</div>
    <div class="actions"><button type="button" class="btn" data-close>منسوخ</button><button class="btn primary">محفوظ کریں</button></div></form>`);
}
function sheetItem(id){
  const it=S.items.find(x=>x.id===id);if(!it)return;S.openItem=id;
  openSheet(it.name,`
   <div class="tbl-wrap card" style="box-shadow:none"><table><thead><tr><th>برانچ</th><th class="n">اسٹاک</th></tr></thead><tbody>
   ${S.branches.map(b=>`<tr><td>${esc(b.name)}</td><td class="n num">${fq(stockOf(it,b.id))} ${esc(it.unit||"")}</td></tr>`).join("")}
   <tr><td><strong>کل</strong></td><td class="n num"><strong>${fq(stockOf(it,"all"))}</strong></td></tr></tbody></table></div>
   <p class="note">فروخت ریٹ <span class="num">${fq(it.sale)}</span> · خرید ریٹ <span class="num">${fq(it.cost)}</span> · کم از کم <span class="num">${fq(it.min)}</span></p>
   ${S.canWrite?`<form class="f" data-form="move" data-id="${esc(it.id)}" style="padding:12px;border:1px solid var(--line);border-radius:var(--r)">
     <div class="two"><div class="fld"><label for="mType">کام</label><select id="mType" name="type"><option value="in">آمد (مال آیا)</option><option value="out">کمی / خراب مال</option><option value="set">گنتی درست کریں</option>${S.branches.length>1?`<option value="transfer">دوسری برانچ بھیجیں</option>`:""}</select></div>
     <div class="fld"><label for="mQty">تعداد</label><input id="mQty" name="qty" class="num" inputmode="decimal" required></div></div>
     <div class="two"><div class="fld"><label for="mFrom">برانچ</label><select id="mFrom" name="from">${branchOptions(defBranch())}</select></div>
     <div class="fld"><label for="mTo">بھیجیں (صرف ٹرانسفر)</label><select id="mTo" name="to">${branchOptions(S.branches.find(b=>b.id!==defBranch())?.id)}</select></div></div>
     <div class="actions"><button class="btn primary">اسٹاک اپڈیٹ کریں</button></div></form>
     <div class="actions" style="margin-top:10px"><button class="btn sm" data-edititem="${esc(it.id)}">چیز میں ترمیم</button></div>`:""}`);
}
function sheetBranch(b){
  b=b||{};
  openSheet(b.id?"برانچ میں ترمیم":"نئی برانچ",`<form class="f" data-form="branch" data-id="${esc(b.id||"")}">
    <div class="fld"><label for="bName">برانچ کا نام</label><input id="bName" name="name" required value="${esc(b.name||"")}" placeholder="مثلاً مین بازار برانچ"></div>
    <div class="fld"><label for="bAddr">پتہ</label><input id="bAddr" name="address" value="${esc(b.address||"")}"></div>
    <div class="actions"><button type="button" class="btn" data-close>منسوخ</button><button class="btn primary">محفوظ کریں</button></div></form>`);
}
function sheetSale(id){
  const s=S.sales.find(x=>x.id===id);if(!s)return;
  openSheet("بل #"+s.no,`<p class="note"><span class="num">${dstr(s.date)}</span> · ${esc(branchName(s.branch))} · ${esc(s.custName||"نقد گاہک")}${s.byName?` · ${esc(s.byName)}`:""}</p>
   <div class="tbl-wrap card" style="box-shadow:none"><table><thead><tr><th>چیز</th><th class="n">تعداد</th><th class="n">ریٹ</th><th class="n">رقم</th></tr></thead><tbody>
   ${(s.lines||[]).map(l=>`<tr><td>${esc(l.name)}</td><td class="n num">${fq(l.qty)}</td><td class="n num">${fq(l.price)}</td><td class="n num">${fq(l.qty*l.price)}</td></tr>`).join("")}
   <tr><td colspan="3"><strong>کل</strong></td><td class="n num"><strong>${fq(s.total)}</strong></td></tr>
   <tr><td colspan="3">نقد وصول</td><td class="n num">${fq(s.paid)}</td></tr>
   ${s.total>s.paid?`<tr><td colspan="3" class="c-owe">کھاتے میں ادھار</td><td class="n num c-owe">${fq(s.total-s.paid)}</td></tr>`:""}</tbody></table></div>
   <div class="actions" style="margin-top:12px">${(()=>{const c=S.customers.find(x=>x.id===s.cust);WA={bill:[c&&c.phone,waBill(s)]};return c&&c.phone?waButtons(c.phone,[["گاہک کو واٹس ایپ پر بل","bill"]]):""})()}<button class="btn" data-copybill="${esc(s.id)}">بل کا متن کاپی کریں</button></div>`);
}

function sheetPurchase(id){
  const s=S.purchases.find(x=>x.id===id);if(!s)return;
  openSheet("خریداری #"+s.no,`<p class="note"><span class="num">${dstr(s.date)}</span> · ${esc(branchName(s.branch))} · ${esc(s.suppName||"نقد")}${s.byName?` · ${esc(s.byName)}`:""}</p>
   <div class="tbl-wrap card" style="box-shadow:none"><table><thead><tr><th>چیز</th><th class="n">تعداد</th><th class="n">ریٹ</th><th class="n">رقم</th></tr></thead><tbody>
   ${(s.lines||[]).map(l=>`<tr><td>${esc(l.name)}</td><td class="n num">${fq(l.qty)}</td><td class="n num">${fq(l.price)}</td><td class="n num">${fq(l.qty*l.price)}</td></tr>`).join("")}
   <tr><td colspan="3"><strong>کل</strong></td><td class="n num"><strong>${fq(s.total)}</strong></td></tr>
   <tr><td colspan="3">نقد ادا کیا</td><td class="n num">${fq(s.paid)}</td></tr>
   ${s.total>s.paid?`<tr><td colspan="3" class="c-pay">سپلائر کے دینے ہیں</td><td class="n num c-pay">${fq(s.total-s.paid)}</td></tr>`:""}</tbody></table></div>
   <div class="actions" style="margin-top:12px">${(()=>{const c=S.customers.find(x=>x.id===s.supp);WA={bill:[c&&c.phone,waBill(s,true)]};return c&&c.phone?waButtons(c.phone,[["سپلائر کو واٹس ایپ پر بھیجیں","bill"]]):""})()}</div>`);
}
const CATS={in:[["پرانا مال / کباڑ فروخت",1],["کمیشن",1],["کرایہ ملا",1],["متفرق آمدنی",1],["مالک نے رقم ڈالی",0],["بینک سے نکالی",0],["قرض ملا",0]],
  out:[["بجلی کا بل",1],["دکان کا کرایہ",1],["تنخواہ",1],["چائے پانی",1],["گاڑی کرایہ / لوڈنگ",1],["مرمت",1],["متفرق",1],["مالک نے رقم نکالی",0],["بینک میں جمع",0],["قرض واپس کیا",0]]};
function sheetExpense(dir="out"){
  const inc=dir==="in";
  openSheet(inc?"نئی آمد":"نیا خرچہ",`<form class="f" data-form="expense" data-dir="${dir}">
    <div class="two"><div class="fld"><label for="xAmt">رقم</label><input id="xAmt" name="amount" class="num" inputmode="decimal" required></div>
    <div class="fld"><label for="xDate">تاریخ</label><input id="xDate" name="date" type="date" value="${S.cashDate||todayStr()}"></div></div>
    <div class="fld"><label for="xCat">${inc?"آمد کی قسم":"خرچے کی قسم"}</label><input id="xCat" name="cat" list="xCats" required placeholder="${inc?"مثلاً کباڑ فروخت":"مثلاً بجلی کا بل"}"><datalist id="xCats">${CATS[dir].map(([c])=>`<option value="${c}">`).join("")}</datalist></div>
    <div class="fld"><label for="xNote">تفصیل</label><input id="xNote" name="note"></div>
    <div class="fld"><label for="xBranch">برانچ</label><select id="xBranch" name="branch">${branchOptions(defBranch())}</select></div>
    <p class="note" style="margin:0">${inc?"مالک کی ڈالی ہوئی رقم، بینک سے نکالی یا قرض صرف کیش میں گنے جاتے ہیں، منافع میں نہیں۔":"مالک کی نکالی ہوئی رقم، بینک میں جمع یا قرض کی واپسی صرف کیش میں گنے جاتے ہیں، منافع میں نہیں۔"}</p>
    <div class="actions"><button type="button" class="btn" data-close>منسوخ</button><button class="btn ${inc?"pay":"owe"}">محفوظ کریں</button></div></form>`);
}

/* ---------- contacts ---------- */
const hasPicker=()=>{try{return "contacts" in navigator&&"select" in navigator.contacts}catch(e){return false}};
function normPhone(t){t=String(t||"").replace(/[^\d+]/g,"");if(t.startsWith("+92"))t="0"+t.slice(3);else if(t.startsWith("0092"))t="0"+t.slice(4);else if(/^92\d{10}$/.test(t))t="0"+t.slice(2);return t}
function decodeQP(k,v){if(!/QUOTED-PRINTABLE/i.test(k))return v;try{const b=[];for(let i=0;i<v.length;i++){if(v[i]==="="&&/^[0-9A-F]{2}$/i.test(v.substr(i+1,2))){b.push(parseInt(v.substr(i+1,2),16));i+=2}else b.push(v.charCodeAt(i)&255)}return new TextDecoder().decode(new Uint8Array(b))}catch(e){return v}}
function parseVcf(txt){
  const out=[],seen=new Set();
  for(const card of txt.split(/BEGIN:VCARD/i).slice(1)){
    const un=card.replace(/=\r?\n/g,"").replace(/\r?\n[ \t]/g,"");let name="",n="",tels=[];
    for(const line of un.split(/\r?\n/)){const m=line.match(/^([^:]+):(.*)$/);if(!m)continue;const k=m[1].toUpperCase(),v=m[2].trim(),key=k.split(";")[0].replace(/^ITEM\d+\./,"");
      if(key==="FN")name=decodeQP(k,v);else if(key==="N")n=decodeQP(k,v).split(";").filter(Boolean).reverse().join(" ");else if(key==="TEL")tels.push(normPhone(v))}
    name=(name||n).replace(/\\,/g,",").trim();
    for(const t of tels){if(!t)continue;const id=name+"|"+t;if(seen.has(id))continue;seen.add(id);out.push({name:name||t,phone:t})}
  }
  return out.sort((a,b)=>a.name.localeCompare(b.name));
}
function renderContactBox(q){
  const box=$("#contactBox");if(!box||!S.contacts)return;q=(q||"").trim().toLowerCase();
  const list=S.contacts.filter(c=>!q||c.name.toLowerCase().includes(q)||c.phone.includes(q)).slice(0,60);
  const lst=box.querySelector(".clist");
  const html=list.length?list.map((c,i)=>`<button type="button" class="row" data-pickc="${S.contacts.indexOf(c)}"><div class="av">${esc(initial(c.name))}</div><div class="main"><div class="t">${esc(c.name)}</div><div class="s num">${esc(c.phone)}</div></div></button>`).join(""):`<div class="empty">کوئی رابطہ نہیں ملا</div>`;
  if(lst){lst.innerHTML=html;return}
  box.innerHTML=`<div style="border:1px solid var(--line);border-radius:var(--r);overflow:hidden"><div style="padding:8px"><input class="search" id="cSearch" type="search" placeholder="${S.contacts.length} رابطوں میں تلاش کریں" style="width:100%"></div><div class="list clist" style="max-height:260px;overflow:auto">${html}</div></div>`;
  $("#cSearch").focus();
}
function fillContact(c){const n=$("#cName"),p=$("#cPhone");if(n&&!n.value.trim())n.value=c.name;else if(n&&c.name)n.value=c.name;if(p)p.value=c.phone;const box=$("#contactBox");if(box)box.innerHTML="";toast("رابطہ شامل ہو گیا")}
async function pickNative(){
  if(isNative){try{const c=await pickPhoneContact();if(c)fillContact({name:c.name,phone:normPhone(c.phone)})}catch(e){toast("رابطوں کی اجازت نہیں ملی۔ فون کی سیٹنگز میں وارثی بک کو Contacts کی اجازت دیں۔")}return}
  try{const r=await navigator.contacts.select(["name","tel"],{multiple:false});if(r&&r[0])fillContact({name:(r[0].name||[])[0]||"",phone:normPhone((r[0].tel||[])[0]||"")})}
  catch(e){toast("فون کی رابطہ فہرست یہاں نہیں کھلی۔ رابطوں کی فائل (VCF) استعمال کریں۔")}
}

/* ---------- names ---------- */
function fillNames(){}

/* ---------- writes ---------- */
const syncNow=()=>{for(const c of ["branches","items","customers","entries","sales","purchases","expenses","users"])S[c]=list(c)};
async function w(fn){try{await fn();syncNow();return true}catch(e){toast("محفوظ نہیں ہو سکا، دوبارہ کوشش کریں");console.error(e);return false}}
const by=()=>({by:me.uid,byName:me.name||""});
const num=v=>{const n=parseFloat(String(v||"").replace(/,/g,""));return isFinite(n)?n:0};



document.addEventListener("submit",async ev=>{
  const f=ev.target.closest("form[data-form]");if(!f)return;ev.preventDefault();
  const d=Object.fromEntries(new FormData(f));const kind=f.dataset.form,id=f.dataset.id;
  const btn=f.querySelector("button:not([type=button])");if(btn)btn.disabled=true;
  let ok=false;
  if(kind==="cust"){
    const body={name:d.name.trim(),phone:d.phone.trim(),kind:d.kind,branch:d.branch||"",address:d.address.trim()};
    if(id)ok=await w(()=>db.update("customers",id,body));
    else{const ref={id:newId("customers")};const ops=[{op:"set",col:"customers",id:ref.id,data:{...body,createdAt:Date.now(),...by()}}];
      if(num(d.opening)>0)ops.push({op:"set",col:"entries",id:newId("entries"),data:{cust:ref.id,type:body.kind==="supplier"?"got":"gave",amount:num(d.opening),note:"پرانا بقایا",date:Date.now(),branch:body.branch,...by()}});
      ok=await w(()=>db.batch(ops));
      if(ok&&S.afterCust){const k=S.afterCust;S.afterCust=null;closeSheet();if(k==="customer"){S.saleCust=ref.id;if(S.saleMode==="cash")S.saleLedger=true}else{S.pSupp=ref.id}render();toast((k==="customer"?"گاہک":"سپلائر")+" بن گیا اور بل میں چن لیا");return}
      if(ok){closeSheet();S.kind=body.kind;S.tab="khata";render();sheetCust(ref.id);toast("کھاتہ بن گیا");return}}
    if(ok){closeSheet();toast("محفوظ ہو گیا")}
  }
  if(kind==="entry"){
    const c=S.customers.find(x=>x.id===S.openCust);const amt=num(d.amount);
    if(amt<=0){toast("رقم درج کریں");if(btn)btn.disabled=false;return}
    const dt=d.date?new Date(d.date+"T"+new Date().toTimeString().slice(0,8)).getTime():Date.now();
    ok=await w(()=>db.add("entries",{cust:S.openCust,type:f.dataset.type,amount:amt,note:d.note.trim(),date:dt,branch:c?c.branch:"",...by()}));
    if(ok){toast("اندراج محفوظ");sheetCust(S.openCust)}
  }
  if(kind==="item"){
    const body={name:d.name.trim(),cat:d.cat.trim(),unit:d.unit.trim(),cost:num(d.cost),sale:num(d.sale),min:num(d.min)};
    if(id)ok=await w(()=>db.update("items",id,body));
    else{const b=defBranch();ok=await w(()=>db.add("items",{...body,stock:b?{[b]:num(d.open)}:{},createdAt:Date.now()}))}
    if(ok){closeSheet();toast("محفوظ ہو گیا")}
  }
  if(kind==="move"){
    const it=S.items.find(x=>x.id===id),q=num(d.qty),from=d.from;
    if(!from){toast("پہلے برانچ بنائیں");if(btn)btn.disabled=false;return}
    const cur=stockOf(it,from);
    if(d.type==="in")ok=await w(()=>db.addStock(id,from,q));
    else if(d.type==="out")ok=await w(()=>db.addStock(id,from,-q));
    else if(d.type==="set")ok=await w(()=>db.addStock(id,from,q-cur));
    else if(d.type==="transfer"){
      if(d.to===from){toast("دونوں برانچیں ایک جیسی ہیں");if(btn)btn.disabled=false;return}
      ok=await w(()=>db.batch([{op:"stock",id,branch:from,delta:-q},{op:"stock",id,branch:d.to,delta:q}]));
    }
    if(ok){toast("اسٹاک اپڈیٹ ہو گیا");sheetItem(id)}
  }
  if(kind==="expense"){
    const amt=num(d.amount);if(amt<=0){toast("رقم درج کریں");if(btn)btn.disabled=false;return}
    const dt=d.date?new Date(d.date+"T"+new Date().toTimeString().slice(0,8)).getTime():Date.now();
    const dir=f.dataset.dir==="in"?"in":"out",cat=d.cat.trim(),known=CATS[dir].find(([c])=>c===cat);
    ok=await w(()=>db.add("expenses",{amount:amt,dir,pl:known?!!known[1]:true,note:cat+(d.note.trim()?" · "+d.note.trim():""),date:dt,branch:d.branch||"",...by()}));
    if(ok){closeSheet();toast(dir==="in"?"آمد محفوظ":"خرچہ محفوظ")}
  }
  if(kind==="branch"){
    const body={name:d.name.trim(),address:d.address.trim()};
    if(id)ok=await w(()=>db.update("branches",id,body));
    else ok=await w(()=>db.add("branches",{...body,createdAt:Date.now()}));
    if(ok){closeSheet();toast("برانچ محفوظ")}
  }
  if(btn&&!ok)btn.disabled=false;
});

async function saveSale(){
  const bid=S.branch!=="all"?S.branch:(S.branches[0]||{}).id;
  const lines=S.cart.filter(l=>l.qty>0).map(l=>({item:l.item,name:l.name,qty:l.qty,price:l.price,cost:l.cost||0,unit:l.unit||""}));
  if(!lines.length)return;
  const total=lines.reduce((a,l)=>a+l.qty*l.price,0);
  const {paid,due}=payCalc("sale",total);
  const cust=S.customers.find(c=>c.id===S.saleCust);
  if(!cust&&due>0){toast("ادھار کے لیے گاہک چنیں");return}
  const toLedger=cust&&(due>0||S.saleLedger);
  const no=nowId();
  const btn=document.querySelector('[data-act="saveSale"]');if(btn)btn.disabled=true;
  const ref={id:newId("sales")},ops=[{op:"set",col:"sales",id:ref.id,data:{no,branch:bid,cust:cust?cust.id:null,custName:cust?cust.name:"",lines,total,paid,date:Date.now(),...by()}}];
  if(toLedger){const t=Date.now();ops.push({op:"set",col:"entries",id:newId("entries"),data:{cust:cust.id,type:"gave",amount:total,note:"بل #"+no+" (مال دیا)",date:t,branch:bid,...by(),sale:ref.id}});
    if(paid>0)ops.push({op:"set",col:"entries",id:newId("entries"),data:{cust:cust.id,type:"got",amount:paid,note:"بل #"+no+" (نقد وصول)",date:t+1,branch:bid,...by(),sale:ref.id}});}
  for(const l of lines)if(S.items.some(x=>x.id===l.item))ops.push({op:"stock",id:l.item,branch:bid,delta:-l.qty});
  const ok=await w(()=>db.batch(ops));
  if(!ok){if(btn)btn.disabled=false;return}
  S.cart=[];S.saleCust="";S.salePaid="";S.saleMode="cash";render();toast("بل #"+no+" محفوظ");sheetSale(ref.id);
}

async function savePurchase(){
  const bid=S.branch!=="all"?S.branch:(S.branches[0]||{}).id;
  const lines=S.pcart.filter(l=>l.qty>0).map(l=>({item:l.item,name:l.name,qty:l.qty,price:l.price,unit:l.unit||""}));
  if(!lines.length)return;
  const total=lines.reduce((a,l)=>a+l.qty*l.price,0);
  const {paid,due}=payCalc("purchase",total);
  const sup=S.customers.find(c=>c.id===S.pSupp);
  if(!sup&&due>0){toast("ادھار خریداری کے لیے سپلائر چنیں");return}
  const toLedger=sup&&(due>0||S.pLedger);
  const no="P"+nowId();
  const btn=document.querySelector('[data-act="savePurchase"]');if(btn)btn.disabled=true;
  const ref={id:newId("purchases")},ops=[{op:"set",col:"purchases",id:ref.id,data:{no,branch:bid,supp:sup?sup.id:null,suppName:sup?sup.name:"",lines,total,paid,date:Date.now(),...by()}}];
  if(toLedger){const t=Date.now();ops.push({op:"set",col:"entries",id:newId("entries"),data:{cust:sup.id,type:"got",amount:total,note:"خریداری #"+no+" (مال آیا)",date:t,branch:bid,...by(),purchase:ref.id}});
    if(paid>0)ops.push({op:"set",col:"entries",id:newId("entries"),data:{cust:sup.id,type:"gave",amount:paid,note:"خریداری #"+no+" (نقد ادا)",date:t+1,branch:bid,...by(),purchase:ref.id}});}
  for(const l of lines)if(S.items.some(x=>x.id===l.item))ops.push({op:"stock",id:l.item,branch:bid,delta:l.qty,extra:S.updCost&&l.price>0?{cost:l.price}:{}});
  const ok=await w(()=>db.batch(ops));
  if(!ok){if(btn)btn.disabled=false;return}
  S.pcart=[];S.pSupp="";S.pPaid="";S.pMode="cash";render();toast("خریداری #"+no+" محفوظ");sheetPurchase(ref.id);
}
function updPTotal(){
  const total=S.pcart.reduce((a,l)=>a+l.qty*l.price,0);const el=$("#pTotal");if(el)el.textContent=fmt(total);
  const h=$("#pHint");if(!h)return;const {paid,due}=payCalc("purchase",total);
  h.className="pay-hint "+(due>0&&!S.pSupp?"bad":due>0?"due":"ok");
  h.textContent=due>0?(S.pSupp?`نقد ${fmt(paid)} · باقی ${fmt(due)} سپلائر کے کھاتے میں "دینے ہیں" لکھا جائے گا۔`:`ادھار کے لیے اوپر سے سپلائر چنیں یا "+ نیا سپلائر" بنائیں۔`):(S.pSupp&&S.pLedger?`پوری ادائیگی نقد، اور سپلائر کے کھاتے میں بھی ریکارڈ ہوگی۔`:`پوری ادائیگی نقد ${fmt(total)}۔`);
}

/* ---------- events ---------- */
document.addEventListener("click",async ev=>{
  const t=ev.target.closest("button,a,tr[data-item]");if(!t)return;
  const ds=t.dataset;
  if(t.id==="sheet")return;
  if(ds.tab){S.tab=ds.tab;try{localStorage.setItem("hk_tab",S.tab)}catch(e){};render();window.scrollTo(0,0);return}
  if(ds.go){S.tab=ds.go;render();return}
  if("close" in ds){closeSheet();return}
  if(ds.kind){S.kind=ds.kind;render();return}
  if(ds.bill){S.billMode=ds.bill;render();return}
  if(ds.pm){const [k,m]=ds.pm.split(":");if(k==="sale")S.saleMode=m;else S.pMode=m;render();return}
  if(ds.quick){S.afterCust=ds.quick;sheetCustForm({kind:ds.quick,branch:defBranch()});return}
  if(ds.wa){const x=WA[ds.wa];if(x)openWhatsApp(x[0],x[1]);return}
  if(ds.rp){S.rp=ds.rp;render();return}
  if(ds.csv){exportCsv(ds.csv);return}
  if(ds.purv){sheetPurchase(ds.purv);return}
  if(ds.prm){S.pcart.splice(+ds.prm,1);render();return}
  if(ds.pickc){fillContact(S.contacts[+ds.pickc]);return}
  if(ds.delexp){const box=$("#dx_"+CSS.escape(ds.delexp));if(box)box.innerHTML=`<div class="confirm">یہ خرچہ حذف کریں؟<button class="btn owe sm" data-delexpyes="${esc(ds.delexp)}">ہاں، حذف</button><button class="btn sm" data-delno>نہیں</button></div>`;return}
  if(ds.delexpyes){if(await w(()=>db.remove("expenses",ds.delexpyes)))toast("حذف ہو گیا");return}
  if(ds.cust){sheetCust(ds.cust);return}
  if(ds.item){sheetItem(ds.item);return}
  if(ds.salev){sheetSale(ds.salev);return}
  if(ds.editcust){sheetCustForm(S.customers.find(c=>c.id===ds.editcust));return}
  if(ds.edititem){sheetItemForm(S.items.find(c=>c.id===ds.edititem));return}
  if(ds.editbranch){sheetBranch(S.branches.find(c=>c.id===ds.editbranch));return}
  if(ds.setbranch){S.branch=ds.setbranch;try{localStorage.setItem("hk_branch",S.branch)}catch(e){};S.tab="home";render();return}
  if(ds.entry){$("#entryForm").innerHTML=entryFormHtml(ds.entry);$("#eAmt").focus();return}
  if("cancelentry" in ds){$("#entryForm").innerHTML="";return}
  if(ds.delentry){const box=$("#del_"+CSS.escape(ds.delentry));if(box)box.innerHTML=`<div class="confirm">یہ اندراج حذف کریں؟<button class="btn owe sm" data-delyes="${esc(ds.delentry)}">ہاں، حذف</button><button class="btn sm" data-delno>نہیں</button></div>`;return}
  if(ds.delyes){if(await w(()=>db.remove("entries",ds.delyes))){toast("حذف ہو گیا");sheetCust(S.openCust)}return}
  if("delno" in ds){t.closest(".confirm").remove();return}
  if(ds.rm){S.cart.splice(+ds.rm,1);render();return}
  if(ds.copybill){const s=S.sales.find(x=>x.id===ds.copybill);const txt=`بل #${s.no}\n${new Date(s.date).toLocaleString("en-GB")}\n${s.custName||"نقد گاہک"}\n`+(s.lines||[]).map(l=>`${l.name}  ${fq(l.qty)} × ${fq(l.price)} = ${fq(l.qty*l.price)}`).join("\n")+`\nکل: ${fmt(s.total)}\nنقد: ${fmt(s.paid)}`+(s.total>s.paid?`\nادھار: ${fmt(s.total-s.paid)}`:"");
    try{await navigator.clipboard.writeText(txt);toast("کاپی ہو گیا — واٹس ایپ پر پیسٹ کریں")}catch(e){toast("کاپی نہیں ہو سکا")}return}
  const a=ds.act;
  if(a==="newCust")sheetCustForm();
  if(a==="newItem")sheetItemForm();
  if(a==="newBranch")sheetBranch();
  if(a==="clearCart"){S.cart=[];S.salePaid="";render()}
  if(a==="saveSale")saveSale();
  if(a==="clearP"){S.pcart=[];S.pPaid="";render()}
  if(a==="savePurchase")savePurchase();
  if(a==="newExp")sheetExpense("out");
  if(a==="newInc")sheetExpense("in");
  if(a==="copySummary"){try{await navigator.clipboard.writeText(summaryText());toast("کاپی ہو گیا — واٹس ایپ پر پیسٹ کریں")}catch(e){toast("کاپی نہیں ہو سکا")}}
  if(a==="pickNative")pickNative();
  if(a==="showContacts")renderContactBox("");
});
document.addEventListener("pointermove",e=>{
  const wrap=e.target.closest&&e.target.closest("#chartWrap");const tip=$("#tip");if(!tip)return;
  const g=wrap&&e.target.closest("g[data-tip]");document.querySelectorAll("#chartWrap .bar.on").forEach(b=>b.classList.remove("on"));
  if(!g){tip.hidden=true;return}
  const r=wrap.getBoundingClientRect();tip.textContent=g.dataset.tip;tip.style.left=(e.clientX-r.left+wrap.scrollLeft)+"px";tip.style.top=(e.clientY-r.top)+"px";tip.hidden=false;
  const b=g.querySelector(".bar");if(b)b.classList.add("on");
});
$("#sheet").addEventListener("click",e=>{if(e.target.id==="sheet")closeSheet()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#sheet").hidden)closeSheet()});
$("#branchSel").addEventListener("change",e=>{S.branch=e.target.value;try{localStorage.setItem("hk_branch",S.branch)}catch(x){};render()});
document.addEventListener("input",e=>{
  const t=e.target;
  if(t.id==="q"){S.q=t.value;const pos=t.selectionStart;render();const n=$("#q");n.focus();n.setSelectionRange(pos,pos)}
  if(t.id==="sq"){S.stockQ=t.value;const pos=t.selectionStart;render();const n=$("#sq");n.focus();n.setSelectionRange(pos,pos)}
  if(t.dataset.cq!==undefined){S.cart[+t.dataset.cq].qty=num(t.value);updTotal()}
  if(t.dataset.cp!==undefined){S.cart[+t.dataset.cp].price=num(t.value);updTotal()}
  if(t.id==="salePaid"){S.salePaid=t.value;updTotal()}
  if(t.dataset.pq!==undefined){S.pcart[+t.dataset.pq].qty=num(t.value);updPTotal()}
  if(t.dataset.pp!==undefined){S.pcart[+t.dataset.pp].price=num(t.value);updPTotal()}
  if(t.id==="pPaid"){S.pPaid=t.value;updPTotal()}
  if(t.id==="cSearch")renderContactBox(t.value);
});
document.addEventListener("change",e=>{
  const t=e.target;
  if(t.id==="itemPick"){const it=S.items.find(x=>x.name===t.value.trim());if(it){const ex=S.cart.find(l=>l.item===it.id);if(ex)ex.qty+=1;else S.cart.push({item:it.id,name:it.name,qty:1,price:Number(it.sale)||0,cost:Number(it.cost)||0,unit:it.unit});render();$("#itemPick").focus()}else if(t.value)toast("یہ چیز اسٹاک میں نہیں۔ پہلے اسٹاک میں شامل کریں۔")}
  if(t.id==="saleCust"){S.saleCust=t.value;render()}
  if(t.id==="pSupp"){S.pSupp=t.value;render()}
  if(t.id==="updCost")S.updCost=t.checked;
  if(t.id==="saleLedger"){S.saleLedger=t.checked;updTotal()}
  if(t.id==="pLedger"){S.pLedger=t.checked;updPTotal()}
  if(t.id==="cashDate"){S.cashDate=t.value;render()}
  if(t.id==="rFrom"){S.rFrom=t.value;render()}
  if(t.id==="rTo"){S.rTo=t.value;render()}
  if(t.id==="pItemPick"){const it=S.items.find(x=>x.name===t.value.trim());if(it){const ex=S.pcart.find(l=>l.item===it.id);if(ex)ex.qty+=1;else S.pcart.push({item:it.id,name:it.name,qty:1,price:Number(it.cost)||0,unit:it.unit});render();$("#pItemPick").focus()}else if(t.value)toast("یہ چیز اسٹاک میں نہیں۔ پہلے اسٹاک میں شامل کریں۔")}
  if(t.id==="vcfIn"&&t.files&&t.files[0]){const r=new FileReader();r.onload=()=>{const list=parseVcf(String(r.result||""));if(!list.length){toast("اس فائل میں کوئی نمبر نہیں ملا");return}S.contacts=list;renderContactBox("")};r.readAsText(t.files[0]);t.value=""}
});
function updTotal(){
  const total=S.cart.reduce((a,l)=>a+l.qty*l.price,0);const el=$("#cartTotal");if(el)el.textContent=fmt(total);
  const h=$("#saleHint");if(!h)return;const {mode,paid,due}=payCalc("sale",total);
  h.className="pay-hint "+(due>0&&!S.saleCust?"bad":due>0?"due":"ok");
  h.textContent=due>0?(S.saleCust?`نقد ${fmt(paid)} · باقی ${fmt(due)} گاہک کے کھاتے میں ادھار لکھا جائے گا۔`:`ادھار کے لیے اوپر سے گاہک چنیں یا "+ نیا گاہک" بنائیں۔`):(S.saleCust&&S.saleLedger?`پورا بل نقد، اور گاہک کے کھاتے میں بھی ریکارڈ ہوگا۔`:`پورا بل نقد ${fmt(total)}۔`);
}

window.addEventListener("wb:refreshCust",()=>{if(S.openCust)sheetCust(S.openCust)});
if(!isNative&&"serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
/* ---------- boot ---------- */
import("./boot.js").then(m=>m.boot({S,me,render,toast,$,esc,fmt,db,list,startSync,stopSync,setErrorHandler,authApi,shopInfo,watchMe,createShop,requestAccess,setRole,saveFile}));
export {S};
