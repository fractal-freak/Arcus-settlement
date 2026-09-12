/** The API may edit game source, never its own runner, tests, credentials or workflow. */
import {createHash} from 'node:crypto';
import {readFile,writeFile,lstat,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
export const digest=text=>createHash('sha256').update(text).digest('hex');
export function validateCandidate(c) {
  if(!c||typeof c.summary!=='string'||!Array.isArray(c.files)||c.files.length>6)throw Error('Invalid candidate');
  const seen=new Set();let bytes=0;
  for(const f of c.files){
    if(typeof f.path!=='string'||!(/^(src\/[a-zA-Z0-9_/-]+\.(js|css)|public\/style\.css)$/.test(f.path))||f.path.includes('..')||f.path.includes('//')||seen.has(f.path))throw Error('Disallowed path');
    if(typeof f.content!=='string'||typeof f.before!=='string'||!/^([a-f0-9]{64}|new)$/.test(f.before))throw Error('Invalid edit');
    seen.add(f.path);bytes+=Buffer.byteLength(f.content);
  }
  if(bytes>120000)throw Error('Candidate exceeds size limit');
  return c;
}
export async function applyCandidate(c,root=process.cwd()) {
  validateCandidate(c);
  // Check every path and preimage before any write. No model-selected commands.
  for(const f of c.files){
    let at=root;
    for(const part of f.path.split('/')){at=resolve(at,part);try{if((await lstat(at)).isSymbolicLink())throw Error('Symlink refused');}catch(e){if(e.code!=='ENOENT')throw e;}}
    let old;try{old=await readFile(resolve(root,f.path),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    if((old===undefined?'new':digest(old))!==f.before)throw Error('Source changed since proposal: '+f.path);
  }
  for(const f of c.files){await mkdir(dirname(resolve(root,f.path)),{recursive:true});await writeFile(resolve(root,f.path),f.content);}
}
