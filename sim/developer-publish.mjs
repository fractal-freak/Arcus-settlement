/** Trusted publisher. Never imports or executes candidate game source. */
import {execFileSync} from 'node:child_process';
import {readFile,appendFile} from 'node:fs/promises';
import {validateCandidate,applyCandidate} from './developer-policy.mjs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const dir='.local/api-development';
const review=JSON.parse(await readFile(dir+'/review.json','utf8'));
const candidate=validateCandidate(JSON.parse(await readFile(dir+'/candidate.json','utf8')));
if(review.approved!==true||!candidate.files.length){
  console.log('No visually approved change; preserving the published world.');
  process.exit(0);
}
const expected=process.env.EXPECTED_SHA;
if(!/^[a-f0-9]{40}$/.test(expected||''))throw Error('Missing tested revision');
git('fetch','origin','main');
if(git('rev-parse','HEAD')!==expected||git('rev-parse','origin/main')!==expected){
  console.log('Main changed during validation; skip this candidate.');
  process.exit(0);
}
await applyCandidate(candidate);
const summary=candidate.summary.replace(/[\r\n\x00-\x1f]/g,' ').slice(0,500);
await appendFile('DEVELOPMENT_LOG.md',`\n## ${new Date().toISOString()} — API development\n\n${summary}\n\nTests, rulebook, build, boot/frame gate and Gemini visual review passed.\nBase: ${expected}. Candidate evidence is retained in the workflow artifacts.\n`);
git('config','user.name','the settlement');
git('config','user.email','settlement@users.noreply.github.com');
git('add','--',...candidate.files.map(f=>f.path),'DEVELOPMENT_LOG.md');
git('commit','-m','Improve the world after API validation and visual review');
// A race with another publisher is rejected, never force-pushed or rebased untested.
git('push','origin','HEAD:main');
console.log('Approved source published; settlement workflow handles deployment.');
