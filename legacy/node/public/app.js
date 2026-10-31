import {ranking} from './core.js';
let state={players:[],matches:[],teams:[]};
let page='inicio',selected=new Set(),revision=-1,user=null,busy=false,connected=false;
let sessionInfo=null,authMode='login',organizers=[],activity=[],invitation=null;
let invite=new URLSearchParams(location.hash.slice(1)).get('convite')||'';
let legacyBackup=null;
try{const old=JSON.parse(localStorage.getItem('resenha-v1'));if(old&&Array.isArray(old.players)&&Array.isArray(old.matches)&&(old.players.length||old.matches.length))legacyBackup=old;}catch{}
if(invite)window.history.replaceState(null,'',location.pathname);
const $=s=>document.querySelector(s),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=n=>esc(n.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase());
async function api(path,body){
 const response=await fetch(`/api/${path}`,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json','X-Resenha-Client':'1'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
 const data=await response.json();
 if(!response.ok){const error=new Error(data.error||'Não foi possível concluir.');error.status=response.status;throw error;}
 return data;
}
function syncStatus(){const status=$('#sync-status');if(status)status.textContent=connected?'Compartilhado · atualizado':'Sem conexão · alterações indisponíveis';}
function applySnapshot(snapshot){
 const before=new Set(state.players.map(p=>p.id));
 state=snapshot.state;revision=snapshot.revision;
 selected=new Set([...selected].filter(id=>state.players.some(p=>p.id===id)));
 state.players.forEach(p=>{if(!before.has(p.id))selected.add(p.id);});
 connected=true;syncStatus();
}
function clearSession(){user=null;revision=-1;state={players:[],matches:[],teams:[]};selected.clear();organizers=[];activity=[];invitation=null;connected=false;$('#player-dialog').close();}
function expired(){clearSession();authMode='login';render();toast('Sua sessão terminou. Entre novamente.');}
async function refresh(force=false){
 if(!user||busy)return;
 try{const snapshot=await api('state');connected=true;syncStatus();
  if(snapshot.revision!==revision&&(force||!document.activeElement?.matches('input,select')&&!$('#player-dialog').open)){applySnapshot(snapshot);render();}
 }catch(error){connected=false;syncStatus();if(error.status===401)expired();}
}
async function perform(input,message){
 if(busy)return false;
 busy=true;document.querySelectorAll('#content button,#content input,#content select,#player-form button,#player-form input,#player-form select').forEach(el=>el.disabled=true);
 try{applySnapshot(await api('actions',{...input,revision}));toast(message);return true;}
 catch(error){
  if(error.status===401)expired();
  else if(error.status===409){try{applySnapshot(await api('state'));}catch{connected=false;}}
  else if(!error.status){connected=false;toast('Conexão interrompida. Confira os dados antes de tentar novamente.');return false;}
  toast(error.message);return false;
 }finally{busy=false;document.querySelectorAll('#player-form button,#player-form input,#player-form select').forEach(el=>el.disabled=false);render();}
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),4000);}
const empty=(title,text)=>`<div class="empty"><div>⚽</div><h3>${title}</h3><p>${text}</p></div>`;
const heading=(eyebrow,title,subtitle,button='')=>`<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${subtitle}</p></div>${button}</div>`;
const addButton='<button class="primary" data-action="add">＋ Novo jogador</button>';
function rankTable(limit){const rows=ranking(state.players,state.matches).slice(0,limit);return rows.length?`<div class="table-scroll"><table><thead><tr><th>POS.</th><th>JOGADOR</th><th>J</th><th>V</th><th>E</th><th>D</th><th>PTS</th></tr></thead><tbody>${rows.map((p,i)=>`<tr><td><span class="position ${i===0?'first':''}">${i+1}</span></td><td><span class="player-avatar">${initials(p.name)}</span><strong>${esc(p.name)}</strong></td><td>${p.games}</td><td>${p.wins}</td><td>${p.draws}</td><td>${p.losses}</td><td><b class="points">${p.points}</b></td></tr>`).join('')}</tbody></table></div>`:empty('O topo está esperando por você','Cadastre os jogadores e registre a primeira partida.');}
function history(limit){return state.matches.length?`<div class="matches">${[...state.matches].reverse().slice(0,limit).map(m=>`<div class="match"><div><small>${new Date(m.date).toLocaleDateString('pt-BR')} · por ${esc(m.createdByName||'Organizador')}</small><span>${esc(m.nameA)} <b>${m.scoreA} <span class="muted">×</span> ${m.scoreB}</b> ${esc(m.nameB)}</span></div><button class="text-button danger" data-delete-match="${m.id}" aria-label="Excluir partida">Excluir</button></div>`).join('')}</div>`:empty('Ainda não rolou bola','Depois do jogo, registre o placar por aqui.');}
function renderAuth(){
 const register=authMode!=='login';
 const setup=authMode==='setup';
 $('#content').innerHTML=`<section class="auth-panel card"><div class="eyebrow">UMA PELADA. TODA A ORGANIZAÇÃO.</div><h1>${setup?'Crie sua pelada':register?'Entre para a resenha':'Bom te ver por aqui.'}</h1><p>${setup?'Crie a conta do responsável inicial. Depois, convide os outros organizadores.':register?'Use o convite que você recebeu e crie sua conta de organizador.':'Acesse sua conta para organizar os mesmos jogadores, times e resultados com a galera.'}</p>${!sessionInfo?'<p>Não foi possível conectar ao servidor.</p><button class="primary" data-action="retry">Tentar novamente</button>':setup&&!sessionInfo.setupEnabled?'<p class="auth-message">A configuração inicial ainda não foi habilitada. Preencha SETUP_TOKEN no servidor e reinicie o aplicativo, conforme o README.</p><button class="primary" data-action="retry">Verificar configuração</button>':`<form id="auth-form">${register?'<label>Seu nome<input name="name" required maxlength="50" autocomplete="name"></label>':''}<label>E-mail<input name="email" type="email" maxlength="254" required autocomplete="username"></label><label>Senha${register?' (mínimo de 12 caracteres)':''}<input name="password" type="password" ${register?'minlength="12"':''} maxlength="128" required autocomplete="${register?'new-password':'current-password'}"></label>${setup?'<label>Chave de configuração<input name="setupToken" type="password" required autocomplete="off"></label>':register?`<label>Código do convite<input name="invite" required value="${esc(invite)}" autocomplete="off"></label>`:''}<p id="auth-error" role="alert"></p><button class="primary" type="submit">${setup?'Criar pelada':register?'Criar minha conta':'Entrar'}</button></form>${!setup?`<button class="text-button" data-action="auth-toggle">${register?'Já tenho conta':'Recebi um convite'}</button>`:''}`}<p class="auth-note">Cada organizador usa sua conta. Os dados são compartilhados com a mesma pelada.</p></section>`;
}
function render(){
 document.body.classList.toggle('signed-out',!user);
 $('#logout').hidden=!user;
 $('.avatar').textContent=user?user.name.trim().slice(0,1).toUpperCase():'R';
 $('.avatar').title=user?.name||'Resenha';
 if(!user){renderAuth();return;}
 syncStatus();document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));let html='';
if(page==='inicio')html=heading('PAINEL DA PELADA','A resenha começa aqui<span class="green">.</span>','Menos organização no grupo. Mais bola no pé.',addButton)+`<section class="hero"><div><span class="hero-tag"><span class="live-dot"></span> TODO MUNDO TEM VEZ</span><h2>Times equilibrados.<br>Resenha garantida.</h2><p>Escolha quem vai jogar e deixe o sorteio com a gente.</p><button class="primary" data-go="sorteio">⇄ Sortear times <span>↗</span></button></div><div class="pitch" aria-hidden="true"><div class="half"></div><span class="player-dot p1">7</span><span class="player-dot p2">10</span><span class="player-dot p3">9</span><span class="player-dot p4">11</span><span class="player-dot p5">5</span><span class="player-dot p6">8</span></div></section><div class="stats"><article><span class="stat-icon">♙</span><small>Jogadores cadastrados</small><strong>${state.players.length}<span>na resenha</span></strong></article><article><span class="stat-icon purple">⚑</span><small>Partidas disputadas</small><strong>${state.matches.length}<span>jogos registrados</span></strong></article><article><span class="stat-icon orange">♜</span><small>Líder do ranking</small><strong class="leader">${esc(state.matches.length?ranking(state.players,state.matches)[0]?.name||'—':'—')}<span>${state.matches.length?'Quem joga, pontua':'A disputa vai começar'}</span></strong></article></div><div class="dashboard-grid"><section class="card"><div class="section-heading"><div><h2>Ranking da galera</h2><p>Cada vitória conta.</p></div><button class="text-button" data-go="ranking">Ver ranking ↗</button></div>${rankTable(5)}</section><section class="card"><div class="section-heading"><div><h2>Últimas partidas</h2><p>A história dentro de campo.</p></div><button class="text-button" data-go="partidas">Ver todas ↗</button></div>${history(3)}</section></div><div class="backup"><span>Dados compartilhados entre organizadores. Exporte uma cópia dos jogadores e resultados.</span><button class="text-button" data-action="export">↓ Exportar dados</button></div>`;
if(page==='jogadores')html=heading('ELENCO','A galera da pelada','Cadastre os jogadores e defina o nível para equilibrar os times.',addButton)+`<section class="card">${state.players.length?`<div class="player-grid">${state.players.map(p=>`<article class="player-card"><span class="player-avatar">${initials(p.name)}</span><h3>${esc(p.name)}</h3><span class="stars">${'★'.repeat(p.level)}<span class="muted">${'☆'.repeat(5-p.level)}</span></span><label>Nível<select data-level="${p.id}">${[1,2,3,4,5].map(n=>`<option ${n===p.level?'selected':''}>${n}</option>`).join('')}</select></label><button class="text-button danger" data-delete-player="${p.id}">Excluir jogador</button></article>`).join('')}</div>`:empty('Monte seu elenco','Use “Novo jogador” para começar a cadastrar a galera.')}</section>`;
if(page==='sorteio')html=heading('PRÉ-JOGO','Deixa que a gente sorteia','Selecione os presentes. O nível de cada jogador ajuda a equilibrar os times.')+`<div class="draw-layout"><section class="card"><div class="section-heading"><h2>Quem vai jogar?</h2><span class="badge">${selected.size} selecionados</span></div>${state.players.length?`<div class="selection">${state.players.map(p=>`<label class="select-player"><input type="checkbox" data-select="${p.id}" ${selected.has(p.id)?'checked':''}><span class="player-avatar">${initials(p.name)}</span><strong>${esc(p.name)}</strong><span class="stars">${'★'.repeat(p.level)}</span></label>`).join('')}</div>`:empty('Faltou convocar a galera','Cadastre os jogadores antes de sortear.')}<div class="draw-controls"><label>Quantidade de times<select id="team-count">${[2,3,4,5,6].map(n=>`<option value="${n}">${n} times</option>`).join('')}</select></label><button class="primary" data-action="draw">⇄ Sortear agora</button></div></section><section><div class="section-heading"><h2>Times em campo</h2></div>${state.teams.length?`<div class="teams">${state.teams.map((t,i)=>`<article class="card team team-${i%3}"><h3><span class="live-dot"></span> ${esc(t.name)}</h3><p>${t.players.length} jogadores · força ${t.strength}</p>${t.players.map(id=>`<div class="team-player">${esc(state.players.find(p=>p.id===id)?.name||'Jogador removido')}</div>`).join('')}</article>`).join('')}</div><button class="primary wide" data-go="partidas">Registrar resultado →</button>`:empty('O próximo clássico começa aqui','Os times sorteados vão aparecer neste espaço.')}</section></div>`;
if(page==='ranking')html=heading('A DISPUTA ESTÁ ON','Ranking da pelada','Vitória vale 3 pontos. Empate vale 1. Desempate por vitórias e nome.')+`<section class="card">${rankTable()}</section>`;
if(page==='partidas')html=heading('PÓS-JOGO','O placar vira história','Registre os resultados dos times sorteados para atualizar o ranking.')+`<section class="card"><h2>Registrar partida</h2>${state.teams.length>=2?`<form id="match-form" class="score-form"><label>Time<select name="a">${state.teams.map((t,i)=>`<option value="${i}">${esc(t.name)}</option>`).join('')}</select></label><label>Gols<input name="scoreA" type="number" min="0" max="999" value="0" required></label><span>×</span><label>Gols<input name="scoreB" type="number" min="0" max="999" value="0" required></label><label>Adversário<select name="b">${state.teams.map((t,i)=>`<option value="${i}" ${i===1?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><button class="primary" type="submit">Salvar resultado</button></form>`:empty('Primeiro, forme os times','Vá até “Sortear times” para preparar a partida.')}</section><section class="card history-card"><div class="section-heading"><h2>Histórico de partidas</h2><span class="badge">${state.matches.length} jogos</span></div>${history()}</section>`;
if(page==='organizadores')html=heading('QUEM ORGANIZA','A resenha é em equipe','Todos os organizadores podem cadastrar jogadores, sortear times e lançar resultados.',user.role==='owner'?'<button class="primary" data-action="invite">＋ Convidar organizador</button>':'')+`${invitation?`<section class="card invite-card"><h2>Convite criado</h2><p>Uso único, válido por 24 horas. Compartilhe com um organizador de confiança.</p><label>Link do convite<input id="invite-link" readonly value="${esc(location.origin+'/#convite='+invitation.invite)}"></label><button class="text-button" data-action="copy-invite">Copiar link</button></section>`:''}<section class="card"><div class="organizer-list">${organizers.map(o=>`<article class="organizer"><span class="player-avatar">${initials(o.name)}</span><div><strong>${esc(o.name)}</strong><p>${esc(o.email)} · ${o.role==='owner'?'Responsável':o.active?'Organizador':'Acesso removido'}</p></div>${user.role==='owner'&&o.active&&o.id!==user.id?`<button class="text-button danger" data-revoke="${o.id}">Remover acesso</button>`:''}</article>`).join('')||'<p>Carregando organizadores…</p>'}</div></section><section class="card history-card"><h2>Atividade recente</h2><div class="activity">${activity.map(a=>`<article><strong>${esc(a.name)}</strong> · ${esc(a.action)}<small>${new Date(a.date).toLocaleString('pt-BR')}</small></article>`).join('')||'<p>Sem atividades para mostrar.</p>'}</div></section>`;
if(page==='inicio'&&legacyBackup)html+=`<section class="card history-card"><h2>Dados da versão anterior</h2><p>Este navegador tem jogadores ou partidas locais. Você pode guardar uma cópia${user.role==='owner'&&!state.players.length&&!state.matches.length?' ou importar para a pelada compartilhada':''}.</p><button class="text-button" data-action="export-legacy">Exportar dados anteriores</button>${user.role==='owner'&&!state.players.length&&!state.matches.length?'<button class="primary" data-action="import-legacy">Importar para esta pelada</button>':''}</section>`;
$('#content').innerHTML=html;
}
async function loadOrganizers(){
 try{const data=await api('organizers');organizers=data.organizers;activity=data.activity;if(page==='organizadores')render();}
 catch(error){if(error.status===401)expired();else toast(error.message||'Não foi possível carregar os organizadores.');}
}
function go(target){if(busy)return;page=target;render();window.scrollTo(0,0);if(page==='organizadores')loadOrganizers();}
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b||busy)return;
 if(b.dataset.page||b.dataset.go)return go(b.dataset.page||b.dataset.go);
 const action=b.dataset.action;
 if(action==='retry')return bootstrap();
 if(action==='auth-toggle'){authMode=authMode==='login'?'register':'login';render();return;}
 if(action==='add'){$('#player-dialog').showModal();$('#player-form input').focus();}
 if(b.id==='close-dialog')$('#player-dialog').close();
 if(action==='draw')await perform({type:'draw',players:[...selected],count:Number($('#team-count').value)},'Times sorteados e compartilhados!');
 if(action==='import-legacy'&&legacyBackup&&confirm('Compartilhar os jogadores e resultados deste navegador com todos os organizadores desta pelada?'))await perform({type:'importLegacy',data:legacyBackup},'Dados anteriores importados!');
 if(b.dataset.deletePlayer&&confirm('Excluir este jogador? O histórico de outros jogadores será mantido.'))await perform({type:'removePlayer',id:b.dataset.deletePlayer},'Jogador excluído.');
 if(b.dataset.deleteMatch&&confirm('Excluir esta partida e retirar os pontos do ranking?'))await perform({type:'removeMatch',id:b.dataset.deleteMatch},'Partida excluída. Ranking atualizado.');
 if(action==='export'||action==='export-legacy'){
  const url=URL.createObjectURL(new Blob([JSON.stringify(action==='export'?state:legacyBackup,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=action==='export'?'resenha-backup.json':'resenha-versao-local.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 if(action==='invite'){
  b.disabled=true;
  try{invitation=await api('invites',{});await loadOrganizers();}
  catch(error){if(error.status===401)expired();else toast(error.message||'Não foi possível criar o convite.');}
  finally{b.disabled=false;}
 }
 if(action==='copy-invite'){
  const input=$('#invite-link');input.select();
  try{await navigator.clipboard.writeText(input.value);toast('Link copiado!');}catch{toast('Selecione e copie o link do convite.');}
 }
 if(b.dataset.revoke&&confirm('Remover o acesso deste organizador? Ele será desconectado e não poderá mais alterar a pelada.')){
  try{await api('revoke',{id:b.dataset.revoke});await loadOrganizers();toast('Acesso removido.');}
  catch(error){if(error.status===401)expired();else toast(error.message||'Não foi possível remover o acesso.');}
 }
 if(b.id==='logout'){
  try{await api('logout',{});clearSession();page='inicio';authMode='login';render();}
  catch{toast('Conecte-se ao servidor para encerrar a sessão.');}
 }
});
document.addEventListener('change',async e=>{
 if(e.target.dataset.select){e.target.checked?selected.add(e.target.dataset.select):selected.delete(e.target.dataset.select);const count=$('.badge');if(count)count.textContent=`${selected.size} selecionados`;}
 if(e.target.dataset.level)await perform({type:'updateLevel',id:e.target.dataset.level,level:Number(e.target.value)},'Nível atualizado.');
});
$('#player-form').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.target,f=new FormData(form);
 if(await perform({type:'addPlayer',name:f.get('name').trim(),level:Number(f.get('level'))},'Jogador convocado!')){form.reset();$('#player-dialog').close();}
});
document.addEventListener('submit',async e=>{
 if(e.target.id==='match-form'){
  e.preventDefault();const f=new FormData(e.target);
  const a=state.teams[Number(f.get('a'))],b=state.teams[Number(f.get('b'))];
  await perform({type:'addMatch',a:a?.id,b:b?.id,scoreA:Number(f.get('scoreA')),scoreB:Number(f.get('scoreB'))},'Placar salvo para toda a organização!');
 }
 if(e.target.id==='auth-form'){
  e.preventDefault();const form=e.target,input=Object.fromEntries(new FormData(form));const button=form.querySelector('button');button.disabled=true;$('#auth-error').textContent='';
  try{
   const data=await api(authMode==='login'?'login':'register',input);user=data.user;invite='';
   try{applySnapshot(await api('state'));render();}catch{clearSession();render();toast('Conta autenticada. Entre novamente quando a conexão voltar.');}
  }catch(error){if($('#auth-error'))$('#auth-error').textContent=error.status?error.message:'Não foi possível conectar ao servidor.';}
  finally{button.disabled=false;}
 }
});
let installPrompt;window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false;});$('#install').onclick=async()=>{await installPrompt?.prompt();$('#install').hidden=true;};
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
async function bootstrap(){
 try{sessionInfo=await api('session');user=sessionInfo.user;authMode=sessionInfo.needsSetup?'setup':invite?'register':'login';
  if(user){applySnapshot(await api('state'));if(invite)toast('Você já está conectado. Saia para usar o convite com outra conta.');}
 }catch{sessionInfo=null;clearSession();}
 render();
}
window.addEventListener('online',()=>refresh(true));
window.addEventListener('offline',()=>{connected=false;syncStatus();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(!document.hidden)refresh();},5000);
bootstrap();
