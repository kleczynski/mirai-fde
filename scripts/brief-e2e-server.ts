import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';
import { localIntegration } from '../services/brief-studio/tests/local-integration.js';
import { handleRequest } from '../services/brief-studio/src/http.js';
import { adminBriefRuns } from '../server/brief-studio.js';
const app = await localIntegration();
Object.assign(process.env,app.env,{BRIEF_STUDIO_URL:'http://127.0.0.1:8788'});
const worker = createHttpServer(async(req,res)=>{
 try {
  let body='';for await(const part of req) {body+=part;if(body.length>4096) throw new Error('body_too_large');}
  const result=await handleRequest(new Request(`http://127.0.0.1:8788${req.url}`,{method:req.method,headers:req.headers as Record<string,string>,...(body?{body}:{})}),app.env);
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
 } catch {res.writeHead(500);res.end('{}');}
});
await new Promise<void>(resolve=>worker.listen(8788,'127.0.0.1',resolve));
const vite=await createViteServer({server:{port:5174,host:'127.0.0.1',strictPort:true,proxy:{}},plugins:[{
 name:'local-brief-fixture',configureServer(server){
  server.middlewares.use('/fixture-config',(_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({sessionId:app.source.id,token:app.admin.token}));});
  server.middlewares.use('/api/admin/brief-runs',async(req,res)=>{
   try {let body='';for await(const part of req) body+=part;
    const data=await adminBriefRuns({body:JSON.parse(body),authorization:req.headers.authorization});
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));
   } catch(error) {res.statusCode=(error as {status?:number}).status??500;res.end(JSON.stringify({error:error instanceof Error?error.message:'failed'}));}
  });
 },
}]});
await vite.listen();console.log('Local Brief Studio fixture ready on 127.0.0.1:5174');
async function stop(){await vite.close();worker.close();await app.cleanup();process.exit(0);}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
