import {execFile} from 'node:child_process';
import {readFile,rename,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {initializeAuth,signInWithEmailAndPassword,signOut,type Persistence} from 'firebase/auth';
import type {FirebaseApp} from 'firebase/app';

function dpapi(data:string,operation:'Protect'|'Unprotect'){
 if(process.platform!=='win32')throw Error('Windows利用者のDPAPIが必要です。');
 const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const code=`$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $src=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $out=[Security.Cryptography.ProtectedData]::${operation}($src,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($out))`;
 return new Promise<string>((resolve,reject)=>{
  const child=execFile(executable,['-NoProfile','-NonInteractive','-Command',code],{windowsHide:true},(error,stdout)=>{
   if(error)reject(Error('Windowsの同期資格情報を保護または復号できません。'));
   else resolve(stdout.trim());
  });
  child.stdin?.on('error',()=>{});
  child.stdin?.end(data);
 });
}

function encryptedPersistence(path:string){
 // initializeAuth accepts a persistence constructor, like browserLocalPersistence.
 return class {
  readonly type='LOCAL' as const;
  async _isAvailable(){return true;}
  async _set(_key:string,value:unknown){
   const encrypted=await dpapi(Buffer.from(JSON.stringify(value)).toString('base64'),'Protect');
   const staging=path+'.tmp';
   await writeFile(staging,encrypted);
   await rename(staging,path);
  }
  async _get(){
   let encrypted:string;
   try{encrypted=await readFile(path,'utf8');}
   catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error;}
   return JSON.parse(Buffer.from(await dpapi(encrypted,'Unprotect'),'base64').toString('utf8'));
  }
  async _remove(){await this._set('',null);}
  _addListener(){/* The Windows runner serializes access through a mutex. */}
  _removeListener(){/* No in-process subscription is needed for the local store. */}
 } as unknown as Persistence;
}

export async function openScheduleAuth(app:FirebaseApp,sessionPath:string,uid:string,connect:boolean){
 const auth=initializeAuth(app,{persistence:encryptedPersistence(sessionPath)});
 await auth.authStateReady();
 if(connect){
  const input:Buffer[]=[];
  for await(const chunk of process.stdin)input.push(Buffer.from(chunk));
  const credentials=JSON.parse(Buffer.concat(input).toString('utf8')) as {email:string;password:string};
  try{await signInWithEmailAndPassword(auth,credentials.email,credentials.password);}
  finally{credentials.password='';for(const chunk of input)chunk.fill(0);}
  if(auth.currentUser?.uid!==uid){await signOut(auth);throw Error('対象の家族アカウントと一致しません。');}
 }
 if(auth.currentUser?.uid!==uid)throw Error('Windows同期用に、既存の学習アプリアカウントで一度接続してください。');
 return {user:auth.currentUser,active:()=>auth.currentUser?.uid===uid};
}
