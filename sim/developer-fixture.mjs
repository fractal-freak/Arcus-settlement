/** Deterministic public-only fixture shared by before/after captures. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {skyAt} from './sky.mjs';
import {PLACE} from './place.mjs';
const out='.local/api-development';await mkdir(out,{recursive:true});
const data=JSON.parse(await readFile('state/settlement.json','utf8'));
data.now=Date.parse('2026-09-12T20:00:00Z');data.sky=skyAt(new Date(data.now),PLACE.lat,PLACE.lon);data.people=[];
if(data.town)data.town.buildings=(data.town.buildings||[]).map(({n,trade,weight})=>({n,trade,weight}));
await writeFile(out+'/fixture.json',JSON.stringify(data));
await copyFile('state/report.json',out+'/baseline-report.json');
