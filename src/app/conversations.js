import { goalFor, plainEvent, storiesFor, socialSummary, citizenAside } from './journalData.js';
import { citizenProject } from './citizenProjects.js';
/** Authored village conversations. Signs describe fictional citizens, not calculated birth charts. */
const SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'];
const GLYPHS = ['♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓'];
const FLAVOUR = [
  'I tend to volunteer before I have quite worked out the plan. The others call that my Aries showing.',
  'A good meal, a well-made gate, a familiar path home. My Taurus heart has simple loyalties.',
  'I came out for bread and learned three stories on the way. A very Gemini sort of morning.',
  'I remember how people take their tea. That is my favourite version of being a Cancer.',
  'Someone has to get the village singing. I am happy to be that Leo.',
  'I notice the loose stitch and the crooked shelf. I try to make my Virgo eye useful, not unkind.',
  'I like a table where everyone has a place. That is the Libra ideal I actually practise.',
  'Small talk is all right, but tell me what really matters to you. Perhaps that is my Scorpio side.',
  'Every path looks like the beginning of a story. My Sagittarius side always wants to find out.',
  'I enjoy seeing a promise become something solid. A Capricorn can find poetry in a finished wall.',
  'I keep wondering how we could do things differently. My Aquarius friends understand the impulse.',
  'I lose track of time beside the river. I suppose that is a very Pisces confession.',
];

export function citizenProfile(identity, resident = {}, chronicle = []) {
  const seed = Math.abs(Math.trunc(Number(identity)||0)), sign = (seed*7+3)%12;
  return { id: `citizen-${seed}`, name: resident.name || `Villager ${seed+1}`,
    project: citizenProject(resident), relationships: socialSummary(resident), relationshipVoice: [resident.partner ? `${resident.partner} and I are partners.` : 'I have no partner at the moment.', Number.isFinite(resident.friends) ? `I count ${resident.friends} friends here.` : '', Number.isFinite(resident.feuds) && resident.feuds>0 ? `There are also ${resident.feuds} neighbours I have fallen out with.` : 'Things are peaceful on my side of the fence.'].filter(Boolean).join(' '), aside: citizenAside({...resident,seed}),
    recentStory: storiesFor({chronicle},seed,'life')[0], trade: resident.trade || 'villager', temper: resident.temper || 'curious',
    sign: SIGNS[sign], glyph: GLYPHS[sign], flavour: FLAVOUR[sign] };
}

export const TOPICS = [
  { id:'neighbours', icon:'❦', label:'Who are you close to?',
    reply:p=>`${p.relationshipVoice} A small village gives us plenty of chances to become friends—or to argue about the same fence again.`,
    followups:[{label:'Any news about your neighbours?',text:p=>p.recentStory ? plainEvent(p.recentStory.text) : 'No new story about me has reached the chronicle lately. Give us time. Someone will have an opinion about a fence.'}] },
  { id:'story', icon:'✧', label:'What has happened lately?',
    reply:p=>p.recentStory ? `${plainEvent(p.recentStory.text)} That is the latest story about me in the village chronicle.` : 'It has been quiet enough that I have no new story in the chronicle. I am trying to appreciate this before someone asks me to move another barrel.',
    followups:[{label:'And how are you taking it?',text:p=>`${p.aside} That is my contribution to village philosophy today.`}] },
  { id:'project', icon:'✦', label:'What are you improving?',
    reply:p=>p.project ? `My current project is to ${p.project.task}. ${goalFor(p.project.dimension).reason} It is ${p.project.percent}% complete. I have finished ${p.project.finished} projects for the settlement.` : 'I am waiting for my next improvement project.',
    followups:[{label:'Who chooses these projects?',text:'Every half hour, the AI critic reviews the world and can revise our rulebook. We citizens choose projects that address the settlement’s weakest scores. Our saved work changes the village when a project finishes.'}] },
  { id:'sign', icon:'☉', label:'What is your sign?', reply:p=>`I am a ${p.sign}. ${p.flavour}`,
    followups:[
      { label:'Does your sign define you?', text:'I think of it as a story to try on. Some parts fit; some do not. You will learn more about me by sharing a few afternoons than by reading one sign.' },
      { label:'What about the rest of your chart?', text:'In astrology, the Sun is only one part of a chart. The Moon, rising sign, planets and houses add other themes. We villagers keep our signs as part of our stories; I do not have a recorded birth time for a full chart.' },
    ] },
  { id:'moon', icon:'☽', label:'Tell me about the Moon', reply:()=> 'I like to watch the Moon from the bridge. In astrology it is associated with feelings, habits and what makes us feel at home. Its phases also make a lovely rhythm for pausing and reflecting.',
    followups:[
      { label:'A ritual for a new moon?', text:'I write down one thing I want to begin, then choose one small action I can actually take. You could plant a seed, start a journal, or invite someone for a walk. The intention is yours to give it.' },
      { label:'And the full moon?', text:'I use it as a reminder to notice what has grown and what I am ready to put down. A quiet walk and an honest page in my journal are quite enough. No grand ceremony required.' },
    ] },
  { id:'rising', icon:'✧', label:'What is a rising sign?', reply:()=> 'The rising sign is the zodiac sign ascending on the eastern horizon at a person’s birth. Astrologers connect it with how someone meets the world. An accurate birth time and place matter when calculating it.',
    followups:[
      { label:'How is it different from the Sun?', text:'The Sun is often read as a theme of identity and purpose. The rising sign is more like the doorway: how someone approaches a new room or a new beginning. That is a symbolic reading, rather than a rule a person must follow.' },
      { label:'What are the houses?', text:'A chart’s twelve houses organise themes such as home, relationships and work. Different house systems divide the sky differently, so two astrologers may discuss the same chart in different ways.' },
    ] },
  { id:'venus', icon:'♀', label:'Talk about love & friendship', reply:()=> 'Astrologers often look to Venus when discussing affection, pleasure and what we value. I like asking people what makes them feel appreciated. Listening to the answer does more for a friendship than guessing.',
    followups:[
      { label:'Are some signs a perfect match?', text:'I would never turn away a kind person because of a sign. Comparing charts can be an interesting conversation, but trust, care and how you treat one another are things you build together.' },
      { label:'What makes you feel appreciated?', text:p=>p.temper==='bold'||p.temper==='proud' ? 'Invite me along when you are planning something. I love feeling that my courage is useful. And if I have done something well, say it plainly!' : 'Remember a little detail, or stop to ask how my day has been. That is why I like these conversations. A village becomes home one familiar face at a time.' },
    ] },
  { id:'saturn', icon:'♄', label:'Ask about Saturn & growing up', reply:()=> 'In astrological tradition, Saturn is linked with limits, responsibility and patient work. I think of our stone walls: one careful piece after another. A boundary can support a life as well as restrict it.',
    followups:[
      { label:'What is a Saturn return?', text:'It is when Saturn comes back to roughly the position it occupied at birth, about every 29 to 30 years. Astrologers often use it to reflect on commitments and maturity. It is not a deadline for having life figured out.' },
      { label:'What are you learning lately?', text:p=>`Patience with being a beginner. Being a ${p.trade.replaceAll('_',' ')} gives me plenty of practice. I would rather finish one honest piece of work than spend the day pretending I know everything.` },
    ] },
  { id:'mercury', icon:'☿', label:'Is Mercury retrograde?', reply:()=> 'Retrograde describes a planet appearing to move backwards across our sky. In astrology, Mercury is associated with communication and exchange. I have not checked today’s ephemeris, but we can talk about the idea.',
    followups:[
      { label:'What do you do during a retrograde?', text:'I use the symbolism as an excuse to reread a letter, mend a misunderstanding or return to an unfinished idea. Those are useful habits on any day. I still make plans and live my life.' },
      { label:'Does it cause things to go wrong?', text:'I would not blame a planet for a broken cart. I check the wheel! Astrology is a symbolic tradition for our conversations, not an established way to predict mishaps.' },
    ] },
  { id:'work', icon:'⚒', label:'What are you working on?',
    reply:p=>`I am a ${p.trade.toLowerCase()}. ${p.work || 'My next shift is at the village workplace'}. We deliver ${p.output || 'supplies'} to the village stores. Food, water and building materials keep the settlement growing.`,
    followups:[{label:'How does the village grow?',text:'Farmers harvest grain, millers make flour, and bakers prepare food. Woodcutters and quarry workers supply the smiths and builders. When food, water and construction supplies are available, our building projects move faster.'}] },
];

const STORE = 'arcus-village-friendships-v1';
export class Friendships {
  constructor(storage) {
    this.storage=storage; this.people={};
    try {
      const saved=JSON.parse(storage?.getItem(STORE)||'{}');
      for (const [id,entry] of Object.entries(saved).slice(0,512)) {
        if (!/^citizen-\d+$/.test(id)) continue;
        this.people[id]={ met:!!entry?.met, topics:[...new Set((Array.isArray(entry?.topics)?entry.topics:[]).filter(t=>TOPICS.some(x=>x.id===t)))] };
      }
    } catch { /* A private browser or an old save cannot prevent a conversation. */ }
  }
  get(id) { return this.people[id] ?? { met:false,topics:[] }; }
  meet(id, topic) {
    const entry=this.people[id] ??= { met:false,topics:[] }; entry.met=true;
    if (TOPICS.some(t=>t.id===topic) && !entry.topics.includes(topic)) entry.topics.push(topic);
    try { this.storage?.setItem(STORE,JSON.stringify(this.people)); } catch { /* Session memory still works. */ }
    return this.status(id);
  }
  status(id) {
    const e=this.get(id), n=e.topics.length;
    return { label:n>=4?'Friends':n>=2?'Getting to know you':e.met?'New acquaintance':'Not yet introduced', progress:Math.min(1,n/4) };
  }
}
