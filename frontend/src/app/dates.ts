const TIME_ZONE='America/Sao_Paulo';
const calendarFormatter=new Intl.DateTimeFormat('en-US',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const dateFormatter=new Intl.DateTimeFormat('pt-BR',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormatter=new Intl.DateTimeFormat('pt-BR',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export function saoPauloToday(now=new Date()):string {
  const parts=calendarFormatter.formatToParts(now);
  const part=(type:string)=>parts.find(item=>item.type===type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function formatCalendarDate(value:string):string {return value.split('-').reverse().join('/');}
export function formatRentalDate(rental:{playedOn?:string|null;createdAt:string}):string {
  return rental.playedOn ? formatCalendarDate(rental.playedOn) : dateFormatter.format(new Date(rental.createdAt));
}
export function formatSaoPauloDateTime(value:string):string {return timeFormatter.format(new Date(value)).replace(',','');}
