// Static frontend (GitHub Pages). Uses public values only: publishable key,
// Supabase URL, LINE Login channel id, redirect URI. Secrets never reach the
// browser; access control is enforced by database RLS.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CFG = window.APP_CONFIG || {};

function notConfigured() {
  return !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY ||
    CFG.SUPABASE_URL.indexOf("YOUR-REF") >= 0;
}
if (notConfigured()) {
  document.getElementById("app").innerHTML =
    '<div class="banner">尚未設定。請編輯 <b>frontend/config.js</b>，填入你的 Supabase URL / publishable key ' +
    '（以及要用 LINE 綁定時的 LINE Login 資訊），再重新整理。</div>';
  throw new Error("APP_CONFIG not set");
}

const sb = createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

var state = { session:null, profile:null, items:[], addInterval:30 };

function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){
  return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]; }); }
function fmtDate(iso){ if(!iso) return "—"; var d=new Date(iso);
  return d.toLocaleDateString("zh-TW",{month:"numeric",day:"numeric",year:"numeric"}); }
function toast(msg){ var t=document.getElementById("toast"); t.textContent=msg;
  t.classList.add("show"); setTimeout(function(){ t.classList.remove("show"); },1800); }
function route(){ var h=location.hash.replace(/^#/,""); return h.split("?")[0] || "/"; }

// --- Data ---
async function loadProfile(){
  var uid = state.session.user.id;
  var r = await sb.from("profiles").select("*").eq("id", uid).maybeSingle();
  if(r.data){ state.profile = r.data; return; }
  // Create the profile if the signup trigger did not.
  var up = await sb.from("profiles").upsert({ id: uid }).select("*").maybeSingle();
  state.profile = up.data || { id: uid, notify_enabled:true, timezone:"Asia/Taipei" };
}
async function loadItems(){
  var r = await sb.from("items").select("*").order("next_due_at",{ascending:true});
  state.items = r.data || [];
}

// --- Views ---
function renderNav(){
  var nav = document.getElementById("nav");
  if(!state.session){ nav.innerHTML = '<span class="title">定期補貨提醒</span>'; return; }
  var r = route();
  nav.innerHTML =
    '<span class="title">定期補貨提醒</span>' +
    '<a data-go="/" class="'+(r==="/"?"active":"")+'">品項</a>' +
    '<a data-go="/settings" class="'+(r==="/settings"?"active":"")+'">設定</a>' +
    '<a data-act="logout">登出</a>';
}

function renderLogin(){
  document.getElementById("app").innerHTML =
    '<div class="card">' +
    '<h2>登入 / 註冊</h2>' +
    '<p class="muted">輸入 Email，我們會寄一封登入連結給你（免密碼）。</p>' +
    '<label>Email</label><input id="email" type="email" placeholder="you@example.com" />' +
    '<button class="primary" data-act="magic">寄送登入連結</button>' +
    '</div>';
}

function intervalPresets(current){
  var opts=[{d:7,t:"每週"},{d:14,t:"每兩週"},{d:30,t:"每月"},{d:90,t:"每季"}];
  var html='<div class="presets">';
  for(var i=0;i<opts.length;i++){
    html += '<span class="chip '+(current===opts[i].d?"sel":"")+'" data-preset="'+opts[i].d+'">'+opts[i].t+'</span>';
  }
  html += '</div>';
  return html;
}

var SUGGESTIONS = ["衛生紙","貓砂","洗髮精","沐浴乳","牙膏","洗衣精","咖啡","隱形眼鏡藥水","貓糧","狗糧","維他命","刮鬍刀片"];
function suggestionChips(){
  var html='<div class="presets">';
  for(var i=0;i<SUGGESTIONS.length;i++){
    html += '<span class="chip" data-suggest="'+esc(SUGGESTIONS[i])+'">'+esc(SUGGESTIONS[i])+'</span>';
  }
  html += '</div>';
  return html;
}

function renderItems(){
  var list="";
  if(state.items.length===0){
    list = '<div class="empty">還沒有品項，先在上面新增一個吧！</div>';
  } else {
    for(var i=0;i<state.items.length;i++){
      var it = state.items[i];
      var link = it.source_url ? '<a class="shop" href="'+esc(it.source_url)+'" target="_blank" rel="noopener">🔗 購物連結</a>' : '';
      list +=
        '<div class="item '+(it.active?"":"inactive")+'">' +
          '<div class="top"><span class="name">'+esc(it.title)+'</span></div>' +
          '<div class="meta">每 '+it.interval_days+' 天 ・ 下次提醒 '+fmtDate(it.next_due_at)+' '+link+'</div>' +
          '<div class="row">' +
            '<label style="margin:0">週期</label>' +
            '<input type="number" min="1" max="3650" value="'+it.interval_days+'" data-int="'+it.id+'" />' +
            '<button class="ghost" data-save="'+it.id+'">儲存</button>' +
            '<label style="margin:0"><input type="checkbox" '+(it.active?"checked":"")+' data-active="'+it.id+'" /> 啟用</label>' +
            '<button class="link" data-del="'+it.id+'">刪除</button>' +
          '</div>' +
        '</div>';
    }
  }
  document.getElementById("app").innerHTML =
    '<div class="card">' +
      '<h2>新增補貨品項</h2>' +
      '<label>要定期補貨什麼？</label><input id="i-title" type="text" placeholder="例：貓砂、隱形眼鏡藥水" />' +
      '<div style="margin-top:6px" class="muted">常買的，點一下帶入：</div>' +
      suggestionChips() +
      '<label>多久補一次？</label>' + intervalPresets(state.addInterval) +
      '<input id="i-interval" type="number" min="1" max="3650" value="'+state.addInterval+'" style="margin-top:8px" />' +
      '<details style="margin-top:12px"><summary class="muted" style="cursor:pointer">進階：指定商品連結（選填）</summary>' +
        '<input id="i-url" type="url" placeholder="通常免填，提醒會用名稱產生搜尋連結" style="margin-top:8px" /></details>' +
      '<button class="primary" data-act="add">新增</button>' +
    '</div>' +
    '<div class="card"><h2>我的品項（'+state.items.length+'）</h2>'+list+'</div>';
}

function renderSettings(){
  var p = state.profile || {};
  var lineBlock;
  if(p.line_user_id){
    lineBlock = '<p>✅ 已綁定 LINE'+(p.line_display_name?'（'+esc(p.line_display_name)+'）':'')+'</p>' +
                '<button class="ghost" data-act="test-notify">立即測試通知</button> ' +
                '<button class="ghost" data-act="line-unbind">解除綁定</button>';
  } else if(!CFG.LINE_LOGIN_CHANNEL_ID){
    lineBlock = '<p class="muted">尚未設定 LINE Login（config.js 的 LINE_LOGIN_CHANNEL_ID 為空）。log 通知模式可先略過。</p>';
  } else {
    lineBlock = '<p class="muted">綁定後才能收到補貨提醒推播。</p>' +
                '<button class="primary" data-act="line-bind">綁定 LINE 接收通知</button>';
  }
  document.getElementById("app").innerHTML =
    '<div class="card"><h2>帳號</h2><p class="muted">'+esc(state.session.user.email)+'</p></div>' +
    '<div class="card"><h2>LINE 通知</h2>'+lineBlock+'</div>' +
    '<div class="card"><h2>偏好設定</h2>' +
      '<label><input type="checkbox" id="s-notify" '+(p.notify_enabled?"checked":"")+' /> 開啟補貨提醒</label>' +
      '<label>時區</label><input id="s-tz" type="text" value="'+esc(p.timezone||"Asia/Taipei")+'" />' +
      '<button class="primary" data-act="save-profile">儲存</button>' +
    '</div>';
}

async function render(){
  renderNav();
  if(!state.session){ renderLogin(); return; }
  if(route()==="/settings"){ await loadProfile(); renderSettings(); }
  else { await loadItems(); renderItems(); }
}

// --- Events ---
function lineAuthUrl(){
  var u = new URL("https://access.line.me/oauth2/v2.1/authorize");
  u.searchParams.set("response_type","code");
  u.searchParams.set("client_id", CFG.LINE_LOGIN_CHANNEL_ID);
  u.searchParams.set("redirect_uri", CFG.LINE_LOGIN_REDIRECT_URI);
  u.searchParams.set("state", state.session.access_token);
  u.searchParams.set("scope","openid profile");
  u.searchParams.set("nonce", Math.random().toString(36).slice(2));
  u.searchParams.set("bot_prompt","aggressive");
  return u.toString();
}

document.addEventListener("click", async function(e){
  var t = e.target;
  var go = t.getAttribute && t.getAttribute("data-go");
  if(go){ location.hash = "#"+go; return; }
  var preset = t.getAttribute && t.getAttribute("data-preset");
  if(preset){ state.addInterval = parseInt(preset,10); renderItems(); return; }
  var sug = t.getAttribute && t.getAttribute("data-suggest");
  if(sug){ var ti=document.getElementById("i-title"); if(ti){ ti.value=sug; ti.focus(); } return; }
  var act = t.getAttribute && t.getAttribute("data-act");

  if(act==="magic"){
    var email = document.getElementById("email").value.trim();
    if(!email){ toast("請輸入 Email"); return; }
    var r = await sb.auth.signInWithOtp({ email: email, options:{ emailRedirectTo: CFG.APP_URL } });
    toast(r.error ? ("寄送失敗："+r.error.message) : "登入連結已寄出，請查收 Email");
    return;
  }
  if(act==="logout"){ await sb.auth.signOut(); location.hash="#/"; return; }

  if(act==="add"){
    var title = document.getElementById("i-title").value.trim();
    var url = document.getElementById("i-url").value.trim();
    var interval = parseInt(document.getElementById("i-interval").value,10);
    if(!title){ toast("請輸入品項名稱"); return; }
    if(!(interval>0)){ toast("週期需為正整數"); return; }
    var ins = await sb.from("items").insert({
      user_id: state.session.user.id, title: title,
      source_url: url || null, interval_days: interval
    });
    if(ins.error){ toast("新增失敗："+ins.error.message); return; }
    toast("已新增"); await loadItems(); renderItems();
    return;
  }
  if(act==="save-profile"){
    var notify = document.getElementById("s-notify").checked;
    var tz = document.getElementById("s-tz").value.trim() || "Asia/Taipei";
    var up = await sb.from("profiles").update({ notify_enabled: notify, timezone: tz })
      .eq("id", state.session.user.id);
    toast(up.error ? ("儲存失敗："+up.error.message) : "已儲存");
    return;
  }
  if(act==="test-notify"){
    toast("送出中…");
    var tn = await sb.functions.invoke("test-notify");
    if(tn.error){ toast("測試失敗，請重新登入再試"); return; }
    var d = tn.data || {};
    if(d.ok){ toast(d.provider==="line" ? "已送出，看你的 LINE 📲" : "log 模式：已印到 function log"); }
    else if(d.error==="not_bound"){ toast("請先綁定 LINE"); }
    else { toast("測試失敗："+(d.error||"unknown")); }
    return;
  }
  if(act==="line-bind"){ location.href = lineAuthUrl(); return; }
  if(act==="line-unbind"){
    var un = await sb.from("profiles").update({ line_user_id:null, line_display_name:null })
      .eq("id", state.session.user.id);
    toast(un.error ? "解除失敗" : "已解除綁定"); await loadProfile(); renderSettings();
    return;
  }

  var del = t.getAttribute && t.getAttribute("data-del");
  if(del){
    var d = await sb.from("items").delete().eq("id", del);
    if(d.error){ toast("刪除失敗"); return; }
    toast("已刪除"); await loadItems(); renderItems();
    return;
  }
  var save = t.getAttribute && t.getAttribute("data-save");
  if(save){
    var inp = document.querySelector('[data-int="'+save+'"]');
    var v = parseInt(inp.value,10);
    if(!(v>0)){ toast("週期需為正整數"); return; }
    var us = await sb.from("items").update({ interval_days:v }).eq("id", save);
    if(us.error){ toast("更新失敗"); return; }
    toast("已更新"); await loadItems(); renderItems();
    return;
  }
});

document.addEventListener("change", async function(e){
  var actId = e.target.getAttribute && e.target.getAttribute("data-active");
  if(actId){
    var a = await sb.from("items").update({ active: e.target.checked }).eq("id", actId);
    if(a.error){ toast("更新失敗"); return; }
    await loadItems(); renderItems();
  }
});

window.addEventListener("hashchange", render);

// Toast after returning from the LINE bind flow.
function checkLineReturn(){
  var h = location.hash;
  if(h.indexOf("line=ok")>=0){ toast("LINE 綁定成功"); location.hash="#/settings"; }
  else if(h.indexOf("line=err")>=0){ toast("LINE 綁定失敗，請再試一次"); location.hash="#/settings"; }
}

// --- Start ---
sb.auth.onAuthStateChange(function(_e, session){ state.session = session; render(); });
(async function(){
  var s = await sb.auth.getSession();
  state.session = s.data.session;
  checkLineReturn();
  render();
})();
