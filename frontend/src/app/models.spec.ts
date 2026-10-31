import { describe, expect, it } from 'vitest';
import { Player, ranking, Rental } from './models';

const players:Player[]=[{id:'p1',name:'Ana',level:3},{id:'p2',name:'Beto',level:3},{id:'p3',name:'Caio',level:3}];
const rental:Rental={id:'r1',name:'Sábado',createdAt:'2026-10-30T12:00:00Z',teams:[
  {id:'a',name:'A',players:['p1'],strength:3},{id:'b',name:'B',players:['p2'],strength:3},{id:'c',name:'C',players:['p3'],strength:3}
]};
describe('ranking geral por títulos de aluguel',()=>{
  const finished:Rental={...rental,finishedAt:'2026-10-30T14:00:00Z',winnerTeamId:'a'};
  it('conta um aluguel conquistado por jogador do time vencedor',()=>{
    const multiple:Rental={...finished,teams:[{...finished.teams[0],players:['p1','p2']},finished.teams[2]]};
    expect(ranking(players,[multiple]).map(p=>[p.id,p.points,p.titles,p.rentals])).toEqual([['p1',1,1,1],['p2',1,1,1],['p3',0,0,1]]);
  });
  it('não pontua antes do encerramento nem em empate no topo',()=>{
    expect(ranking(players,[rental,{...finished,winnerTeamId:null}]).every(p=>p.points===0)).toBe(true);
  });
  it('acumula a quantidade de aluguéis conquistados',()=>{
    expect(ranking(players,[finished,{...finished,id:'r2'}])[0].points).toBe(2);
    expect(ranking(players,[finished,{...finished,id:'r2'}])[0].rentals).toBe(2);
  });
  it('reabrir um aluguel retira seus pontos até encerrar novamente',()=>{
    expect(ranking(players,[{...finished,finishedAt:null,winnerTeamId:null}])[0].points).toBe(0);
    expect(ranking(players,[finished])[0].points).toBe(1);
  });
  it('não conta peladas canceladas como participação, título ou pontos',()=>{
    expect(ranking(players,[{...finished,cancelledAt:finished.finishedAt}]).every(p=>p.points===0&&p.titles===0&&p.rentals===0)).toBe(true);
  });
  it('ordena nomes apenas para exibição quando jogadores empatam',()=>{
    expect(ranking([...players].reverse(),[]).map(p=>p.name)).toEqual(['Ana','Beto','Caio']);
  });
  it('soma saldo inicial e novas conquistas sem contar registros históricos novamente',()=>{
    const initial={...players[0],initialRentals:20};
    const imported={...finished,isHistorical:true};
    expect(ranking([initial],[imported])[0].titles).toBe(20);
    expect(ranking([initial],[imported,finished])[0].titles).toBe(21);
    expect(ranking([initial],[imported])[0].rentals).toBe(0);
  });
  it('conta um aluguel para o goleiro vencedor sem duplicar se já estiver no time',()=>{
    const keeper={id:'g',name:'TARCIO (GL)',level:5};
    const result={...finished,winningGoalkeeperId:'g'};
    expect(ranking([...players,keeper],[result]).find(p=>p.id==='g')?.titles).toBe(1);
    expect(ranking([...players,keeper],[{...result,teams:[{...result.teams[0],players:['p1','g']}]}]).find(p=>p.id==='g')?.titles).toBe(1);
    expect(ranking([...players,keeper],[{...result,winnerTeamId:null}]).find(p=>p.id==='g')?.titles).toBe(0);
    expect(ranking([...players,keeper],[{...result,finishedAt:null}]).find(p=>p.id==='g')?.titles).toBe(0);
  });
});
