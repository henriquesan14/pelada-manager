export function drawTeams(players,count,random=Math.random){
 if(!Number.isInteger(count)||count<2||players.length<count)throw new Error('Selecione pelo menos um jogador por time.');
 const sorted=players.map(p=>({...p,tie:random()})).sort((a,b)=>b.level-a.level||a.tie-b.tie);
 const teams=Array.from({length:count},(_,i)=>({name:`Time ${i+1}`,players:[],strength:0}));
 for(const p of sorted){const minSize=Math.min(...teams.map(t=>t.players.length));const candidates=teams.filter(t=>t.players.length===minSize).sort((a,b)=>a.strength-b.strength);const t=candidates[0];t.players.push(p.id);t.strength+=p.level;}
 return teams;
}
export function ranking(players,matches){return players.map(p=>{const r={...p,games:0,wins:0,draws:0,losses:0,points:0};for(const m of matches){const side=m.a.includes(p.id)?'a':m.b.includes(p.id)?'b':null;if(!side)continue;r.games++;const own=side==='a'?m.scoreA:m.scoreB;const other=side==='a'?m.scoreB:m.scoreA;if(own>other){r.wins++;r.points+=3;}else if(own===other){r.draws++;r.points++;}else r.losses++;}return r;}).sort((a,b)=>b.points-a.points||b.wins-a.wins||a.name.localeCompare(b.name,'pt-BR'));}
