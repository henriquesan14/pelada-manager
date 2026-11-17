import { RankingRow, Rental } from './models';

function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/\p{Diacritic}|\p{Cf}/gu, '').trim().toLocaleLowerCase('pt-BR')
    .replace(/\s*\(gl\)$/i, '').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
}

const historicalNames: Readonly<Record<string, string>> = {
  aldanemia: 'aldemir',
  artur: 'arthur',
  cabeca: 'italo',
  cesar: 'cesar chapa',
  'cesar maconha': 'cesar chapa',
  cesarhonda: 'cesar honda',
  'dan psicopata': 'dan',
  'diogo a volta da lenda': 'diogo',
  edson: 'negao',
  'eduardo dias': 'eduardo',
  everton: 'everton kaio',
  ganso: 'junior',
  jr: 'junior',
  henrique: 'henrique san',
  san: 'henrique san',
  rico: 'henrique san',
  'lucas 9d': 'lucas',
  'lucas nine': 'lucas',
  mateu: 'mateus pereira',
  mateus: 'mateus pereira',
  'mateus p': 'mateus pereira',
  'dinizismo voltou': 'mateus neneca',
  neneca: 'mateus neneca',
  'matheus rei delas': 'mateus neneca',
  'matheus r': 'matheus romao',
  'meteus vet': 'matheus vet',
  matheus: 'matheus vet',
  nadinho: 'ednaldo',
  net: 'neto',
  pedro: 'pedro lukaku',
  'pedro henrique': 'pedro lukaku',
  tarcinho: 'tarcio',
  tarcin: 'tarcio',
  'tarcio gl': 'tarcio',
  vetto: 'veto',
  viga: 'everton viga',
  wm: 'waguinho'
};

function historicalName(value: string): string {
  const name = normalizeName(value);
  return Object.hasOwn(historicalNames, name) ? historicalNames[name] : name;
}

const additionalPresences = new Map([
  ['d2a2c36b-ba6b-439f-aee6-9de3c618b872', 1] // Isaac
]);

export function playerStatistics(players: RankingRow[], rentals: Rental[]) {
    const finished = rentals.filter(rental => rental.finishedAt && !rental.cancelledAt);
    const historical = finished.filter(rental => rental.isHistorical).map(rental =>
      new Set((rental.participantsText ?? '').split(/\r?\n/).map(line =>
        historicalName(line.replace(/^(?:[\s\u2060]*\d+[.\-º):]?\s*)+/, '')))));
    const recorded = finished.filter(rental => !rental.isHistorical && !rental.isManual && rental.teams.length);
    return players.map(player => {
    const name = historicalName(player.name);
    const oldPresences = historical.filter(names => names.has(name)).length;
    const appearances = recorded.filter(rental => rental.winningGoalkeeperId === player.id ||
      rental.teams.some(team => team.players.includes(player.id)));
    return {name: player.name, presences: oldPresences + appearances.length + (additionalPresences.get(player.id) ?? 0), wins: player.titles};
    });
}
