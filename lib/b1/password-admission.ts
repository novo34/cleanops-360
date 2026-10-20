import {createHash} from 'node:crypto'
import {AuthError} from './service.ts'

/** Private local corpus snapshot. Selection/residency/update policy is operational
 * configuration, never HTTP authority or a production default. Passwords do not leave
 * this process. Admission does not authenticate, reset credentials or issue a session. */
export function createPasswordAdmission(
  corpus: {version:string;sha256:string;content:Buffer},
  policy: {minimumCodePoints:number;maximumCodePoints:number;maximumCorpusBytes:number},
): (password:string)=>Promise<boolean> {
  const unavailable=()=>new AuthError(503,'AUTH_DEPENDENCY_UNAVAILABLE')
  if(!corpus || !policy || typeof corpus.version!=='string' || typeof corpus.sha256!=='string' || !/^[A-Za-z0-9._-]{1,80}$/.test(corpus.version) || !/^[a-f0-9]{64}$/.test(corpus.sha256) ||
    !Buffer.isBuffer(corpus.content) || !Number.isSafeInteger(policy.maximumCorpusBytes) || policy.maximumCorpusBytes<65 ||
    corpus.content.length>policy.maximumCorpusBytes || !Number.isSafeInteger(policy.minimumCodePoints) ||
    !Number.isSafeInteger(policy.maximumCodePoints) || policy.minimumCodePoints<1 || policy.maximumCodePoints<policy.minimumCodePoints ||
    createHash('sha256').update(corpus.content).digest('hex')!==corpus.sha256)throw unavailable()
  let text:string
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(corpus.content)}catch{throw unavailable()}
  if(!/^(?:[a-f0-9]{64}\n)+$/.test(text))throw unavailable()
  const entries=text.slice(0,-1).split('\n'),hashes=new Set(entries)
  if(hashes.size!==entries.length)throw unavailable()
  // Capture immutable limits and parsed hashes, not caller-mutable policy/buffer objects.
  const minimum=policy.minimumCodePoints,maximum=policy.maximumCodePoints
  return async password=>typeof password==='string' && password.isWellFormed() &&
    [...password].length>=minimum && [...password].length<=maximum &&
    !hashes.has(createHash('sha256').update(password,'utf8').digest('hex'))
}
