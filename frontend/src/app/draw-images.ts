import { DrawOption, Player } from './models';

export interface DrawImage {number:number;file:File;url:string;}
function wrapName(context:CanvasRenderingContext2D,text:string,width:number):string[] {
  const lines:string[]=[];let line='';
  for(const character of text){if(line&&context.measureText(line+character).width>width){lines.push(line);line=character;}else line+=character;}
  lines.push(line);return lines;
}
export async function createDrawImages(options:DrawOption[],players:Player[]):Promise<DrawImage[]> {
  const names=new Map(players.map(player=>[player.id,player.name]));
  let logo:HTMLImageElement|null=null;
  try {logo=new Image();logo.src='/caps-fc-logo.png';await logo.decode();}catch{logo=null;}
  const images:DrawImage[]=[];
  try {for(const option of options){
    const canvas=document.createElement('canvas');canvas.width=1080;
    const context=canvas.getContext('2d');if(!context)throw new Error('Canvas indisponível');
    context.font='24px Arial';
    const teams=option.teams.map(team=>({team,lines:team.players.map(id=>wrapName(context,names.get(id)||'Jogador removido',422))}));
    const rowHeights:number[]=[];
    for(let i=0;i<teams.length;i+=2)rowHeights.push(Math.max(...teams.slice(i,i+2).map(item=>100+item.lines.reduce((sum,lines)=>sum+lines.length*32+16,0))));
    canvas.height=240+rowHeights.reduce((sum,height)=>sum+height+24,0)+80;
    context.fillStyle='#f3f5f9';context.fillRect(0,0,1080,canvas.height);
    context.fillStyle='#071b35';context.fillRect(0,0,1080,200);
    context.fillStyle='#f2b72d';context.fillRect(0,200,1080,8);
    if(logo)context.drawImage(logo,48,24,126,145);
    const headingX=logo?202:48;
    context.fillStyle='#ffffff';context.font='bold 46px Arial';context.fillText('CAPS FC',headingX,82);
    context.fillStyle='#f2b72d';context.font='bold 34px Arial';context.fillText(`SORTEIO ${option.number}`,headingX,140);
    const colors=['#173b70','#966500','#615094','#25666a'];let y=240;
    for(let i=0;i<teams.length;i+=2){
      for(let j=i;j<Math.min(i+2,teams.length);j++){
        const item=teams[j];const x=48+(j%2)*504;
        context.fillStyle='#ffffff';context.fillRect(x,y,480,rowHeights[i/2]);
        context.fillStyle=colors[j%colors.length];context.fillRect(x,y,480,64);
        context.fillStyle='#ffffff';context.font='bold 28px Arial';context.fillText(item.team.name,x+24,y+42,432);
        let lineY=y+104;context.font='24px Arial';context.fillStyle='#172b47';
        for(const lines of item.lines){for(const line of lines){context.fillText(line,x+24,lineY);lineY+=32;}lineY+=16;}
      }
      y+=rowHeights[i/2]+24;
    }
    context.fillStyle='#66768b';context.font='22px Arial';context.fillText('Vote no grupo: Sorteio 1, Sorteio 2 ou Sorteio 3.',48,y+32);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Falha ao gerar imagem')),'image/png'));
    const file=new File([blob],`caps-fc-sorteio-${option.number}.png`,{type:'image/png'});
    images.push({number:option.number,file,url:URL.createObjectURL(file)});
  }return images;}catch(error){for(const image of images)URL.revokeObjectURL(image.url);throw error;}
}
