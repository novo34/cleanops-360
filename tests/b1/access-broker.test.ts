import test from 'node:test'
import assert from 'node:assert/strict'
import {createV4IdentityRepository} from '../../lib/b1/v4-broker.ts'
const id='11111111-1111-4111-8111-111111111111',time='2026-10-18T12:00:00Z'
test('AUTHZ preparation uses existing fixed SQL with policy CAS as bound data on one connection',async()=>{
 const calls:{sql:string;values:unknown[]}[]=[];let connects=0
 const repository=createV4IdentityRepository({async connect(){connects++;return {async query(sql,values=[]){calls.push({sql,values});return {rows:[{value:true}]}},release(){}}}})
 await repository.transaction(async broker=>{
  assert.equal(await broker.call('setAccessRole',[id,"label'); SET ROLE postgres;--",'7',id]),true)
  assert.equal(await broker.call('setRoleAccess',[id,id,'view','documents',null,'ALLOW',time,null,'8',id]),true)
  assert.equal(await broker.call('setRoleMembership',[id,id,time,null,'9',id]),true)
  assert.equal(await broker.call('setUserAccess',[id,id,'delete','documents',id,'DENY',time,null,'10',id]),true)
  assert.equal(await broker.call('revokeAccess',['RULE',id,id,'11',id]),true)
 })
 assert.equal(connects,1);assert.equal(calls.at(-1)!.sql,'COMMIT')
 assert.equal(calls.filter(c=>c.sql.startsWith('SELECT auth_api.')).length,5)
 assert.ok(calls.every(c=>!c.sql.includes('SET ROLE postgres')&&!/FROM app\.|UPDATE app\.|INSERT INTO app\./.test(c.sql)))
 assert.equal(calls.find(c=>c.sql.includes('set_access_role'))!.values[1],"label'); SET ROLE postgres;--")
})
test('AUTHZ private broker does not convert a rejected CAS or authorization result into success',async()=>{
 const repository=createV4IdentityRepository({async connect(){return {async query(){return {rows:[{value:false}]}},release(){}}}})
 await repository.transaction(async broker=>assert.equal(await broker.call('setUserAccess',[id,id,'edit','users',id,'ALLOW',time,null,'1',id]),false))
})
