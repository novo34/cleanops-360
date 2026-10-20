import test from 'node:test'
import assert from 'node:assert/strict'
import { TOTP, Secret, URI } from 'otpauth'
import { approvedTotpEnrollmentPolicy } from '../../lib/b1/enrollment-policy.ts'
import { numeric } from '../../lib/b1/config.ts'
// Public RFC6238 AppendixB SHA256 vectors. These are NOT deployed credentials.
const vectors: [number,string][] = [[59,'46119246'],[1111111109,'68084774'],[1111111111,'67062674'],[1234567890,'91819424'],[2000000000,'90698825'],[20000000000,'77737706']]
test('approved SHA256 profile matches all six independent RFC6238 vectors',()=>{
 const bytes=Buffer.from('12345678901234567890123456789012');const secret=new Secret({buffer:Uint8Array.from(bytes).buffer})
 try{for(const [seconds,expected] of vectors){
  assert.equal(TOTP.generate({secret,algorithm:'SHA256',digits:8,period:30,timestamp:seconds*1000}),expected)
  assert.equal(TOTP.generate({secret,algorithm:'SHA256',digits:numeric('totp_digits'),period:numeric('totp_period'),timestamp:seconds*1000}),expected.slice(-numeric('totp_digits')))
 }}finally{bytes.fill(0);secret.bytes.fill(0)}
})
test('provisioning round-trip preserves SHA256, issuer and canonical period/digits; not an app compatibility claim',()=>{
 const secret=new Secret({size:32});const policy=approvedTotpEnrollmentPolicy
 try{
  const original=new TOTP({issuer:policy.issuer,label:'synthetic-account',algorithm:policy.algorithm,digits:numeric('totp_digits'),period:numeric('totp_period'),secret})
  const parsed=URI.parse(original.toString());assert.ok(parsed instanceof TOTP)
  assert.equal(parsed.algorithm,'SHA256');assert.equal(parsed.issuer,'CleanOps 360');assert.equal(parsed.period,numeric('totp_period'));assert.equal(parsed.digits,numeric('totp_digits'))
  assert.equal(parsed.generate({timestamp:1234567890000}),original.generate({timestamp:1234567890000}));parsed.secret.bytes.fill(0)
 }finally{secret.bytes.fill(0)}
})
