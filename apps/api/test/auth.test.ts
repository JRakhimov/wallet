import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { readConfig } from '../src/config';
import { verifyTelegram, isLocalRequest } from '../src/auth';

const local={ NODE_ENV:'development', AUTH_MODE:'dev', HOST:'127.0.0.1', APP_ORIGIN:'http://localhost:5173', DATABASE_URL:'postgresql://wallet:password@localhost:54329/wallet' };
function signedInitData(userId:number,token:string,time:number){
  const params=new URLSearchParams({auth_date:String(time),user:JSON.stringify({id:userId,first_name:'Owner'})});
  const data=[...params.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+'='+v).join('\n');
  const secret=createHmac('sha256','WebAppData').update(token).digest();
  params.set('hash',createHmac('sha256',secret).update(data).digest('hex'));
  return params.toString();
}
test('dev access is restricted to local development and local database',()=>{
  assert.equal(readConfig(local).dev,true);
  assert.throws(()=>readConfig({...local,NODE_ENV:'production'}),/Dev auth requires/);
  assert.throws(()=>readConfig({...local,HOST:'0.0.0.0'}),/Dev auth requires/);
  assert.throws(()=>readConfig({...local,DATABASE_URL:'postgresql://user:pass@remote.example:5432/wallet'}),/Dev auth requires/);
  assert.throws(()=>readConfig({...local,APP_ORIGIN:'https://example.com'}),/Dev auth requires/);
  const req=(address:string,host:string,origin='http://localhost:5173',forwarded?:string)=>({socket:{remoteAddress:address},headers:{host,origin,...(forwarded?{'x-forwarded-for':forwarded}:{})}}) as Parameters<typeof isLocalRequest>[0];
  assert.equal(isLocalRequest(req('127.0.0.1','localhost:3001'),local.APP_ORIGIN),true);
  assert.equal(isLocalRequest(req('192.168.1.20','localhost:3001'),local.APP_ORIGIN),false);
  assert.equal(isLocalRequest(req('127.0.0.1','evil.example'),local.APP_ORIGIN),false);
  assert.equal(isLocalRequest(req('127.0.0.1','localhost:3001',local.APP_ORIGIN,'8.8.8.8'),local.APP_ORIGIN),false);
  const production={...local,NODE_ENV:'production',AUTH_MODE:'telegram',APP_ORIGIN:'https://wallet.example',BOT_TOKEN:'123:token',OWNER_TELEGRAM_ID:'123'};
  assert.equal(readConfig(production).dev,false);
  assert.throws(()=>readConfig({...production,MINI_APP_URL:'http://wallet.example'}),/HTTPS MINI_APP_URL/);
});
test('Telegram signature, owner ID and freshness are all required',()=>{
  const now=Date.now(),token='123456:secret';
  const valid=signedInitData(123456,token,Math.floor(now/1000));
  assert.equal(verifyTelegram(valid,token,123456n,now).id,123456);
  assert.throws(()=>verifyTelegram(valid,token,99n,now));
  assert.throws(()=>verifyTelegram(valid,'wrong-token',123456n,now));
  assert.throws(()=>verifyTelegram(signedInitData(123456,token,Math.floor(now/1000)-400),token,123456n,now));
  assert.throws(()=>verifyTelegram(valid.replace('123456','123457'),token,123456n,now));
  assert.throws(()=>verifyTelegram(valid+'&user=%7B%22id%22%3A123456%7D',token,123456n,now));
});
