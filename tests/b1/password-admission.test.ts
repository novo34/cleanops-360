import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {createPasswordAdmission} from '../../lib/b1/password-admission.ts'
import {AuthError} from '../../lib/b1/service.ts'
const compromised='Compromised fixture password!'
const content=Buffer.from(createHash('sha256').update(compromised).digest('hex')+'\n')
const corpus=()=>({version:'synthetic-fixture-v1',sha256:createHash('sha256').update(content).digest('hex'),content:Buffer.from(content)})
const policy=()=>({minimumCodePoints:12,maximumCodePoints:128,maximumCorpusBytes:1024})
const unavailable=(v:unknown)=>v instanceof AuthError && v.status===503
test('local admission uses an integrity-pinned versioned corpus without normalizing or transmitting passwords',async()=>{
 const snapshot=corpus(),limits=policy(),admit=createPasswordAdmission(snapshot,limits)
 assert.equal(await admit(compromised),false);assert.equal(await admit('short'),false)
 assert.equal(await admit('Independent strong fixture credential!'),true)
 snapshot.content.fill(0);limits.minimumCodePoints=1
 assert.equal(await admit(compromised),false);assert.equal(await admit('short'),false)
 assert.equal(await admit('\ud800'),false)
})
test('missing corrupt malformed oversized or duplicate corpus cannot become an admit-all checker',()=>{
 for(const snapshot of [undefined,{...corpus(),sha256:'0'.repeat(64)},{...corpus(),version:''}])assert.throws(()=>createPasswordAdmission(snapshot as never,policy()),unavailable)
 assert.throws(()=>createPasswordAdmission(corpus(),{...policy(),maximumCorpusBytes:64}),unavailable)
 for(const bad of [Buffer.from('invalid\n'),Buffer.concat([content,content]),Buffer.from('')])assert.throws(()=>createPasswordAdmission({version:'synthetic-v1',content:bad,sha256:createHash('sha256').update(bad).digest('hex')},policy()),unavailable)
})
