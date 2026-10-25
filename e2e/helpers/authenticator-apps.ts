/** Synthetic interoperability fixture: execute installed applications, never a replacement TOTP library. */
import {spawnSync} from 'node:child_process'
import {mkdtempSync,writeFileSync,rmSync,chmodSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomBytes} from 'node:crypto'

export function openAuthenticatorApps(uri:string){
 const parsed=new URL(uri),secret=parsed.searchParams.get('secret')
 if(parsed.protocol!=='otpauth:'||parsed.hostname!=='totp'||parsed.searchParams.get('algorithm')!=='SHA256'||!secret)throw Error('SYNTHETIC_APP_URI_INVALID')
 const digits=parsed.searchParams.get('digits'),period=parsed.searchParams.get('period')
 if(!digits||!/^\d+$/.test(digits)||!period||!/^\d+$/.test(period))throw Error('SYNTHETIC_APP_PROFILE_INVALID')
 const dir=mkdtempSync(join(tmpdir(),'cleanops-authenticator-')),xml=join(dir,'fixture.xml'),db=join(dir,'fixture.kdbx'),password=randomBytes(32).toString('hex')
 const esc=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
 const run=(application:string,args:string[],input:string)=>{
  const r=spawnSync(application,args,{input,encoding:'utf8',timeout:20000,maxBuffer:16384,env:{...process.env,QT_QPA_PLATFORM:'offscreen',LC_ALL:'C'}})
  // Never include command output/arguments/input: they may contain synthetic secrets or codes.
  if(r.status!==0)throw Error(application==='keepassxc-cli'?'SYNTHETIC_KEEPASSXC_FAILED':'SYNTHETIC_OATHTOOL_FAILED')
  return r.stdout.trim()
 }
 const code=(value:string)=>{if(!new RegExp('^\\d{'+digits+'}$').test(value))throw Error('SYNTHETIC_APP_CODE_INVALID');return value}
 try{
  writeFileSync(xml,'<?xml version="1.0" encoding="UTF-8"?><KeePassFile><Meta><Generator>CleanOps synthetic interoperability fixture</Generator></Meta><Root><Group><UUID>'+randomBytes(16).toString('base64')+'</UUID><Name>Synthetic</Name><Entry><UUID>'+randomBytes(16).toString('base64')+'</UUID><String><Key>Title</Key><Value>CleanOps fixture</Value></String><String><Key>otp</Key><Value>'+esc(uri)+'</Value></String></Entry></Group></Root></KeePassFile>',{mode:0o600})
  run('keepassxc-cli',['import','--quiet','--set-password',xml,db],password+'\n'+password+'\n');chmodSync(db,0o600)
  // Plaintext XML exists only inside the owned0700 synthetic directory and is removed immediately.
  rmSync(xml,{force:true})
  return{
   keepassxc:()=>code(run('keepassxc-cli',['show','--quiet','--totp',db,'CleanOps fixture'],password+'\n')),
   oathtool:(timestamp?:number)=>code(run('oathtool',['--totp=SHA256','--base32','--digits='+digits,'--time-step-size='+period+'s',...(timestamp===undefined?[]:['--now='+new Date(timestamp).toISOString()]),'-'],secret+'\n')),
   close:()=>rmSync(dir,{recursive:true,force:true}),
  }
 }catch{rmSync(dir,{recursive:true,force:true});throw Error('SYNTHETIC_APP_IMPORT_FAILED')}
}
