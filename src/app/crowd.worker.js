// The planner uses the same terrain registrations and collision rules as the game.
import './digs.js';
import { CitizenWork } from './citizenWork.js';
import { setPlacements } from './occupied.js';
import { setBridgeActive } from './bridge.js';
let work;
self.onmessage=({data})=>{
  if(data.type==='init') {
    setBridgeActive(data.bridge);setPlacements(data.placements);
    work=new CitizenWork(data.placements);return;
  }
  const occupied=(x,z,r)=>data.bodies.some(p=>Math.hypot(x-p.x,z-p.z)<r+p.r-1e-6);
  let result;
  if(data.type==='assign') {
    const available=(x,z)=>!occupied(x,z,.55);
    result=work.assign(data.seed,undefined,available)??work.assign(data.seed,undefined,available,1.6);
  }else {
    result=work.reroute(data.job,occupied)?data.job:null;
  }
  self.postMessage({type:data.type,version:data.version,result});
};
