import {test} from 'node:test';
import assert from 'node:assert/strict';
import {drawTeams,ranking} from '../public/core.js';
test('sorteio distribui todos sem repetir e mantém tamanhos próximos',()=>{const players=Array.from({length:13},(_,i)=>({id:String(i),level:i%5+1}));const teams=drawTeams(players,3);assert.equal(new Set(teams.flatMap(t=>t.players)).size,13);assert.equal(teams.flatMap(t=>t.players).length,13);assert.ok(Math.max(...teams.map(t=>t.players.length))-Math.min(...teams.map(t=>t.players.length))<=1);});
test('ranking soma vitórias, empates e derrotas para os jogadores certos',()=>{const players=[{id:'a',name:'Ana'},{id:'b',name:'Beto'},{id:'c',name:'Caio'}];const matches=[{a:['a'],b:['b'],scoreA:2,scoreB:1},{a:['a'],b:['b'],scoreA:0,scoreB:0}];const rows=ranking(players,matches);assert.deepEqual(rows.map(p=>[p.id,p.points,p.games,p.wins,p.draws,p.losses]),[['a',4,2,1,1,0],['b',1,2,0,1,1],['c',0,0,0,0,0]]);assert.equal(ranking(players,matches.slice(1))[0].points,1);});
test('não permite sorteio sem jogadores suficientes',()=>assert.throws(()=>drawTeams([{id:'a',level:3}],2)));
