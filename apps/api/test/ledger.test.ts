import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PrismaClient } from '@prisma/client';
import { WalletService } from '../src/wallet.service';

test('a real PostgreSQL ledger keeps transfers, refunds and retries consistent', {skip:process.env.RUN_DB_TESTS!=='1'}, async()=>{
  const db=new PrismaClient();
  await db.$connect();
  const owner=await db.owner.create({data:{telegramId:BigInt(Date.now())}});
  const service=new WalletService(db as never);
  try{
    const cash=await db.account.create({data:{ownerId:owner.id,name:'Cash'}});
    const card=await db.account.create({data:{ownerId:owner.id,name:'Card'}});
    const category=await db.category.create({data:{ownerId:owner.id,name:'Food',kind:'expense'}});
    const when=new Date().toISOString();
    const expense={kind:'expense' as const,amount:'50.00',accountId:card.id,categoryId:category.id,note:'Lunch',occurredAt:when};
    const key=randomUUID();
    const first=await service.createOperation(owner.id,expense,key);
    assert.equal((await service.createOperation(owner.id,expense,key)).id,first.id);
    await assert.rejects(service.createOperation(owner.id,{...expense,amount:'60.00'},key));
    await service.createOperation(owner.id,{kind:'transfer',amount:'100.00',accountId:card.id,targetAccountId:cash.id,note:'',occurredAt:when},randomUUID());
    const refund=await service.createOperation(owner.id,{kind:'refund',amount:'20.00',accountId:card.id,parentId:first.id,note:'',occurredAt:when},randomUUID());
    const summary=await service.summary(owner.id);
    assert.equal(summary.netExpense,'30.00');
    const accounts=await service.accounts(owner.id);
    assert.equal(accounts.find(a=>a.id===card.id)?.balance,'-130.00');
    assert.equal(accounts.find(a=>a.id===cash.id)?.balance,'100.00');
    await service.removeOperation(owner.id,refund.id,refund.version);
    assert.equal((await service.summary(owner.id)).netExpense,'50.00');
  }finally{
    await db.entry.deleteMany({where:{operation:{ownerId:owner.id}}});
    await db.operation.deleteMany({where:{ownerId:owner.id}});
    await db.category.deleteMany({where:{ownerId:owner.id}});
    await db.account.deleteMany({where:{ownerId:owner.id}});
    await db.owner.delete({where:{id:owner.id}});
    await db.$disconnect();
  }
});
