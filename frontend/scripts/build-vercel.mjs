import { cp, mkdir, writeFile } from 'node:fs/promises';

// Build Output API keeps the Railway destination in deployment configuration,
// while the browser continues to call /api on the frontend origin.
const value=process.env.RAILWAY_API_URL;
if(!value)throw new Error('Configure RAILWAY_API_URL com a URL HTTPS pública da API no Railway.');
let api;
try {api=new URL(value);}catch {throw new Error('RAILWAY_API_URL deve ser uma URL HTTPS válida.');}
if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash||!['','/'].includes(api.pathname))
  throw new Error('RAILWAY_API_URL deve conter somente a origem HTTPS, sem /api, credenciais ou parâmetros.');
const origin=api.origin;
const output=new URL('../.vercel/output/',import.meta.url);
const staticDir=new URL('static/',output);
await mkdir(staticDir,{recursive:true});
await cp(new URL('../dist/resenha/browser/',import.meta.url),staticDir,{recursive:true,force:true});
const security={
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' blob:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};
const config={version:3,routes:[
  {src:'/(.*)',headers:security,continue:true},
  {src:'/api(?:/(.*))?$',dest:`${origin}/api/$1`,headers:{'Cache-Control':'no-store'}},
  {src:'/(?:index\\.html|ngsw\\.json|ngsw-worker\\.js|manifest\\.webmanifest)$',headers:{'Cache-Control':'no-cache'},continue:true},
  {handle:'filesystem'},
  {src:'/(.*)',dest:'/index.html',headers:{'Cache-Control':'no-cache'}}
]};
await writeFile(new URL('config.json',output),JSON.stringify(config,null,2)+'\n');
console.log('Build Vercel preparado com proxy /api e rotas Angular.');
