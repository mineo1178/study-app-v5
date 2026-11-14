import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {existsSync,readdirSync,openSync,closeSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {homedir,tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createConnection} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),port=8085;
const cache=join(homedir(),'.cache/firebase/emulators'),jar=process.env.FIRESTORE_EMULATOR_JAR||(existsSync(cache)&&readdirSync(cache).filter(n=>/^cloud-firestore-emulator-v.*\.jar$/.test(n)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}))[0]);
if(!jar)throw Error('Existing Firestore emulator JAR required');
const listening=()=>new Promise(resolve=>{const s=createConnection({host:'127.0.0.1',port});s.setTimeout(500);s.once('connect',()=>{s.destroy();resolve(true);});s.once('error',()=>resolve(false));s.once('timeout',()=>{s.destroy();resolve(false);});});
if(await listening())throw Error('Port 8085 already in use; existing service is preserved');
const logPath=join(tmpdir(),'material-binding-emulator-'+Date.now()+'.log'),log=openSync(logPath,'w');
const server=spawn('java',['-Duser.language=en','-Duser.country=US','-jar',existsSync(jar)?jar:join(cache,jar),'--host','127.0.0.1','--port',String(port),'--project_id','demo-study-v182','--single_project_mode','true','--rules',join(root,'firestore.rules')],{cwd:root,windowsHide:true,stdio:['ignore',log,log]});
let failure;server.on('error',e=>{failure=e;});
try{
 let ready=false;for(let i=0;i<120;i++){if(failure)throw failure;if(server.exitCode!==null)throw Error('Emulator startup failed: '+logPath);if(await listening()){ready=true;break;}await delay(250);}if(!ready)throw Error('Emulator timeout: '+logPath);
 const test=spawn(process.execPath,[join(dirname(require.resolve('vitest/package.json')),'vitest.mjs'),'run','--config','tests/vitest-material-binding.config.ts'],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,FIRESTORE_EMULATOR_HOST:`127.0.0.1:${port}`}});
 process.exitCode=await new Promise((resolve,reject)=>{test.once('error',reject);test.once('exit',code=>resolve(code??1));});if(process.exitCode)console.error(logPath);
}finally{server.kill();closeSync(log);}
