import { describe, expect, it } from 'vitest';
import { formatRentalDate, formatSaoPauloDateTime, saoPauloToday } from './dates';
describe('calendário e horários de São Paulo',()=>{
  it('mantém o mês e ano brasileiros quando o servidor UTC já virou o dia',()=>{
    expect(saoPauloToday(new Date('2027-01-01T01:30:00Z'))).toBe('2026-12-31');
    expect(saoPauloToday(new Date('2027-01-01T03:00:00Z'))).toBe('2027-01-01');
    expect(saoPauloToday(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10-31');
  });
  it('preserva a data sem horário escolhida para a pelada',()=>{
    expect(formatRentalDate({playedOn:'2026-10-31',createdAt:'2026-11-01T01:00:00Z'})).toBe('31/10/2026');
    expect(formatRentalDate({createdAt:'2026-11-01T01:00:00Z'})).toBe('31/10/2026');
  });
  it('converte horários UTC para São Paulo na exibição',()=>{
    expect(formatSaoPauloDateTime('2027-01-01T01:30:00Z')).toBe('31/12/2026 22:30');
  });
});
