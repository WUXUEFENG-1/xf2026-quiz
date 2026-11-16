/* ===== 配置 ===== */
const SUPABASE_URL = '';        // 例如 https://abcdefg.supabase.co
const SUPABASE_ANON_KEY = '';   // Supabase 项目 Settings → API → anon public key
const ADMIN_PASS = 'xf2026';
const EXAM_SECONDS = 3600;
const PRACTICE_COUNT = 30;
const TYPE_NAME = {s:'单选题',m:'多选题',j:'判断题'};

const REMOTE = /^https?:\/\//.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;
const LS_REG = 'xfq_registrations';
const LS_RES = 'xfq_results';
const LS_SESSION = 'xfq_session';

const state = {mode:'exam',user:null,order:[],answers:{},flags:{},locked:{},cur:0,deadline:0,startedAt:0,timer:null,result:null};
const $ = id => document.getElementById(id);
const views = ['home','signup','login','exam','result','board','admin'];

/* ===== 数据访问层：云端优先，未配置时使用本机 ===== */
function sbHeaders(extra){
  const h = {'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json'};
  return Object.assign(h, extra||{});
}
async function sbGet(path){
  const r = await fetch(SUPABASE_URL+'/rest/v1/'+path,{headers:sbHeaders()});
  if(!r.ok) throw new Error('cloud '+r.status+' '+await r.text());
  return r.json();
}
async function sbPost(path,row){
  const r = await fetch(SUPABASE_URL+'/rest/v1/'+path,{method:'POST',headers:sbHeaders({'Prefer':'return=representation'}),body:JSON.stringify(row)});
  if(!r.ok) throw new Error('cloud '+r.status+' '+await r.text());
  return r.json();
}

function local(key){ try{ return JSON.parse(localStorage.getItem(key)||'[]'); }catch(e){ return []; } }
function saveLocal(key,arr){ localStorage.setItem(key,JSON.stringify(arr)); }

const db = {
  async listRegs(){
    if(REMOTE) return sbGet('registrations?select=*&order=created_at.asc');
    return local(LS_REG);
  },
  async findReg(sid){
    if(REMOTE) return (await sbGet('registrations?select=*&sid=eq.'+encodeURIComponent(sid)))[0]||null;
    return local(LS_REG).find(r=>r.sid===sid)||null;
  },
  async addReg(row){
    if(REMOTE) return sbPost('registrations',row);
    const arr=local(LS_REG); arr.push(row); saveLocal(LS_REG,arr); return row;
  },
  async listResults(){
    if(REMOTE) return sbGet('results?select=*&order=score.desc,used.asc');
    return local(LS_RES);
  },
  async addResult(row){
    if(REMOTE) return sbPost('results',row);
    const arr=local(LS_RES); arr.push(row); saveLocal(LS_RES,arr); return row;
  },
  async removeResult(sid){
    if(REMOTE) throw new Error('云端模式请直接在 Supabase 表中删除记录');
    saveLocal(LS_RES, local(LS_RES).filter(r=>r.sid!==sid));
  }
};

/* ===== 工具 ===== */
function shuffle(a){ const b=a.slice(); for(let i=b.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [b[i],b[j]]=[b[j],b[i]]; } return b; }
function fmtClock(sec){ sec=Math.max(0,sec); const m=Math.floor(sec/60),s=sec%60; return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
function fmtUsed(sec){ const m=Math.floor(sec/60),s=sec%60; return m+'′'+String(s).padStart(2,'0')+'″'; }
function nowStr(){ const d=new Date(),p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes()); }
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._tm); t._tm=setTimeout(()=>t.classList.remove('show'),2200); }

let modalCb=null;
function modal(title,text,okText,cb,cancelText){
  $('modal-title').textContent=title; $('modal-text').textContent=text;
  $('modal-ok').textContent=okText||'确定'; $('modal-cancel').textContent=cancelText||'取消';
  $('modal-cancel').classList.toggle('hide',cancelText===null);
  modalCb=cb||null; $('modal').classList.remove('hide');
}
function closeModal(){ $('modal').classList.add('hide'); modalCb=null; }
$('modal-ok').onclick=()=>{ const cb=modalCb; closeModal(); if(cb) cb(); };
$('modal-cancel').onclick=closeModal;

/* ===== 视图切换 ===== */
function go(v){
  if(v==='practice'){ startPractice(); return; }
  views.forEach(n=>$('view-'+n).classList.toggle('hide',n!==v));
  if(v==='board') renderBoard();
  if(v==='admin'){ const ok=sessionStorage.getItem('xfq_admin')==='1'; $('admin-gate').classList.toggle('hide',ok); $('admin-body').classList.toggle('hide',!ok); if(ok) renderAdmin(); }
  if(v==='signup') fillDeptOptions();
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.go)));

async function fillDeptOptions(){
  const dl=$('dept-list'); if(!dl) return;
  try{
    const regs=await db.listRegs();
    const names=[...new Set(regs.map(r=>r.dept).filter(Boolean))];
    dl.innerHTML=names.map(n=>'<option value="'+n+'">').join('');
  }catch(e){}
}

/* ===== 数据源状态 ===== */
(async function checkSource(){
  const chip=$('db-status');
  if(REMOTE){
    try{
      await sbGet('results?select=score&limit=1');
      chip.className='chip on'; chip.textContent='云端已连接 · Supabase 实时同步';
    }catch(e){
      chip.className='chip off'; chip.textContent='云端连接失败，已临时使用本机数据';
      toast('Supabase 连接失败，请检查配置');
    }
  }else{
    chip.className='chip off'; chip.textContent='本机模式 · 数据保存在当前浏览器';
  }
})();

/* ===== 报名 ===== */
$('signup-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const name=$('s-name').value.trim(),sid=$('s-sid').value.trim(),dept=$('s-dept').value.trim(),cls=$('s-class').value.trim(),phone=$('s-phone').value.trim();
  const msg=$('signup-msg'); msg.className=''; msg.style.color='var(--red)';
  if(!name||!sid||!dept||!cls){ msg.textContent='请完整填写姓名、学号、系（部）和班级。'; msg.classList.remove('hide'); return; }
  if(!/^\d{6,20}$/.test(sid)){ msg.textContent='学号应为 6—20 位数字，请核对后填写。'; msg.classList.remove('hide'); return; }
  if(phone && !/^1\d{10}$/.test(phone)){ msg.textContent='手机号格式不正确，可留空。'; msg.classList.remove('hide'); return; }
  if(!$('s-agree').checked){ msg.textContent='请先阅读并勾选参赛须知。'; msg.classList.remove('hide'); return; }
  try{
    const old=await db.findReg(sid);
    if(old){
      if(old.name===name){ msg.style.color='var(--ok)'; msg.textContent='该学号已报名（'+old.name+'，'+old.dept+'），可直接登录答题。'; msg.classList.remove('hide'); return; }
      msg.textContent='该学号已被其他姓名占用，请核对学号或联系组委会。'; msg.classList.remove('hide'); return;
    }
    await db.addReg({sid,name,dept,class:cls,phone:phone||null,created_at:nowStr()});
    msg.style.color='var(--ok)'; msg.textContent='报名成功，正在跳转登录…'; msg.classList.remove('hide');
    setTimeout(()=>{ $('f-sid').value=sid; $('f-name').value=name; go('login'); },900);
  }catch(err){
    msg.textContent='报名提交失败：'+err.message; msg.classList.remove('hide');
  }
});

/* ===== 登录 / 开始考试 ===== */
$('login-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const sid=$('f-sid').value.trim(),name=$('f-name').value.trim();
  const err=$('login-err'); err.classList.add('hide');
  if(!sid||!name){ err.textContent='请填写学号与姓名。'; err.classList.remove('hide'); return; }
  let reg=null;
  try{ reg=await db.findReg(sid); }catch(e2){ err.textContent='无法校验报名信息：'+e2.message; err.classList.remove('hide'); return; }
  if(!reg){ err.innerHTML='未查询到该学号的报名记录，请先<a href="#signup" data-go="signup" style="color:var(--red);text-decoration:underline">在线报名</a>。'; err.classList.remove('hide');
    const a=err.querySelector('a'); if(a) a.onclick=ev=>{ev.preventDefault();go('signup');}; return; }
  if(reg.name!==name){ err.textContent='姓名与报名信息不一致，请核对后重试。'; err.classList.remove('hide'); return; }
  state.user={sid:reg.sid,name:reg.name,dept:reg.dept,class:reg.class||''};

  const s=localStorage.getItem(LS_SESSION);
  if(s){
    try{
      const saved=JSON.parse(s);
      if(saved.user&&saved.user.sid===sid){
        modal('继续上次答题','检测到该学号存在未提交的答题记录（已答 '+Object.keys(saved.answers).length+' 题），是否继续作答？','继续作答',()=>resume(saved));
        return;
      }
    }catch(e3){}
  }
  begin();
});

function begin(){
  state.mode='exam'; state.answers={}; state.flags={}; state.locked={}; state.cur=0;
  state.order=BANK.map((_,i)=>i);
  state.startedAt=Date.now(); state.deadline=state.startedAt+EXAM_SECONDS*1000;
  prepareExamView(); go('exam'); saveSession(); startTimer();
}
function resume(saved){
  state.mode=saved.mode||'exam'; state.user=saved.user;
  state.order=saved.order||BANK.map((_,i)=>i);
  state.answers=saved.answers||{}; state.flags=saved.flags||{}; state.locked={};
  state.cur=saved.cur||0; state.startedAt=saved.startedAt||Date.now();
  state.deadline=saved.deadline||(state.startedAt+EXAM_SECONDS*1000);
  prepareExamView(); go('exam'); startTimer();
}
function startPractice(){
  state.mode='practice';
  state.user={sid:'',name:'练习选手',dept:'练习模式',class:''};
  state.order=shuffle(BANK.map((_,i)=>i)).slice(0,PRACTICE_COUNT);
  state.answers={}; state.flags={}; state.locked={}; state.cur=0;
  state.startedAt=Date.now(); state.deadline=0;
  prepareExamView(); go('exam'); startTimer();
}
function prepareExamView(){
  $('whoami').textContent=state.mode==='practice'?'练习模式':'已登录：'+state.user.name;
  $('exam-name').textContent=state.mode==='practice'?'练习模式':state.user.name;
  $('exam-meta').textContent=state.mode==='practice'
    ? '随机抽取 '+PRACTICE_COUNT+' 题 · 不计入成绩'
    : '学号 '+state.user.sid+' ｜ '+state.user.dept+(state.user.class?' ｜ '+state.user.class:'');
  buildSheet(); showQuestion(state.cur);
}

/* ===== 计时 ===== */
function startTimer(){
  clearInterval(state.timer);
  const tick=()=>{
    if(state.mode==='practice'){
      $('clock-text').textContent=fmtClock(Math.floor((Date.now()-state.startedAt)/1000));
      $('clock-text').classList.remove('warn'); return;
    }
    const left=Math.round((state.deadline-Date.now())/1000);
    $('clock-text').textContent=fmtClock(left);
    $('clock-text').classList.toggle('warn',left<=600);
    if(left<=0){ clearInterval(state.timer); autoSubmit(); }
  };
  tick(); state.timer=setInterval(tick,1000);
}

/* ===== 答题卡与题目 ===== */
function buildSheet(){
  const g=$('sheet-grid'); g.innerHTML='';
  state.order.forEach((_,i)=>{
    const b=document.createElement('button'); b.className='gn'; b.textContent=i+1; b.onclick=()=>showQuestion(i); g.appendChild(b);
  });
  $('finish-practice').classList.toggle('hide',state.mode!=='practice');
  $('submit-btn').classList.toggle('hide',state.mode==='practice');
  $('clock-label').textContent=state.mode==='practice'?'练习已用时':'剩余时间';
  $('q-tip').textContent=state.mode==='practice'?'练习模式：答完本题即显示答案与解析':'多选题需选全所有正确选项方可得分';
}
function refreshSheet(){
  const g=$('sheet-grid');
  state.order.forEach((_,i)=>{
    const b=g.children[i]; if(!b) return;
    const answered=(state.answers[i]||[]).length>0;
    b.className='gn'+(answered?' done':'')+(state.flags[i]?' flag':'')+(i===state.cur?' cur':'');
  });
  const done=Object.keys(state.answers).filter(k=>(state.answers[k]||[]).length>0).length;
  $('sheet-progress').textContent='已答 '+done+' / '+state.order.length;
  $('prog-bar').style.width=(done/state.order.length*100).toFixed(1)+'%';
}
function showQuestion(i){
  if(i<0||i>=state.order.length) return;
  state.cur=i;
  const q=BANK[state.order[i]];
  const locked=!!state.locked[i]&&state.mode==='practice';
  $('q-index').textContent='第 '+(i+1)+' / '+state.order.length+' 题';
  const tag=$('q-type-tag'); tag.textContent=TYPE_NAME[q.t]+'·每题1分'; tag.className='tag'+(q.t==='m'?' red':'');
  $('q-title').innerHTML='<span class="num">'+(i+1)+'.</span>'+q.q;
  const opts=$('q-opts'); opts.innerHTML='';
  const picked=state.answers[i]||[];
  q.o.forEach((text,k)=>{
    const b=document.createElement('button');
    let cls=picked.includes(k)?' on':'';
    if(locked){ cls=q.a.includes(k)?' right':(picked.includes(k)?' wrong':''); }
    b.className='opt'+cls;
    b.innerHTML='<span class="k">'+String.fromCharCode(65+k)+'</span><span>'+text+'</span>';
    b.disabled=locked; b.onclick=()=>selectOpt(k); opts.appendChild(b);
  });
  if(state.mode==='practice'&&q.t==='m'&&!locked){
    const box=document.createElement('div'); box.style.marginTop='6px';
    const btn=document.createElement('button'); btn.className='btn ghost sm'; btn.textContent='确认本题答案';
    btn.onclick=()=>{ if(!(state.answers[i]||[]).length){ toast('请至少选择一个选项'); return; } state.locked[i]=true; showQuestion(i); };
    box.appendChild(btn); opts.appendChild(box);
  }
  const fb=$('q-feedback');
  if(locked){
    const ok=isCorrect(q,picked);
    fb.className='feedback '+(ok?'ok':'bad');
    fb.innerHTML='<b>'+(ok?'回答正确':'回答错误')+'</b>　正确答案：'+q.a.map(x=>String.fromCharCode(65+x)).join('')+'　'+q.e;
    fb.classList.remove('hide');
  }else{ fb.classList.add('hide'); fb.textContent=''; }
  $('flag-btn').textContent=state.flags[i]?'已标记':'标记';
  $('prev-btn').disabled=i===0;
  $('next-btn').classList.toggle('hide',i===state.order.length-1);
  refreshSheet();
}
function selectOpt(k){
  const i=state.cur,q=BANK[state.order[i]];
  if(state.mode==='practice'&&state.locked[i]) return;
  const arr=(state.answers[i]||[]).slice();
  if(q.t==='m'){ const at=arr.indexOf(k); at>=0?arr.splice(at,1):arr.push(k); }
  else { arr.length=0; arr.push(k); }
  state.answers[i]=arr.sort((a,b)=>a-b);
  if(state.mode==='practice'&&q.t!=='m') state.locked[i]=true;
  saveSession(); showQuestion(i);
}
function isCorrect(q,picked){
  if(!picked||!picked.length) return false;
  const a=q.a.slice().sort(),b=picked.slice().sort();
  return a.length===b.length&&a.every((v,k)=>v===b[k]);
}
$('prev-btn').onclick=()=>{ if(state.cur>0) showQuestion(state.cur-1); };
$('next-btn').onclick=()=>{ if(state.cur<state.order.length-1) showQuestion(state.cur+1); };
$('flag-btn').onclick=()=>{ state.flags[state.cur]=!state.flags[state.cur]; saveSession(); showQuestion(state.cur); };
$('finish-practice').onclick=()=>grade(true);

/* ===== 作答保存 ===== */
function saveSession(){
  if(state.mode!=='exam'||!state.user) return;
  localStorage.setItem(LS_SESSION,JSON.stringify({mode:state.mode,user:state.user,order:state.order,answers:state.answers,flags:state.flags,cur:state.cur,deadline:state.deadline,startedAt:state.startedAt}));
}
function clearSession(){ localStorage.removeItem(LS_SESSION); }

/* ===== 交卷与判分 ===== */
$('submit-btn').onclick=()=>submit();
function autoSubmit(){ modal('答题时间到','系统已自动为你提交试卷。','查看成绩',()=>grade(false),null); }
function submit(){
  const answered=Object.keys(state.answers).filter(k=>(state.answers[k]||[]).length>0).length;
  modal('确认交卷','共 '+state.order.length+' 题，已答 '+answered+' 题，未答 '+(state.order.length-answered)+' 题。交卷后不可修改，是否确认交卷？','确认交卷',()=>grade(false));
}
async function grade(isPractice){
  clearInterval(state.timer);
  const detail={s:{t:0,r:0},m:{t:0,r:0},j:{t:0,r:0}};
  let right=0;
  state.order.forEach((bi,i)=>{
    const q=BANK[bi]; detail[q.t].t++;
    if(isCorrect(q,state.answers[i])){ detail[q.t].r++; right++; }
  });
  const elapsed=Math.max(1,Math.floor((Date.now()-state.startedAt)/1000));
  const used=state.mode==='practice'?elapsed:Math.min(EXAM_SECONDS,elapsed);
  const rec={score:right,right,wrong:state.order.length-right,used,detail,time:nowStr()};
  clearSession();

  if(state.mode==='practice'){ rec.practice=true; rec.rank=null; state.result=rec; showResult(rec); return; }

  rec.sid=state.user.sid; rec.name=state.user.name; rec.dept=state.user.dept; rec.class=state.user.class;
  rec.created_at=nowStr();
  try{ await db.addResult(rec); }catch(e){ toast('成绩保存失败：'+e.message); }
  try{ rec.rank=await rankOf(rec.sid); }catch(e){ rec.rank=null; }
  state.result=rec; showResult(rec);
}
async function rankOf(sid){
  const all=await db.listResults();
  const best=bestBySid(all);
  const i=best.findIndex(r=>r.sid===sid);
  return i>=0?{rank:i+1,total:best.length}:null;
}
function bestBySid(rows){
  const map=new Map();
  rows.forEach(r=>{
    const cur=map.get(r.sid);
    if(!cur||r.score>cur.score||(r.score===cur.score&&r.used<cur.used)) map.set(r.sid,r);
  });
  return [...map.values()].sort((a,b)=>b.score-a.score||a.used-b.used||String(a.created_at||'').localeCompare(String(b.created_at||'')));
}

function showResult(r){
  $('r-score').textContent=r.score;
  $('r-title').textContent=r.practice?'练习完成':'答题完成，成绩已提交';
  $('result-sub').textContent=r.practice?'练习不计入排名，可查看错题解析':'初赛线上答题成绩，个人排名按得分与用时排序';
  $('r-who').textContent=r.practice?'练习模式 · 随机 '+state.order.length+' 题':(r.name+' ｜ '+r.sid+' ｜ '+r.dept+(r.class?' ｜ '+r.class:''));
  $('r-right').textContent=r.right;
  const tot=r.right+r.wrong;
  $('r-rank').textContent=r.rank?('第 '+r.rank.rank+' / '+r.rank.total):'—';
  $('r-rate').textContent=(tot?Math.round(r.right/tot*100):0)+'%';
  $('r-time').textContent=fmtUsed(r.used);
  const rows=[
    ['单选题',r.detail.s.t,r.detail.s.r,r.detail.s.t-r.detail.s.r,rate(r.detail.s.r,r.detail.s.t)],
    ['多选题',r.detail.m.t,r.detail.m.r,r.detail.m.t-r.detail.m.r,rate(r.detail.m.r,r.detail.m.t)],
    ['判断题',r.detail.j.t,r.detail.j.r,r.detail.j.t-r.detail.j.r,rate(r.detail.j.r,r.detail.j.t)]
  ].map(x=>'<tr><td class="c">'+x[0]+'</td><td class="c">'+x[1]+'</td><td class="c">'+x[2]+'</td><td class="c">'+x[3]+'</td><td class="c">'+x[4]+'</td></tr>').join('');
  $('r-table').innerHTML=rows;

  const review=state.mode==='practice';
  $('r-review-btn').classList.toggle('hide',!review);
  $('review-block').classList.add('hide');
  if(review){
    const items=[];
    state.order.forEach((bi,i)=>{
      const q=BANK[bi];
      if(!isCorrect(q,state.answers[i])){
        items.push('<div style="border:1px solid var(--line);background:var(--card);padding:14px 16px">'+
          '<div style="font-family:Noto Serif SC,serif;font-size:15px;margin-bottom:6px">'+(i+1)+'. '+q.q+'</div>'+
          '<div style="font-size:12.5px;color:var(--muted);margin-bottom:4px">你的答案：'+((state.answers[i]||[]).length?state.answers[i].map(x=>String.fromCharCode(65+x)).join(''):'未作答')+'　｜　正确答案：'+q.a.map(x=>String.fromCharCode(65+x)).join('')+'</div>'+
          '<div style="font-size:12.5px;color:#4c4a44">'+q.e+'</div></div>');
      }
    });
    if(!items.length){ $('review-list').innerHTML='<div class="empty">全部答对，没有错题。</div>'; }
    else{
      $('review-list').innerHTML=items.slice(0,10).join('')+(items.length>10?'<button class="btn ghost sm" id="review-more" style="align-self:flex-start">展开全部错题（共 '+items.length+' 题）</button>':'');
      const more=$('review-more'); if(more) more.onclick=()=>{ $('review-list').innerHTML=items.join(''); };
    }
  }
  go('result');
}
function rate(r,t){ return t?Math.round(r/t*100)+'%':'—'; }
$('r-review-btn').onclick=()=>$('review-block').classList.toggle('hide');

/* ===== 榜单 ===== */
async function renderBoard(){
  let rows=[];
  try{ rows=await db.listResults(); }catch(e){ toast('云端数据读取失败：'+e.message); }
  const best=bestBySid(rows);
  $('board-empty').classList.toggle('hide',best.length>0);
  $('board-person-body').innerHTML=best.map((r,i)=>
    '<tr><td class="c"><span class="rank-badge'+(i<3?' top':'')+'">'+(i+1)+'</span></td>'+
    '<td>'+esc(r.name)+'</td><td>'+esc(r.sid)+'</td><td>'+esc(r.dept)+'</td>'+
    '<td class="c"><b>'+r.score+'</b></td><td class="c">'+fmtUsed(r.used)+'</td><td class="c">'+esc(r.created_at||'')+'</td></tr>').join('');

  let regs=[];
  try{ regs=await db.listRegs(); }catch(e){}
  const depts=new Map();
  regs.forEach(r=>{ if(!r.dept) return; const d=depts.get(r.dept)||{dept:r.dept,reg:0,join:0,sum:0}; d.reg++; depts.set(r.dept,d); });
  best.forEach(r=>{ const d=depts.get(r.dept)||{dept:r.dept,reg:0,join:0,sum:0}; d.join++; d.sum+=r.score; depts.set(r.dept,d); });
  const list=[...depts.values()].sort((a,b)=>b.join-a.join||b.reg-a.reg);
  $('board-dept-body').innerHTML=list.map((d,i)=>
    '<tr><td class="c">'+(i+1)+'</td><td>'+esc(d.dept)+'</td><td class="c">'+d.reg+'</td><td class="c">'+d.join+'</td>'+
    '<td class="c">'+(d.join?(d.sum/d.join).toFixed(1):'—')+'</td></tr>').join('')
    || '<tr><td colspan="5" class="c" style="color:var(--muted)">暂无数据</td></tr>';
  $('board-sub').textContent='共 '+best.length+' 名参赛选手，'+list.length+' 个系（部）；按最好成绩排名。';
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

document.querySelectorAll('.tab[data-tab]').forEach(t=>{
  t.onclick=()=>{
    document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.remove('on'));
    t.classList.add('on');
    const isPerson=t.dataset.tab==='person';
    $('board-person').classList.toggle('hide',!isPerson);
    $('board-dept').classList.toggle('hide',isPerson);
  };
});

/* ===== 管理端 ===== */
$('admin-enter').onclick=()=>{
  if($('admin-pass').value.trim()===ADMIN_PASS){ sessionStorage.setItem('xfq_admin','1'); $('admin-gate').classList.add('hide'); $('admin-body').classList.remove('hide'); renderAdmin(); }
  else{ const e=$('admin-err'); e.textContent='口令不正确，请重新输入。'; e.classList.remove('hide'); }
};
async function renderAdmin(){
  let regs=[],res=[];
  try{ regs=await db.listRegs(); }catch(e){}
  try{ res=await db.listResults(); }catch(e){}
  const best=bestBySid(res);
  $('st-reg').textContent=regs.length; $('st-res').textContent=res.length; $('st-join').textContent=best.length;
  $('st-avg').textContent=best.length?(best.reduce((s,r)=>s+r.score,0)/best.length).toFixed(1):'0';
  $('st-src').textContent=REMOTE?'Supabase':'本机';
  $('admin-note').textContent=REMOTE
    ? '说明：云端模式下，报名与成绩数据来自 Supabase 的 registrations、results 两张表；删除记录请在 Supabase 控制台操作。'
    : '说明：本机模式下数据保存在当前浏览器，可通过 JSON 备份与导入迁移。';

  $('admin-reg-body').innerHTML=regs.map((r,i)=>
    '<tr><td class="c">'+(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.sid)+'</td><td>'+esc(r.dept)+'</td>'+
    '<td>'+esc(r.class||'')+'</td><td class="c">'+esc(r.phone||'—')+'</td><td class="c">'+esc(r.created_at||'')+'</td></tr>').join('')
    || '<tr><td colspan="7" class="c" style="color:var(--muted)">暂无报名记录</td></tr>';

  $('admin-res-body').innerHTML=res.slice().sort((a,b)=>b.score-a.score||a.used-b.used).map((r,i)=>
    '<tr><td class="c">'+(i+1)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.sid)+'</td><td>'+esc(r.dept)+'</td>'+
    '<td>'+esc(r.class||'')+'</td><td class="c"><b>'+r.score+'</b></td><td class="c">'+fmtUsed(r.used)+'</td>'+
    '<td class="c">'+esc(r.created_at||'')+'</td>'+
    '<td class="c">'+(REMOTE?'<span style="color:#9b958a;font-size:12px">云端</span>':'<button class="btn ghost sm" data-del="'+esc(r.sid)+'">删除</button>')+'</td></tr>').join('')
    || '<tr><td colspan="9" class="c" style="color:var(--muted)">暂无成绩记录</td></tr>';

  document.querySelectorAll('[data-del]').forEach(b=>{
    b.onclick=()=>{ const sid=b.dataset.del;
      modal('删除记录','确认删除学号 '+sid+' 的全部成绩记录？','删除',async()=>{ await db.removeResult(sid); renderAdmin(); toast('已删除'); }); };
  });
}
document.querySelectorAll('.tab[data-atab]').forEach(t=>{
  t.onclick=()=>{
    document.querySelectorAll('.tab[data-atab]').forEach(x=>x.classList.remove('on'));
    t.classList.add('on');
    const isReg=t.dataset.atab==='reg';
    $('admin-reg').classList.toggle('hide',!isReg);
    $('admin-res').classList.toggle('hide',isReg);
  };
});

/* ===== 导出与导入 ===== */
function download(name,content,type){
  const blob=new Blob([content],{type:type||'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function csv(rows){ return rows.map(r=>r.map(v=>'"'+String(v==null?'':v).replace(/"/g,'""')+'"').join(',')).join('\r\n'); }
$('exp-person').onclick=async()=>{
  let res=[]; try{ res=await db.listResults(); }catch(e){}
  if(!res.length){ toast('暂无成绩记录'); return; }
  const rows=[['姓名','学号','系（部）','班级','得分','答对','答错','用时','提交时间']]
    .concat(res.map(r=>[r.name,r.sid,r.dept,r.class,r.score,r.right,r.wrong,fmtUsed(r.used),r.created_at]));
  download('学宪法讲宪法_个人成绩_'+nowStr().slice(0,10)+'.csv','\ufeff'+csv(rows),'text/csv;charset=utf-8');
};
$('exp-reg').onclick=async()=>{
  let regs=[]; try{ regs=await db.listRegs(); }catch(e){}
  if(!regs.length){ toast('暂无报名记录'); return; }
  const rows=[['姓名','学号','系（部）','班级','手机号','报名时间']]
    .concat(regs.map(r=>[r.name,r.sid,r.dept,r.class,r.phone,r.created_at]));
  download('学宪法讲宪法_报名名单_'+nowStr().slice(0,10)+'.csv','\ufeff'+csv(rows),'text/csv;charset=utf-8');
};
$('exp-json').onclick=async()=>{
  let regs=[],res=[];
  try{ regs=await db.listRegs(); res=await db.listResults(); }catch(e){}
  download('xfq_backup_'+nowStr().slice(0,10)+'.json',JSON.stringify({registrations:regs,results:res},null,2),'application/json');
};
$('imp-json').onclick=()=>{ if(REMOTE){ toast('云端模式请直接在 Supabase 中导入数据'); return; } $('imp-file').click(); };
$('imp-file').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  const fr=new FileReader();
  fr.onload=()=>{
    try{
      const data=JSON.parse(fr.result);
      const regs=Array.isArray(data.registrations)?data.registrations:[];
      const res=Array.isArray(data.results)?data.results:(Array.isArray(data)?data:[]);
      const curR=local(LS_REG), curS=local(LS_RES);
      const rk=new Set(curR.map(r=>r.sid));
      regs.forEach(r=>{ if(r&&r.sid&&!rk.has(r.sid)){ curR.push(r); rk.add(r.sid); } });
      const sk=new Set(curS.map(r=>r.sid+'|'+r.created_at));
      let add=0;
      res.forEach(r=>{ if(r&&r.sid&&!sk.has(r.sid+'|'+r.created_at)){ curS.push(r); sk.add(r.sid+'|'+r.created_at); add++; } });
      saveLocal(LS_REG,curR); saveLocal(LS_RES,curS);
      renderAdmin(); toast('导入完成，新增成绩 '+add+' 条');
    }catch(err){ modal('导入失败','文件格式不正确，请选择本平台备份的 JSON。'); }
    e.target.value='';
  };
  fr.readAsText(f);
};
$('clear-all').onclick=()=>{
  if(REMOTE){ toast('云端模式不支持在本机清空数据'); return; }
  modal('清空数据','将清空本机全部报名记录、成绩记录与未交卷进度，操作不可恢复。','确认清空',()=>{
    saveLocal(LS_REG,[]); saveLocal(LS_RES,[]); clearSession(); renderAdmin(); toast('本机数据已清空');
  });
};
