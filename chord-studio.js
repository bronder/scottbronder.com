const tempo=document.getElementById('tempo');
const playBtn=document.getElementById('playBtn');
const scrub=document.getElementById('scrub');
const time=document.getElementById('time');
const label=document.querySelector('.visual-label strong');
const canvas=document.getElementById('viz');
const ctx=canvas.getContext('2d');

// neon-graph palette — the studio is skinned with the site colors
const theme={name:'Site',stage:'#10141b',deep:'#0b0d11',voices:['#f5b646','#7aa2f7','#34d399','#ff8e3c','#eef0f3']};

// Progression = chart blocks: a chord symbol plus its own length in beats.
// Everything downstream (voicing, sweeps, transport, the neon graph) reads
// this as a variable-length segment timeline, song-builder style.
const MAX_CHORDS=16;
let PROG=[{sym:'G',beats:4},{sym:'B',beats:4},{sym:'C',beats:4},{sym:'Cm',beats:4}];
let NOTES=[];
let N=0;

// Sound presets. Each is a list of section layers; a layer is either a mono-synth
// spec (detuned unisons, optionally Haas-doubled) or an additive partials stack,
// optionally restricted to certain chord tones. Preset-level settings shape the
// shared bus (chorus, formant, reverb, vibrato, wah).
const SOUND_PRESETS={
  custom:{name:'Custom Pads',
    layers:[{type:'fatsawtooth',count:5,spread:45,attack:0.35,sustain:0.85,release:1.8,glide:0.05,
      filterBase:280,filterSus:0.4,filterOct:2.6,vol:-15}],
    breath:[120,450],
    chorus:{frequency:0.3,depth:0.8,wet:0.55},reverb:{decay:9,wet:0.65},shimmer:-20,wah:{base:1800,peak:5500,q:3}},
  organ:{name:'Church Organ',
    layers:[{partials:[{up:0,gain:1},{up:12,gain:0.55},{up:19,gain:0.3},{up:24,gain:0.35},{up:-12,gain:0.6}],
      attack:0.02,sustain:1,release:0.35,glide:0.03,vol:-22}],
    chorus:{frequency:0.2,depth:0.1,wet:0.15},reverb:{decay:11,wet:0.75},shimmer:-26,wah:{base:9000,peak:9000,q:0.7}},
  choir:{name:'Cathedral Choir (Live)',
    sampled:{inst:'choir_aahs', instVol:-14},
    layers:[{partials:[{up:0,gain:1,wave:{type:'fattriangle',count:3,spread:15}},{up:12,gain:0.18}],
      attack:0.6,sustain:0.9,release:2.4,glide:0.08,vol:-22}],
    midShape:{type:'peaking',frequency:850,gain:6,Q:1.5},
    vibrato:{depth:7,rate:5.3},
    chorus:{frequency:0.3,depth:0.6,wet:0.5},reverb:{decay:8,wet:0.65},shimmer:-22,wah:{base:1200,peak:3600,q:4}},
  symphony:{name:'Symphony Strings',
    layers:[{type:'fatsawtooth',count:6,spread:70,attack:0.7,sustain:0.9,release:2.8,glide:0.07,
      filterBase:340,filterSus:0.55,filterOct:2.8,vol:-15}],
    breath:[100,400],
    midShape:{type:'lowpass',frequency:3800,Q:0.7},vibrato:{depth:8,rate:5.2},
    chorus:{frequency:0.3,depth:0.7,wet:0.5},reverb:{decay:8,wet:0.6},shimmer:-24,wah:{base:2000,peak:6000,q:2}},
  orchestra:{name:'Full Orchestra',
    layers:[
      // string section: wide detuned saw pairs, slow swell
      {type:'fatsawtooth',count:6,spread:70,attack:0.7,sustain:0.9,release:2.8,glide:0.07,
        filterBase:340,filterSus:0.55,filterOct:2.8,vol:-17,haas:true},
      // brass: focused saws, filter opens with a quicker "blat", mid weight
      {type:'fatsawtooth',count:4,spread:25,attack:0.25,sustain:0.95,release:1.2,glide:0.05,
        filterBase:500,filterSus:0.7,filterOct:2.4,fEnvA:0.12,vol:-17,haas:false},
      // woodwinds: soft triangle + octave sine doubling the top lines
      {partials:[{up:0,gain:1,wave:{type:'triangle'}},{up:12,gain:0.5}],
        attack:0.3,sustain:0.85,release:1.5,glide:0.06,vol:-22,tones:[0,1]},
      // low cellos/basses doubling the bottom tones an octave down
      {partials:[{up:-12,gain:1,wave:{type:'fatsawtooth',count:2,spread:12}}],
        attack:0.4,sustain:0.9,release:2,glide:0.06,vol:-20,tones:[2,3]}
    ],
    midShape:{type:'lowpass',frequency:4500,Q:0.7},
    vibrato:{depth:7,rate:5.1},
    chorus:{frequency:0.25,depth:0.5,wet:0.4},reverb:{decay:10,wet:0.7},shimmer:-22,wah:{base:2600,peak:6000,q:1.5}},
  orchestraLive:{name:'Real Strings + Orchestra',sampled:{inst:'string_ensemble_1',harp:true},
    layers:[
      {type:'fatsawtooth',count:6,spread:70,attack:0.7,sustain:0.9,release:2.8,glide:0.07,
        filterBase:340,filterSus:0.55,filterOct:2.8,vol:-21,haas:true},
      {type:'fatsawtooth',count:4,spread:25,attack:0.25,sustain:0.95,release:1.2,glide:0.05,
        filterBase:500,filterSus:0.7,filterOct:2.4,fEnvA:0.12,vol:-19,haas:false},
      {partials:[{up:0,gain:1,wave:{type:'triangle'}},{up:12,gain:0.5}],
        attack:0.3,sustain:0.85,release:1.5,glide:0.06,vol:-23,tones:[0,1]},
      {partials:[{up:-12,gain:1,wave:{type:'fatsawtooth',count:2,spread:12}}],
        attack:0.4,sustain:0.9,release:2,glide:0.06,vol:-21,tones:[2,3]}
    ],
    midShape:{type:'lowpass',frequency:4500,Q:0.7},
    vibrato:{depth:7,rate:5.1},
    chorus:{frequency:0.25,depth:0.5,wet:0.4},reverb:{decay:10,wet:0.7},shimmer:-22,wah:{base:2600,peak:6000,q:1.5}}
};
let soundPreset='custom';

// Chord symbol -> voicing engine. Each quality lists candidate shapes as four
// offsets from the root (top voice first); the shape and octave that sit
// closest to the previous chord are chosen, so lines glide smoothly.
const NOTE_SHARP=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_FLAT=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const ROOT_PC={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const QUALITIES={
  '':    {shapes:[[16,12,7,4],[12,7,4,0]]},
  'm':   {shapes:[[15,12,7,3],[12,7,3,0]]},
  'dim': {shapes:[[15,12,6,3],[12,6,3,0]]},
  'aug': {shapes:[[16,12,8,4],[12,8,4,0]]},
  'sus4':{shapes:[[17,12,7,5],[12,7,5,0]]},
  'sus2':{shapes:[[14,12,7,2],[12,7,2,0]]},
  '6':   {shapes:[[16,12,9,4],[9,7,4,0]]},
  'm6':  {shapes:[[15,12,9,3],[9,7,3,0]]},
  '7':   {shapes:[[10,7,4,0],[14,10,7,4]]},
  'maj7':{shapes:[[11,7,4,0],[14,11,7,4]]},
  'm7':  {shapes:[[10,7,3,0],[14,10,7,3]]},
  'm7b5':{shapes:[[10,6,3,0],[14,10,6,3]]},
  'dim7':{shapes:[[9,6,3,0],[15,9,6,3]]},
  'add9':{shapes:[[14,7,4,0]]},
  '9':   {shapes:[[14,10,4,0],[14,10,7,4]]},
  'maj9':{shapes:[[14,11,4,0],[14,11,7,4]]},
  'm9':{shapes:[[14,10,3,0],[14,10,7,3]]}
};
// Diatonic palettes: scale steps, then triad / seventh quality per degree for major and minor keys.
const SCALE_STEPS=[0,2,4,5,7,9,11];
const MINOR_STEPS=[0,2,3,5,7,8,10];
const MAJOR_TRIADS=['','m','m','','','m','dim'];
const MAJOR_SEVENTHS=['maj7','m7','m7','maj7','7','m7','m7b5'];
const MINOR_TRIADS=['m','dim','','m','m','',''];
const MINOR_SEVENTHS=['m7','m7b5','maj7','m7','m7','maj7','7'];
const MAJOR_NINTHS=['maj9','9','9','maj9','9','9','m7b5'];
const MINOR_NINTHS=['m9','m7b5','maj9','m9','m9','maj9','9'];
const MAJOR_SIXTHS=['6','m6','m6','6','6','m6','dim7'];
const MINOR_SIXTHS=['m6','dim7','6','m6','m6','6','6'];
const MAJOR_SUS=['sus2','sus4','sus4','sus2','sus4','sus2','sus4'];
const MINOR_SUS=['sus2','sus4','sus4','sus2','sus4','sus2','sus4'];
const CHORD_MODES={
  triads:{name:'triads',maj:MAJOR_TRIADS,min:MINOR_TRIADS},
  sevenths:{name:'7ths',maj:MAJOR_SEVENTHS,min:MINOR_SEVENTHS},
  ninths:{name:'9ths',maj:MAJOR_NINTHS,min:MINOR_NINTHS},
  sixths:{name:'6ths',maj:MAJOR_SIXTHS,min:MINOR_SIXTHS},
  sus:{name:'sus',maj:MAJOR_SUS,min:MINOR_SUS}
};
const ROMANS_MAJ=['I','ii','iii','IV','V','vi','vii°'];
const ROMANS_MIN=['i','ii°','III','iv','v','VI','VII'];
// [label, tonic pitch class, spells with sharps(1) or flats(0)]
const KEYS=[['C',0,1],['G',7,1],['D',2,1],['A',9,1],['E',4,1],['B',11,1],['F#',6,1],['F',5,0],['Bb',10,0],['Eb',3,0],['Ab',8,0],['Db',1,0]];

function parseChord(sym){
  const m=/^([A-G][#b]?)(.*)$/.exec(String(sym).trim());
  if(!m) return null;
  let q=m[2];
  if(q==='maj')q=''; else if(q==='min'||q==='-')q='m'; else if(q==='°')q='dim';
  const spec=QUALITIES[q];
  if(!spec) return null;
  let pc=ROOT_PC[m[1][0]];
  if(m[1][1]==='#')pc++; else if(m[1][1]==='b')pc--;
  return {root:((pc%12)+12)%12, shapes:spec.shapes};
}

function voiceChords(symbols, jitter){
  const out=[]; let prev=null;
  for(const sym of symbols){
    const c=parseChord(sym);
    if(!c) continue;
    let best=null, bestCost=Infinity;
    for(let r=c.root+Math.ceil((44-c.root)/12)*12; r<=72; r+=12){
      for(const shape of c.shapes){
        const top=r+shape[0], bot=r+shape[3];
        if(top<60||top>79||bot<47||bot>64) continue;
        let cost=0;
        if(prev){
          for(let i=0;i<4;i++) cost+=Math.abs(r+shape[i]-prev[i]);
        }else{
          cost=Math.abs(top-70)+Math.abs(bot-58);
        }
        if(jitter) cost+=Math.random()*18; // revoice: nudge the chooser well off its usual path
        if(cost<bestCost){bestCost=cost;best={r,shape};}
      }
    }
    if(!best) best={r:60,shape:c.shapes[c.shapes.length-1]};
    const notes=[0,1,2,3].map(i=>best.r+best.shape[i]);
    notes.push(43+((c.root-43)%12+12)%12); // bass: root pitch class in G2..F#3
    prev=notes.slice(0,4);
    out.push(notes);
  }
  return out;
}

let bpm=Number(tempo.value||90);
let playing=false;
let introSweep=false;
let playClock=0;
let cur=0;
let last=performance.now();
let audioCtx=null;
let masterGain=null;
let synthVoices=null;
let toneReady=null;
let padVoices=null;
let bassVoice=null;
let subVoice=null;
let shimVoices=null;
let sweepEQ=null;
let sweepLP=null;
let sweepUp=false;
let voicesActive=false;
let toneMaster=null;
const toneNodes=[];
function reg(node){ toneNodes.push(node); return node; }

/* ---------- segment timeline: per-chord lengths replace one global bar length ---------- */

const BEATS_PER_MEASURE=4;

function totalBeats(){
  return PROG.reduce((s,c)=>s+c.beats,0);
}
function totalDur(){
  // with no chords, one empty measure keeps the transport math finite
  return (totalBeats()||BEATS_PER_MEASURE)*60/bpm;
}
function segDur(i){
  return PROG[i].beats*60/bpm;
}
// seconds in -> which chord segment covers it (wraps the loop)
function posToSeg(pos){
  if(N===0) return {idx:0,local:0,dur:totalDur(),start:0};
  const td=totalDur();
  const t=((pos%td)+td)%td;
  let acc=0;
  for(let i=0;i<N;i++){
    const d=segDur(i);
    if(t<acc+d || i===N-1) return {idx:i, local:t-acc, dur:d, start:acc};
    acc+=d;
  }
}
function beatToPos(beat){
  return beat*60/bpm;
}

/* ---------- section loop: an optional playback window between beats ---------- */

let csLoopFrom=null; // beat where the window starts (a marker's beat)
let csLoopTo=null;   // beat where it ends (next marker, or the loop end)

function csLoopActive(){
  return csLoopFrom!==null && csLoopTo!==null && csLoopTo>csLoopFrom && csLoopFrom<totalBeats();
}
function csLoopLen(){
  return csLoopActive() ? (csLoopTo-csLoopFrom)*60/bpm : totalDur();
}
function csWrapWindow(p){
  if(!csLoopActive()){
    const td=totalDur();
    return ((p%td)+td)%td;
  }
  const a=csLoopFrom*60/bpm;
  const len=csLoopLen();
  return a+(((p-a)%len)+len)%len;
}

function fmtSec(s){ return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function syncMeta(){
  const active=csLoopActive();
  const len=csLoopLen();
  const pos=csWrapWindow(cur)-(active?csLoopFrom*60/bpm:0);
  time.textContent=fmtSec(pos)+' / '+fmtSec(len);
  // announce position as time, matching the visible readout — a bare range
  // input would otherwise say percentages
  scrub.setAttribute('aria-valuetext', fmtSec(pos)+' of '+fmtSec(len));
  scrub.max=String(Math.max(1,Math.round(len)));
  scrub.value=String(Math.min(Number(scrub.max), Math.round(pos)));
  const chord=(N>0 && PROG[posToSeg(csWrapWindow(cur)).idx]) ? PROG[posToSeg(csWrapWindow(cur)).idx].sym : '—';
  if(label) label.textContent=chord;
}

// how much of each segment is spent sweeping to the next chord
function sweepDur(b){ return Math.min(1.8, b*0.45); }

function noteAt(voice,t,noIntro,sessT){
  if(N===0) return 60;
  const tt=csWrapWindow(t);
  const seg=posToSeg(tt);
  const idx=seg.idx, local=seg.local, b=seg.dur;
  const from=NOTES[idx][voice];
  const to=NOTES[(idx+1)%N][voice];
  const trans=sweepDur(b);
  const hold=b-trans;
  let m;
  if(local<=hold) m=from;
  else{
    const p=(local-hold)/trans;
    const e=p*p*(3-2*p);
    m=from + (to-from)*e;
  }
  // intro sweep: the first measure starts an octave up and rides down into place
  const firstDur=segDur(0);
  const introOn=!noIntro && introSweep && (sessT!==undefined ? (sessT>=0 && sessT<firstDur) : playClock<firstDur);
  if(introOn){
    const p=Math.min(1, tt/firstDur);
    const e=1-p*p*(3-2*p);
    m+=(voice<2?12:-12)*e;
  }
  return m;
}

function midiToFreq(m){ return 440 * Math.pow(2,(m-69)/12); }

// Sampled real-instrument layers: FluidR3_GM soundfonts (GPL) loaded lazily from
// the gleitz MIDI.js mirror only when a sampled preset is used. Real players
// re-articulate on each chord change, so samples trigger at segment boundaries on
// top of the gliding synth pad underneath; the optional harp sweeps upward.
let sfScripts={};
let sfCache={};
let sfBus=null;
let sfLastSegIdx=-1;
let sfFailed=false;

function ensureSoundfont(inst){
  if(!sfScripts[inst]){
    const tag=document.createElement('script');
    tag.src='https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/'+inst+'-mp3.js';
    // a failed load (offline, blocked, 404) used to strip the sampled layers
    // silently — say so once so the quieter sound is not a mystery
    tag.onerror=()=>{
      if(sfFailed) return;
      sfFailed=true;
      if(csStatus && !playing) csStatus.textContent='sampled instruments could not load — playing synth layers only';
    };
    document.head.appendChild(tag);
  }
}

function sfNoteName(midi){
  const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return NAMES[midi%12]+(Math.floor(midi/12)-1);
}

function sfPlayer(inst, midi, vol){
  const bank=window.MIDI && MIDI.Soundfont && MIDI.Soundfont[inst];
  if(!bank) return null;
  const name=sfNoteName(midi);
  if(!bank[name]) return null;
  const key=inst+':'+name;
  if(!sfCache[key]){
    const p=reg(new Tone.Player({url:bank[name], fadeIn:0.05, fadeOut:0.4}));
    p.connect(sfBus);
    p.volume.value=vol!==undefined?vol:-12;
    sfCache[key]=p;
  }
  return sfCache[key];
}

function sfTriggerChord(cfg, pos){
  const notes=(NOTES[posToSeg(pos).idx]||[]).slice(0,4);
  if(cfg.inst){
    notes.forEach(n=>{
      const p=sfPlayer(cfg.inst, n, cfg.instVol);
      if(p && p.loaded) p.start();
    });
  }
  if(cfg.harp){
    [3,2,1,0].forEach((ti,k)=>{
      if(notes[ti]===undefined) return;
      const p=sfPlayer('orchestral_harp', notes[ti]+12, -16);
      if(p && p.loaded) p.start(Tone.now()+0.02+k*0.15);
    });
  }
}

// Tone.js patch, voiced by the selected preset. Haas-doubled panned pads, bass + sub,
// shimmer layer, sweep EQ + resonant wah that open on chord shifts.
// If the Tone.js CDN script fails to load, falls back to the bare oscillator drone below.
// builds one voice for a chord tone from a layer spec, connected to `dest`.
// Partials specs: a stack of fixed-ratio oscillators (organ stops, winds, low cellos).
// Mono specs: a filtered MonoSynth, optionally Haas-doubled hard L/R.
function makeVoice(spec, tone, dest){
  const pans=[-0.7,-0.25,0.25,0.7];
  if(spec.partials){
    const env={attack:spec.attack, decay:0.1, sustain:spec.sustain, release:spec.release};
    const parts=[];
    spec.partials.forEach(pt=>{
      const osc=pt.wave || {type:'sine'};
      const s=reg(new Tone.Synth({portamento:spec.glide, oscillator:osc, envelope:env}));
      const g=reg(new Tone.Gain(pt.gain));
      s.connect(g);
      g.connect(dest);
      s.volume.value=spec.vol!==undefined?spec.vol:-19;
      parts.push({s, up:pt.up});
    });
    const ratio=up=>up?Math.pow(2,up/12):1;
    return {
      tone,
      attack(f){ parts.forEach(p=>{try{p.s.triggerAttack(f*ratio(p.up));}catch{}}); },
      release(){ parts.forEach(p=>{try{p.s.triggerRelease();}catch{}}); },
      setNote(f){ parts.forEach(p=>{try{p.s.setNote(f*ratio(p.up));}catch{}}); },
      detunables:parts.map(p=>p.s)
    };
  }
  const sides=spec.haas===false?[1]:[1,-1];
  const inner=[];
  for(const side of sides){
    const v=reg(new Tone.MonoSynth({
      portamento:spec.glide,
      oscillator:{type:spec.type, count:spec.count, spread:spec.spread},
      envelope:{attack:spec.attack, decay:0.25, sustain:spec.sustain, release:spec.release},
      filter:{Q:1, rolloff:-24},
      filterEnvelope:{attack:spec.fEnvA||0.6, decay:0.4, sustain:spec.filterSus, release:1.5, baseFrequency:spec.filterBase, octaves:spec.filterOct}
    }));
    const pan=reg(new Tone.Panner(pans[tone]*side));
    v.connect(pan);
    if(side>0){
      pan.connect(dest);
    }else{
      const d=reg(new Tone.Delay(0.005));
      pan.connect(d);
      d.connect(dest);
    }
    v.detune.value=side*5;
    v.volume.value=spec.vol!==undefined?spec.vol:-15;
    inner.push(v);
  }
  return {
    tone,
    attack(f){ inner.forEach(v=>{try{v.triggerAttack(f);}catch{}}); },
    release(){ inner.forEach(v=>{try{v.triggerRelease();}catch{}}); },
    setNote(f){ inner.forEach(v=>{try{v.setNote(f);}catch{}}); },
    detunables:inner,
    filters:inner.map(v=>v.filter)
  };
}

async function initTone(){
  const gen=soundGen;
  const P=SOUND_PRESETS[soundPreset] || SOUND_PRESETS.custom;
  await Tone.start();
  if(gen!==soundGen) return; // a newer sound was picked before this build started
  const reverb=reg(new Tone.Reverb({decay:P.reverb.decay, preDelay:0.03, wet:P.reverb.wet}));
  try{ if(reverb.ready) await reverb.ready; }catch{}
  if(gen!==soundGen) return;
  const chorus=reg(new Tone.Chorus({frequency:P.chorus.frequency, depth:P.chorus.depth, wet:P.chorus.wet}));
  chorus.start();
  const widener=reg(new Tone.StereoWidener({width:0.85}));
  const sweepFilter=reg(new Tone.Filter({type:'highshelf', frequency:2200, gain:0}));
  const wah=reg(new Tone.Filter({type:'lowpass', frequency:P.wah.base, Q:P.wah.q}));
  const midShape=P.midShape ? reg(new Tone.Filter({type:P.midShape.type, frequency:P.midShape.frequency, gain:P.midShape.gain||0, Q:P.midShape.Q||1})) : null;
  const limiter=reg(new Tone.Limiter(-1.2));
  limiter.toDestination();
  const master=reg(new Tone.Gain(0.9));
  master.connect(limiter);
  // pad bus: chorus -> [formant] -> widener -> sweep EQ -> wah -> reverb
  const padBus=reg(new Tone.Gain(1));
  chorus.connect(midShape || widener);
  if(midShape){ midShape.connect(widener); }
  widener.connect(sweepFilter);
  sweepFilter.connect(wah);
  wah.connect(reverb);
  reverb.connect(master);
  const pads=[];
  (P.layers||[]).forEach(spec=>{
    (spec.tones||[0,1,2,3]).forEach(t=> pads.push(makeVoice(spec, t, padBus)));
  });
  padBus.connect(chorus);
  // sampled real-instrument layers share the same hall reverb
  if(P.sampled){
    if(P.sampled.inst) ensureSoundfont(P.sampled.inst);
    if(P.sampled.harp) ensureSoundfont('orchestral_harp');
    sfBus=reg(new Tone.Gain(1));
    sfBus.connect(reverb);
    // warm the current chord's samples so the first re-articulation lands
    (NOTES[0]||[]).slice(0,4).forEach(n=>{
      if(P.sampled.inst) sfPlayer(P.sampled.inst, n, P.sampled.instVol);
      if(P.sampled.harp) sfPlayer('orchestral_harp', n+12, -16);
    });
  }
  // slow filter breathing so the pad swells instead of sitting still (mono voices only)
  if(P.breath){
    const breath=reg(new Tone.LFO({frequency:0.05, min:P.breath[0], max:P.breath[1]}));
    pads.forEach(v=>(v.filters||[]).forEach(f=>breath.connect(f.frequency)));
    breath.start();
  }
  // gentle vibrato for the vocal/string presets
  if(P.vibrato && P.vibrato.depth>0){
    const vib=reg(new Tone.LFO({frequency:P.vibrato.rate, min:-P.vibrato.depth, max:P.vibrato.depth}));
    pads.forEach(v=>v.detunables.forEach(s=>vib.connect(s.detune)));
    vib.start();
  }
  const bass=reg(new Tone.MonoSynth({
    portamento:0.05,
    oscillator:{type:'fatsawtooth', count:2, spread:8},
    envelope:{attack:0.04, decay:0.3, sustain:0.75, release:0.9},
    filterEnvelope:{attack:0.05, decay:0.3, sustain:0.4, release:0.8, baseFrequency:110, octaves:1.8}
  }));
  bass.connect(master);
  bass.volume.value=-6;
  // pure sine sub an octave under the bass — the weight you feel
  const sub=reg(new Tone.Synth({
    portamento:0.05,
    oscillator:{type:'sine'},
    envelope:{attack:0.06, decay:0.4, sustain:0.9, release:1.2}
  }));
  sub.connect(master);
  sub.volume.value=-11;
  // shimmer layer: soft sines an octave up, each breathing on its own slow LFO,
  // high-passed into a long reverb with a touch of echo — the glisten over the pad
  const shimReverb=reg(new Tone.Reverb({decay:9, preDelay:0.04, wet:0.9}));
  try{ if(shimReverb.ready) await shimReverb.ready; }catch{}
  if(gen!==soundGen) return; // stale mid-build: leave teardown to the newer switch
  const shimDelay=reg(new Tone.FeedbackDelay({delayTime:0.42, feedback:0.35, wet:0.3}));
  const shimHP=reg(new Tone.Filter({type:'highpass', frequency:1200}));
  shimHP.connect(shimDelay);
  shimDelay.connect(shimReverb);
  shimReverb.connect(master);
  const shimPans=[-0.5,0.5,-0.25,0.25];
  const shims=[];
  for(let i=0;i<4;i++){
    const v=reg(new Tone.Synth({
      portamento:0.12,
      oscillator:{type:'sine'},
      envelope:{attack:1.5, decay:0.5, sustain:0.8, release:3.5}
    }));
    const vg=reg(new Tone.Gain(0.5));
    const lfo=reg(new Tone.LFO({frequency:0.06+i*0.05, min:0.1, max:0.9}));
    lfo.connect(vg.gain);
    lfo.start();
    const pan=reg(new Tone.Panner(shimPans[i]));
    v.connect(vg);
    vg.connect(pan);
    if(i%2===1){
      const d=reg(new Tone.Delay(0.005));
      pan.connect(d);
      d.connect(shimHP);
    }else{
      pan.connect(shimHP);
    }
    v.volume.value=P.shimmer;
    shims.push(v);
  }
  toneMaster=master;
  padVoices=pads;
  bassVoice=bass;
  subVoice=sub;
  shimVoices=shims;
  sweepEQ=sweepFilter;
  sweepLP=wah;
}

// sound swaps are generation-guarded: each switch bumps the generation, so a
// stale switch (or its half-built patch) can never tear down or clobber the
// graph a newer selection is building
let soundGen=0;

// swap patches live: release, dispose every node, rebuild with the new preset
async function switchSound(){
  const gen=++soundGen;
  const wasPlaying=playing;
  releaseAll();
  await new Promise(r=>setTimeout(r,120));
  if(gen!==soundGen) return; // a newer selection owns the teardown + rebuild
  toneNodes.forEach(n=>{try{n.dispose();}catch{}});
  toneNodes.length=0;
  sfCache={}; sfLastSegIdx=-1; sfBus=null; sfFailed=false;
  csJam=null; csJamHeld.clear();
  padVoices=null; bassVoice=null; subVoice=null; shimVoices=null;
  sweepEQ=null; sweepLP=null; toneMaster=null; toneReady=null; sweepUp=false; voicesActive=false;
  if(wasPlaying) ensureSynth();
}

function attackAll(){
  if(!padVoices || N===0) return;
  const td=totalDur();
  const pos=((cur%td)+td)%td;
  padVoices.forEach(v=>v.attack(midiToFreq(noteAt(v.tone,pos))));
  bassVoice.triggerAttack(midiToFreq(noteAt(4,pos)));
  if(subVoice) subVoice.triggerAttack(midiToFreq(noteAt(4,pos)-12));
  if(shimVoices) shimVoices.forEach((v,i)=>v.triggerAttack(midiToFreq(noteAt(i,pos,true)+12)));
  voicesActive=true;
}

function releaseAll(){
  voicesActive=false;
  if(!padVoices) return;
  padVoices.forEach(v=>v.release());
  try{bassVoice.triggerRelease();}catch{}
  if(subVoice){try{subVoice.triggerRelease();}catch{}}
  if(shimVoices) shimVoices.forEach(v=>{try{v.triggerRelease();}catch{}});
}

function ensureSynth(){
  if(window.Tone && Tone.MonoSynth){
    if(!toneReady) toneReady=initTone().catch(()=>{ toneReady=null; ensureLegacySynth(); });
    toneReady.then(()=>{ if(playing && padVoices) attackAll(); }).catch(()=>{});
    return;
  }
  ensureLegacySynth();
}

function ensureLegacySynth(){
  if(!audioCtx){
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    audioCtx=new AC();
    masterGain=audioCtx.createGain();
    masterGain.gain.value=0.0001;
    masterGain.connect(audioCtx.destination);
    synthVoices = (NOTES[0]||[67,62,59,55,43]).map((_,i)=>{
      const osc=audioCtx.createOscillator();
      const g=audioCtx.createGain();
      osc.type = i===4 ? 'triangle' : 'sine';
      g.gain.value = i===4 ? 0.12 : 0.08;
      osc.connect(g);
      g.connect(masterGain);
      osc.start();
      return {osc,g};
    });
  }
}

function updateSynth(){
  if(padVoices && window.Tone){
    if(playing && N>0){
      const P=SOUND_PRESETS[soundPreset] || SOUND_PRESETS.custom;
      const td=totalDur();
      const pos=((cur%td)+td)%td;
      const seg=posToSeg(pos);
      // while the chords are sweeping, open the top end and lift the shimmer
      const gliding=seg.local > seg.dur-sweepDur(seg.dur);
      if(gliding!==sweepUp && sweepEQ && sweepLP){
        sweepUp=gliding;
        sweepEQ.gain.rampTo(gliding?5:0, 0.25);
        shimVoices.forEach(v=>v.volume.rampTo(gliding?P.shimmer+5:P.shimmer, 0.3));
        // the whaa: resonant lowpass snaps open through the shift, eases shut after
        sweepLP.frequency.rampTo(gliding?P.wah.peak:P.wah.base, gliding?0.18:0.6);
      }
      // real instruments re-articulate at each chord onset (segment boundary)
      if(P.sampled && sfBus){
        if(seg.idx!==sfLastSegIdx){ sfLastSegIdx=seg.idx; sfTriggerChord(P.sampled, pos); }
      }
      padVoices.forEach(vv=>{
        const f=midiToFreq(noteAt(vv.tone,pos));
        if(Number.isFinite(f)) vv.setNote(f);
      });
      const bf=midiToFreq(noteAt(4,pos));
      if(Number.isFinite(bf)) bassVoice.setNote(bf);
      if(subVoice){
        const sf=midiToFreq(noteAt(4,pos)-12);
        if(Number.isFinite(sf)) subVoice.setNote(sf);
      }
      if(shimVoices){
        for(let v=0;v<shimVoices.length;v++){
          const sf=midiToFreq(noteAt(v,pos,true)+12);
          if(Number.isFinite(sf)) shimVoices[v].setNote(sf);
        }
      }
    }
    return;
  }
  updateLegacySynth();
}

function updateLegacySynth(){
  if(!audioCtx || !synthVoices) return;
  const td=totalDur();
  const pos=((cur%td)+td)%td;
  const now=audioCtx.currentTime;
  masterGain.gain.setTargetAtTime((playing && N>0) ? 0.22 : 0.0001, now, 0.03);
  for(let v=0;v<synthVoices.length;v++){
    const m=noteAt(v,pos);
    const f=midiToFreq(m);
    if(Number.isFinite(f)) synthVoices[v].osc.frequency.setTargetAtTime(f, now, 0.04);
  }
}

function resizeCanvas(){
  const dpr=Math.max(1, window.devicePixelRatio||1);
  const w=Math.max(1, Math.floor(canvas.clientWidth*dpr));
  const h=Math.max(1, Math.floor(canvas.clientHeight*dpr));
  if(canvas.width!==w || canvas.height!==h){ canvas.width=w; canvas.height=h; }
}

function draw(){
  resizeCanvas();
  const w=canvas.width, h=canvas.height;
  const dpr=Math.max(1, window.devicePixelRatio||1);
  ctx.clearRect(0,0,w,h);
  const g=ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,w*0.7);
  g.addColorStop(0, theme.stage);
  g.addColorStop(1, theme.deep);
  ctx.fillStyle=g;
  ctx.fillRect(0,0,w,h);

  const td=totalDur();
  const yFor=m=>h*0.88 - ((m-40)/40)*h*0.78;

  // freeze-frame: the held (jam) or hovered (palette preview) chord as
  // static neon lines, name blazing — the tagline ("chords into neon
  // light") made literal under your fingers or your cursor
  const freeze=csJamView || csHoverView;
  if(freeze && !playing){
    const t=performance.now()/1000;
    const isJam=csJamView===freeze;
    for(let v=0;v<4;v++){
      const m=freeze.notes[v];
      const y=yFor(m);
      const col=theme.voices[v];
      ctx.strokeStyle=col;
      ctx.lineWidth=3*dpr;
      ctx.shadowColor=col;
      ctx.shadowBlur=(10+5*Math.sin(t*2+v))*dpr;
      ctx.globalAlpha=isJam?1:0.8;
      ctx.beginPath();
      ctx.moveTo(w*0.06,y);
      ctx.lineTo(w*0.94,y);
      ctx.stroke();
      ctx.globalAlpha=1;
    }
    ctx.shadowBlur=0;
    ctx.fillStyle=theme.voices[0];
    ctx.font=`800 ${44*dpr}px Figtree, sans-serif`;
    const sym=freeze.sym;
    ctx.fillText(sym, w/2-ctx.measureText(sym).width/2, h*0.47);
    ctx.font=`700 ${13*dpr}px Figtree, sans-serif`;
    ctx.fillStyle=theme.voices[0]+'99';
    const hint=isJam ? 'jamming — release to return' : 'hovering — click to add';
    ctx.fillText(hint, w/2-ctx.measureText(hint).width/2, h*0.56);
    return;
  }

  // idle overview: stopped means the whole loop as a faint neon landscape —
  // the live graph only draws history left of the playhead, which at rest is
  // nothing; the tool's signature should not disappear when the music does
  if(!playing && N>0){
    const x0=w*0.06, x1=w*0.94;
    // chord boundaries + names across the loop
    ctx.font=`700 ${12*dpr}px Figtree, sans-serif`;
    let acc=0;
    for(let i=0;i<N;i++){
      const x=x0+(acc/totalBeats())*(x1-x0);
      acc+=PROG[i].beats;
      ctx.strokeStyle=theme.voices[0]+'22';
      ctx.lineWidth=1*dpr;
      ctx.beginPath(); ctx.moveTo(x,h*0.08); ctx.lineTo(x,h); ctx.stroke();
      ctx.fillStyle=theme.voices[0]+'88';
      ctx.fillText(PROG[i].sym, x+5*dpr, h*0.08);
    }
    // the five voice trajectories, fainter than the live graph
    for(let v=0;v<5;v++){
      const col=theme.voices[v];
      ctx.strokeStyle=col;
      ctx.lineWidth=2*dpr;
      ctx.shadowColor=col;
      ctx.shadowBlur=7*dpr;
      ctx.globalAlpha=0.7;
      ctx.beginPath();
      const steps=Math.min(240, Math.max(60, Math.round((x1-x0)/4)));
      for(let s=0;s<=steps;s++){
        const t=(s/steps)*td;
        const x=x0+(s/steps)*(x1-x0);
        const y=yFor(noteAt(v,t));
        if(s===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      ctx.globalAlpha=1;
    }
    ctx.shadowBlur=0;
    // silent preview's home: a soft hairline at the current position
    const beat=((cur*bpm/60)%totalBeats()+totalBeats())%totalBeats();
    const px=x0+(beat/Math.max(1,totalBeats()))*(x1-x0);
    ctx.strokeStyle=theme.voices[0]+'66';
    ctx.lineWidth=1.5*dpr;
    ctx.beginPath(); ctx.moveTo(px,h*0.08); ctx.lineTo(px,h); ctx.stroke();
    return;
  }

  const pxPerBeat=w/32; // eight 4-beat measures across the canvas, zooming with tempo
  const pxPerSec=pxPerBeat*bpm/60;
  // playhead rides from the left edge to center, then the graph scrolls
  const playX=Math.min(w*0.5, playClock*pxPerSec);
  const pos=N>0 ? ((cur%td)+td)%td : 0;
  const sessAnchor=playClock-pos;

  ctx.font=`700 ${13*dpr}px Figtree, sans-serif`;
  // vertical lines + labels at each chord change, across every visible loop cycle
  if(N>0){
    const starts=[];
    let acc=0;
    for(let i=0;i<N;i++){ starts.push({t:acc, sym:PROG[i].sym}); acc+=PROG[i].beats; }
    const t0=pos - playX/pxPerSec;
    const t1=pos + (w-playX)/pxPerSec;
    for(let k=Math.floor(t0/td); k<=Math.floor(t1/td); k++){
      for(let i=0;i<N;i++){
        const t=k*td + starts[i].t*60/bpm;
        if(t<t0 || t>t1) continue;
        const x=playX + (t-pos)*pxPerSec;
        if(x<-20 || x>w+20) continue;
        ctx.strokeStyle=theme.voices[0]+'33';
        ctx.lineWidth=1*dpr;
        ctx.beginPath(); ctx.moveTo(x,h*0.06); ctx.lineTo(x,h); ctx.stroke();
        ctx.fillStyle=theme.voices[0]+'99';
        ctx.fillText(starts[i].sym, x+6*dpr, h*0.06);
      }
    }
  }

  for(let v=0;v<5;v++){
    const col=theme.voices[v];
    ctx.beginPath();
    for(let x=0;x<=playX;x+=3*dpr){
      const tt=pos - (playX-x)/pxPerSec;
      const y=yFor(noteAt(v,tt,false,tt+sessAnchor));
      if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.strokeStyle=col;
    ctx.lineWidth=3*dpr;
    ctx.shadowColor=col;
    ctx.shadowBlur=14*dpr;
    ctx.stroke();
    const py=yFor(noteAt(v,pos,false,playClock));
    ctx.beginPath();
    ctx.arc(playX,py,7*dpr,0,Math.PI*2);
    ctx.fillStyle=col;
    ctx.fill();
  }
  ctx.shadowBlur=0;
  if(N>0 && playX>=w*0.18){
    const nowIdx=posToSeg(pos).idx;
    ctx.fillStyle=theme.voices[0];
    ctx.font=`800 ${28*dpr}px Figtree, sans-serif`;
    ctx.fillText(PROG[nowIdx].sym, playX+18*dpr, yFor(noteAt(0,pos))-14*dpr);
  }
}

// with the click on, play waits behind a four-beat count-in (practice mode);
// pressing again while it counts cancels. without the click, play is instant
let csCountInTimer=null;

function csCancelCountIn(note){
  if(!csCountInTimer) return;
  clearTimeout(csCountInTimer);
  csCountInTimer=null;
  if(csStatus && note) csStatus.textContent='';
}

function setPlaying(on, immediate){
  if(on && !immediate && csCountInTimer){
    csCancelCountIn(true); // the press during the count-in cancels it
    return;
  }
  playing=on;
  const chip=document.querySelector('.visual-label');
  if(chip){
    chip.style.opacity=on?'0':'';
    // faded from sight while playing — take it out of the tree too, its
    // "silent preview" wording is stale mid-playback
    chip.setAttribute('aria-hidden', on?'true':'false');
  }
  if(on){
    const startNow=()=>{
      playClock=0;
      if(introSweep) cur=0;
      csFollow=true; // picking up the instrument takes over the chart view
      ensureSynth();
      if(audioCtx && audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
      csNowIdx=-1;
      csUpdateNow(cur);
      playBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>';
      playBtn.setAttribute('aria-label','Pause');
      playBtn.setAttribute('title','Pause');
      updateSynth();
      csUpdatePlayhead();
    };
    if(!immediate && csClickOn && window.Tone && Tone.MembraneSynth){
      // the transport defers until the count-in is served: undo the
      // playing=true set above, restore the idle preview label
      playing=false;
      if(chip){
        chip.style.opacity='';
        chip.setAttribute('aria-hidden','false');
      }
      const go=()=>{
        const beat=60/bpm;
        const t0=Tone.now()+0.08;
        for(let i=0;i<4;i++){
          try{ csClickSynth.triggerAttackRelease(i===0?1900:1250, 0.03, t0+i*beat, 0.8); }catch{}
        }
        if(csStatus) csStatus.textContent='count-in…';
        const waitMs=Math.max(50,(t0+4*beat-Tone.now())*1000);
        csCountInTimer=setTimeout(()=>{
          csCountInTimer=null;
          if(csStatus) csStatus.textContent='';
          setPlaying(true, true); // immediate: the count-in has been served
        }, waitMs);
      };
      const voice=csClickSynth || csEnsureClick();
      if(voice && voice.then) voice.then(v=>{ if(v) go(); else startNow(); });
      else if(csClickSynth) go();
      else startNow();
      return;
    }
    startNow();
  }else{
    csCancelCountIn(true);
    releaseAll();
    csClearNow();
    csResetMeter();
  }
  playBtn.innerHTML = on
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  // the icon swaps identity, so the name must follow it — otherwise screen
  // readers keep announcing "Play" on the button that now pauses
  playBtn.setAttribute('aria-label', on?'Pause':'Play');
  playBtn.setAttribute('title', on?'Pause':'Play');
  updateSynth();
  csUpdatePlayhead();
}

const stepBtn=(id,input,d)=>{
  const b=document.getElementById(id);
  if(!b) return;
  b.addEventListener('click',()=>{
    const el=document.getElementById(input);
    el.value=Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value)+d));
    el.dispatchEvent(new Event('input'));
  });
};
stepBtn('tempoDown','tempo',-1);
stepBtn('tempoUp','tempo',1);
// tap tempo, same averaging as the other tools: last 5 taps within 3s
const csTapBtn=document.getElementById('csTap');
let csTaps=[];
if(csTapBtn){
  csTapBtn.addEventListener('click',()=>{
    const now=performance.now();
    csTaps=csTaps.filter(t=>now-t<3000);
    csTaps.push(now);
    if(csTaps.length>5) csTaps.shift();
    if(csTaps.length<2) return;
    let sum=0;
    for(let i=1;i<csTaps.length;i++) sum+=csTaps[i]-csTaps[i-1];
    const tapped=Math.round(60000/(sum/(csTaps.length-1)));
    if(Number.isFinite(tapped)){
      tempo.value=Math.min(Number(tempo.max), Math.max(Number(tempo.min), tapped));
      tempo.dispatchEvent(new Event('input'));
    }
  });
}
tempo.addEventListener('input',()=>{
  bpm=Number(tempo.value);
  syncMeta(); updateSynth(); draw(); saveCsPrefs();
});
playBtn.addEventListener('click',()=> setPlaying(!playing));
// rewind to start: jump the loop, restart the session clock (replays the intro
// and sends the playhead back to the left edge when armed)
const csRewindBtn=document.getElementById('csRewind');
if(csRewindBtn){
  csRewindBtn.addEventListener('click',()=>{
    cur=0;
    playClock=0;
    csFollow=true;
    sfLastSegIdx=-1;
    syncMeta();
    updateSynth();
    draw();
  });
}
const csIntroBtn=document.getElementById('csIntro');
if(csIntroBtn){
  csIntroBtn.addEventListener('click',()=>{
    introSweep=!introSweep;
    csIntroBtn.setAttribute('aria-pressed',String(introSweep));
    updateSynth();
    draw();
  });
}
scrub.addEventListener('input',()=>{
  // the slider is window-relative when a section loop is active
  cur=((csLoopActive()?csLoopFrom*60/bpm:0)+Number(scrub.value))||0;
  csFollow=true;
  sfLastSegIdx=-1;
  csNowIdx=-1;
  csUpdateNow(cur);
  syncMeta(); updateSynth(); draw();
});

/* ---------- progression chart: song-builder-style blocks on a beat ruler ---------- */

const CS_PX_BEAT=30;
const BEAT_CHOICES=[1,2,4,8,12,16];
const MARKER_COLORS=['#f5b646','#7dd3fc','#c4b5fd','#fda4af','#5eead4'];
const MARKER_NAMES=['Intro','Verse','Chorus','Bridge','Outro'];
let MARKERS=[];

const csGridScroll=document.getElementById('cs-grid-scroll');
const csGridTrack=document.getElementById('cs-grid-track');
const csStatus=document.getElementById('cs-status');
const csNameInput=document.getElementById('cs-name');
let csName=''; // rides along: share links, poster, MIDI track name, filenames

function csFileSlug(){
  const base=csName ? csName.trim() : PROG.slice(0,6).map(c=>c.sym).join('-');
  return base.replace(/[^A-Za-z0-9-]+/g,'').slice(0,40) || 'progression';
}
const csUndoBtn=document.getElementById('cs-undo');
const csMenuBtn=document.getElementById('cs-menu-btn');
const csMenuEl=document.getElementById('cs-menu');
const csClearBtn=document.getElementById('cs-clear');
let csHistory=[];
let csNowIdx=-1;
let csDrag=null;
let csMdrag=null;

// a stale window (markers gone, chart shortened) quietly reopens the full loop
function csValidateLoopWindow(){
  if(csLoopFrom===null) return;
  if(!csLoopActive() || !MARKERS.some(m=>m.beat===csLoopFrom)){
    csLoopFrom=null;
    csLoopTo=null;
  }
}

// shift-click a flag: loop from its section to the next flag (or the end)
function csToggleSectionLoop(m){
  if(csLoopFrom===m.beat){
    csLoopFrom=null;
    csLoopTo=null;
    if(csStatus) csStatus.textContent='looping the whole progression';
  }else{
    const sorted=[...MARKERS].sort((a,b)=>a.beat-b.beat);
    const next=sorted.find(k=>k.beat>m.beat);
    csLoopFrom=m.beat;
    csLoopTo=next ? next.beat : totalBeats();
    if(csStatus) csStatus.textContent='looping '+m.label+' — '+((csLoopTo-csLoopFrom)/BEATS_PER_MEASURE)+' bars';
  }
  rebuild();
}

function csHexA(hex, a){
  const n=parseInt(hex.slice(1), 16);
  return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
}

function maxMarkerBeat(){
  const tb=Math.max(totalBeats(), BEATS_PER_MEASURE);
  return Math.max(0, Math.floor((tb-1)/BEATS_PER_MEASURE))*BEATS_PER_MEASURE;
}

function normalizeMarkers(){
  if(!MARKERS.length) return;
  const maxB=maxMarkerBeat();
  const seen=new Set();
  MARKERS=MARKERS
    .filter(m=>m.beat>=0 && m.beat<=maxB && !seen.has(m.beat) && seen.add(m.beat))
    .sort((a,b)=>a.beat-b.beat);
}

function csPushHistory(){
  csHistory.push({prog:PROG.map(c=>({...c})), markers:MARKERS.map(m=>({...m}))});
  if(csHistory.length>50) csHistory.shift();
  csSyncUndo();
}
function csSyncUndo(){
  if(csUndoBtn) csUndoBtn.disabled=csHistory.length===0;
}

// the chart as roman numerals in the selected key — null if any chord's
// root sits outside it (better silent than wrong). roots, not spellings:
// a G triad is still degree I when the palette shows Gmaj7
function csRomanReadout(){
  if(!PROG.length) return null;
  const data=paletteData();
  const parts=PROG.map(c=>{
    const pc=parseChord(c.sym);
    if(!pc) return null;
    const d=data.findIndex(x=>{
      const q=parseChord(x.sym);
      return q && q.root===pc.root;
    });
    return d>=0 ? data[d].roman : null;
  });
  return parts.every(p=>p) ? parts.join('–') : null;
}

function csIdleStatus(){
  if(!csStatus) return;
  if(!PROG.length){ csStatus.textContent=''; return; }
  const roman=csRomanReadout();
  csStatus.textContent=PROG.length+' chord'+(PROG.length>1?'s':'')+' · '+totalBeats()+' beats'+
    (roman ? ' · '+roman : '');
}

// single data-changed pipeline: re-voice, clamp transport, redraw everything, persist
function rebuild(freshIdx){
  N=PROG.length;
  if(N===0){
    NOTES=[];
    cur=0;
    if(playing) setPlaying(false); // stop cleanly: icon, label, and synth all reset
  }else{
    NOTES=voiceChords(PROG.map(c=>c.sym));
    const td=totalDur();
    cur=((cur%td)+td)%td;
    if(playing && padVoices && !voicesActive) attackAll();
  }
  renderGrid(null, freshIdx);
  renderPalette();
  syncMeta();
  updateSynth();
  draw();
  saveCsPrefs();
  csIdleStatus();
}

function mutateProg(fn){
  csPushHistory();
  fn();
  rebuild();
}
function mutateMarkers(fn){
  csPushHistory();
  fn();
  rebuild();
}

function renderGrid(move, freshIdx){
  // move: { idx, dropIdx } while a block is being dragged to dropIdx
  csGridTrack.innerHTML='';
  normalizeMarkers();
  csValidateLoopWindow();
  const tb=Math.max(totalBeats(), BEATS_PER_MEASURE);
  csGridTrack.style.width=tb*CS_PX_BEAT+'px';

  const sortedMk=[...MARKERS].sort((a,b)=>a.beat-b.beat);

  // section tints: one colored span per marker, out to the next marker
  sortedMk.forEach((m,i)=>{
    const end=i+1<sortedMk.length ? sortedMk[i+1].beat : tb;
    const tint=document.createElement('div');
    tint.className='marker-tint';
    tint.style.left=m.beat*CS_PX_BEAT+'px';
    tint.style.width=Math.max(0,end-m.beat)*CS_PX_BEAT+'px';
    tint.style.background=csHexA(m.color,0.05);
    csGridTrack.appendChild(tint);
  });

  // ruler: beat ticks, measure lines, measure numbers
  for(let b=0;b<=tb;b++){
    const x=b*CS_PX_BEAT;
    const isMeasure=b%BEATS_PER_MEASURE===0;
    const line=document.createElement('div');
    line.className='grid-line'+(isMeasure?' measure':'');
    line.style.left=x+'px';
    csGridTrack.appendChild(line);
    if(isMeasure && b<tb){
      const num=document.createElement('span');
      num.className='grid-num';
      num.style.left=x+6+'px';
      num.textContent=b/BEATS_PER_MEASURE+1;
      csGridTrack.appendChild(num);
    }
  }

  // markers: a beat line down the grid + a flag in the ruler strip
  sortedMk.forEach(m=>{
    const vline=document.createElement('div');
    vline.className='marker-beat-line';
    vline.style.left=m.beat*CS_PX_BEAT+'px';
    vline.style.background=csHexA(m.color,0.32);
    csGridTrack.appendChild(vline);
  });
  if(PROG.length && !MARKERS.length){
    const hint=document.createElement('span');
    hint.className='mk-lane-hint';
    hint.textContent='double-click the ruler to drop a section marker';
    csGridTrack.appendChild(hint);
  }
  sortedMk.forEach(renderMarker);

  if(!PROG.length){
    const empty=document.createElement('div');
    empty.className='grid-empty';
    empty.textContent='Your progression starts here. Tap a chord to add it.';
    csGridTrack.appendChild(empty);
  }

  // section loop window: validated against the current chart, drawn as a band
  if(csLoopActive()){
    const band=document.createElement('div');
    band.className='cs-loopband';
    band.style.left=(csLoopFrom*CS_PX_BEAT)+'px';
    band.style.width=((csLoopTo-csLoopFrom)*CS_PX_BEAT)+'px';
    csGridTrack.appendChild(band);
  }

  // blocks
  let cursor=0;
  PROG.forEach((c,i)=>{
    if(move && i===move.idx){
      cursor+=c.beats;
      return;
    }
    renderBlock(c,i,cursor,move, !move && i===freshIdx);
    cursor+=c.beats;
  });

  if(move){
    const slot=document.createElement('div');
    slot.className='drop-slot';
    slot.style.left=move.dropX+'px';
    slot.style.width=PROG[move.idx].beats*CS_PX_BEAT-2+'px';
    csGridTrack.appendChild(slot);
  }

  // the sweeping playhead rides above the blocks, ignored by the pointer
  const ph=document.createElement('div');
  ph.className='cs-playhead';
  csGridTrack.appendChild(ph);
  csPlayheadEl=ph;
  csUpdatePlayhead();

  if(playing) csApplyNow();
  csSyncPlayEnabled();
  saveCsPrefs();
}

let csPlayheadEl=null;

// auto-follow: while playing, page the chart forward so the sweeping playhead
// stays in view. a user's own scroll pauses the following — it re-arms when
// they scroll back to the playhead, or on any seek
let csFollow=true;
let csFollowUntil=0; // scroll events in this window are our own paging

function csUpdatePlayhead(){
  if(!csPlayheadEl) return;
  if(!playing || N===0){
    csPlayheadEl.style.display='none';
    return;
  }
  csPlayheadEl.style.display='block';
  const beat=((cur*bpm/60)%totalBeats()+totalBeats())%totalBeats();
  csPlayheadEl.style.left=(beat*CS_PX_BEAT)+'px';
  if(csFollow && csGridScroll){
    const x=beat*CS_PX_BEAT;
    const sl=csGridScroll.scrollLeft;
    const vw=csGridScroll.clientWidth;
    if(x<sl || x>sl+vw-40){
      csGridScroll.scrollLeft=Math.max(0, x-vw*0.15);
      csFollowUntil=performance.now()+80;
    }
  }
}

if(csGridScroll){
  csGridScroll.addEventListener('scroll',()=>{
    if(!playing) return;
    if(performance.now()<csFollowUntil) return; // our own paging, not the user
    const beat=((cur*bpm/60)%totalBeats()+totalBeats())%totalBeats();
    const x=beat*CS_PX_BEAT;
    const sl=csGridScroll.scrollLeft;
    const vw=csGridScroll.clientWidth;
    // the user scrolled: follow again only if they landed back on the music
    csFollow = x>=sl && x<=sl+vw;
  }, {passive:true});
}

// nothing to play means no transport: the sibling tools disable their play
// buttons on an empty progression too
function csSyncPlayEnabled(){
  if(playBtn) playBtn.disabled = N===0;
  if(csSaveBtn) csSaveBtn.disabled = N===0;
  if(csMidiBtn) csMidiBtn.disabled = N===0;
}

// removing a block destroys whatever held focus; hand it to the block that
// took the removed one's place (or to Undo once the chart is empty)
function csFocusAfterRemoval(gone){
  const next=Math.min(gone, PROG.length-1);
  const nb=csGridTrack.querySelector('.seq-block[data-idx="'+next+'"]');
  if(nb) nb.focus();
  else if(csUndoBtn) csUndoBtn.focus();
}

function renderBlock(c,i,startBeat,move,fresh){
  const el=document.createElement('div');
  el.className='seq-block'+
    (playing && !move && i===csNowIdx ? ' now' : '')+
    (fresh ? ' fresh' : '');
  el.style.left=startBeat*CS_PX_BEAT+1+'px';
  el.style.width=c.beats*CS_PX_BEAT-2+'px';
  el.setAttribute('tabindex','0');
  el.setAttribute('data-idx',String(i));
  el.setAttribute('aria-label',
    c.sym+', '+c.beats+' beats, chord '+(i+1)+' of '+PROG.length+
    '. Press Delete to remove; arrows move; shift+arrows transpose.');

  const name=document.createElement('span');
  name.className='blk-name';
  name.textContent=c.sym;

  // duration as a clickable select — drag-to-resize still works
  const dur=document.createElement('select');
  dur.className='blk-dur';
  dur.setAttribute('aria-label','Length of '+c.sym+' in beats');
  const choices=BEAT_CHOICES.includes(c.beats)
    ? BEAT_CHOICES
    : [...BEAT_CHOICES, c.beats].sort((a,b)=>a-b);
  choices.forEach(n=>{
    const o=document.createElement('option');
    o.value=String(n);
    o.textContent=n+(n===1?' beat':' beats');
    if(n===c.beats) o.selected=true;
    dur.appendChild(o);
  });
  dur.addEventListener('pointerdown',e=>e.stopPropagation());
  dur.addEventListener('change',()=>{
    mutateProg(()=>{ PROG[i].beats=parseInt(dur.value,10); });
  });

  const actions=document.createElement('div');
  actions.className='blk-actions';
  const mkBtn=(btnLabel,title,fn)=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='blk-btn';
    btn.textContent=btnLabel;
    btn.title=title;
    btn.setAttribute('aria-label',title+' '+c.sym);
    btn.addEventListener('pointerdown',e=>e.stopPropagation());
    btn.addEventListener('click',fn);
    actions.appendChild(btn);
  };
  mkBtn('‹','Move left',()=>mutateProg(()=>{
    if(i>0) PROG.splice(i-1,0,PROG.splice(i,1)[0]);
  }));
  mkBtn('›','Move right',()=>mutateProg(()=>{
    if(i<PROG.length-1) PROG.splice(i+1,0,PROG.splice(i,1)[0]);
  }));
  mkBtn('⧉','Duplicate',()=>mutateProg(()=>{
    PROG.splice(i+1,0,{sym:c.sym, beats:c.beats});
  }));
  mkBtn('×','Remove',()=>{
    mutateProg(()=>{ PROG.splice(i,1); });
    csFocusAfterRemoval(i);
  });

  const edge=document.createElement('span');
  edge.className='edge';
  edge.title='drag to resize';
  edge.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    beginCsDrag({
      type:'resize',
      i,
      el,
      startBeatPx:startBeat*CS_PX_BEAT+1,
      prevProg:PROG.map(x=>({...x})),
    });
  });

  el.addEventListener('pointerdown',e=>{
    if(e.button!==0) return;
    beginCsDrag({
      type:'move',
      i,
      el,
      startX:e.clientX,
      dropIdx:i,
      moved:false,
      prevProg:PROG.map(x=>({...x})),
    });
  });
  // Delete on a focused block removes it — same affordance the marker flags have
  el.addEventListener('keydown',e=>{
    if(e.target!==el) return; // child controls own their keys
    if(e.key==='Delete' || e.key==='Backspace'){
      e.preventDefault();
      mutateProg(()=>{ PROG.splice(i,1); });
      csFocusAfterRemoval(i);
    }else if(e.key==='ArrowLeft' || e.key==='ArrowRight'){
      // keyboard drag: arrows move the block, focus rides along
      e.preventDefault();
      const ni=i+(e.key==='ArrowLeft' ? -1 : 1);
      if(ni<0 || ni>=PROG.length) return;
      mutateProg(()=>{ PROG.splice(ni,0,PROG.splice(i,1)[0]); });
      const nb=csGridTrack.querySelector('.seq-block[data-idx="'+ni+'"]');
      if(nb) nb.focus();
    }else if(e.shiftKey && (e.key==='ArrowUp' || e.key==='ArrowDown')){
      // shift+arrows transpose the chord a semitone — borrowed chords,
      // secondary dominants, whatever the music wants
      e.preventDefault();
      const m=/^([A-G][#b]?)(.*)$/.exec(PROG[i].sym);
      if(!m) return;
      const pc=parseChord(PROG[i].sym);
      if(!pc) return;
      const np=(pc.root+(e.key==='ArrowUp'?1:-1)+12)%12;
      mutateProg(()=>{ PROG[i].sym=NOTE_SHARP[np]+m[2]; });
      const nb=csGridTrack.querySelector('.seq-block[data-idx="'+i+'"]');
      if(nb) nb.focus();
    }
  });

  el.appendChild(name);
  el.appendChild(dur);
  el.appendChild(actions);
  el.appendChild(edge);
  csGridTrack.appendChild(el);
}

/* ---------- section markers: DAW-style flags on the ruler ---------- */

function renderMarker(m){
  const el=document.createElement('div');
  el.className='marker-flag'+(csMdrag && csMdrag.blocked && csMdrag.m===m ? ' blocked' : '');
  el.style.left=m.beat*CS_PX_BEAT+1+'px';
  el.style.setProperty('--mk', m.color);
  el.style.background=csHexA(m.color,0.16);
  el.style.borderColor=csHexA(m.color,0.5);
  el.setAttribute('data-beat',String(m.beat));
  el.setAttribute('role','button');
  el.setAttribute('tabindex','0');
  el.setAttribute('aria-label',
    'Marker '+m.label+', measure '+(m.beat/BEATS_PER_MEASURE+1)+
    '. Drag to move. Click to rename, or to jump the loop there while playing.');

  const glyph=document.createElement('span');
  glyph.className='mk-glyph';
  glyph.textContent='▸';

  const mlabel=document.createElement('span');
  mlabel.className='mk-label';
  mlabel.textContent=m.label;

  const del=document.createElement('button');
  del.type='button';
  del.className='mk-del';
  del.textContent='×';
  del.setAttribute('aria-label','Remove '+m.label+' marker');
  del.addEventListener('pointerdown',e=>e.stopPropagation());
  del.addEventListener('click',()=>{
    mutateMarkers(()=>MARKERS.splice(MARKERS.indexOf(m),1));
  });

  el.append(glyph,mlabel,del);

  el.addEventListener('pointerdown',e=>{
    if(e.button!==0 || e.target.closest('.mk-del') || el.querySelector('.mk-rename')) return;
    e.stopPropagation();
    beginCsMarkerDrag(m,el,e.clientX);
  });

  el.addEventListener('click',e=>{
    if(e.shiftKey && !e.target.closest('.mk-del')){
      e.preventDefault();
      csToggleSectionLoop(m);
    }
  });

  el.addEventListener('keydown',e=>{
    if(el.querySelector('.mk-rename')) return;
    if(e.key==='Enter' || e.key===' '){
      e.preventDefault();
      if(playing) jumpToMarker(m);
      else beginCsMarkerRename(el,m);
    }else if(e.key==='Delete' || e.key==='Backspace'){
      e.preventDefault();
      mutateMarkers(()=>MARKERS.splice(MARKERS.indexOf(m),1));
    }
  });

  csGridTrack.appendChild(el);
}

function beginCsMarkerDrag(m,el,startX){
  csMdrag={m,startX,origBeat:m.beat,lastBeat:m.beat,moved:false,blocked:false,snap:null};
  window.addEventListener('pointermove',onCsMarkerDragMove);
  window.addEventListener('pointerup',onCsMarkerDragEnd);
}

function onCsMarkerDragMove(e){
  if(!csMdrag) return;
  if(!csMdrag.moved){
    if(Math.abs(e.clientX-csMdrag.startX)<=6) return;
    csMdrag.moved=true;
    csMdrag.snap={prog:PROG.map(c=>({...c})), markers:MARKERS.map(k=>({...k}))};
  }
  const rect=csGridTrack.getBoundingClientRect();
  const measure=Math.round((e.clientX-rect.left)/(CS_PX_BEAT*BEATS_PER_MEASURE));
  const beat=Math.max(0,Math.min(maxMarkerBeat(), measure*BEATS_PER_MEASURE));
  const blocked=MARKERS.some(k=>k!==csMdrag.m && k.beat===beat);
  if(!blocked) csMdrag.m.beat=beat;
  if(beat!==csMdrag.lastBeat || blocked!==csMdrag.blocked){
    csMdrag.lastBeat=beat;
    csMdrag.blocked=blocked;
    renderGrid();
    if(blocked){
      const fl=csGridTrack.querySelector('.marker-flag[data-beat="'+csMdrag.m.beat+'"]');
      if(fl) fl.classList.add('blocked');
    }
  }
}

function onCsMarkerDragEnd(){
  window.removeEventListener('pointermove',onCsMarkerDragMove);
  window.removeEventListener('pointerup',onCsMarkerDragEnd);
  const d=csMdrag;
  csMdrag=null;
  if(!d) return;
  if(!d.moved){
    // plain click: rename while stopped, jump the loop while playing
    if(playing){
      jumpToMarker(d.m);
    }else{
      const fl=csGridTrack.querySelector('.marker-flag[data-beat="'+d.m.beat+'"]');
      if(fl) beginCsMarkerRename(fl,d.m);
    }
    return;
  }
  if(d.blocked){
    d.m.beat=d.origBeat;
    if(csStatus) csStatus.textContent='that measure already has a marker';
    renderGrid();
    return;
  }
  if(d.snap && d.m.beat!==d.origBeat){
    csHistory.push(d.snap);
    if(csHistory.length>50) csHistory.shift();
    csSyncUndo();
  }
  rebuild();
}

function beginCsMarkerRename(el,m){
  if(el.querySelector('.mk-rename')) return;
  const labelEl=el.querySelector('.mk-label');
  if(!labelEl) return;
  const input=document.createElement('input');
  input.className='mk-rename';
  input.value=m.label;
  input.maxLength=24;
  input.setAttribute('aria-label','Marker name');
  labelEl.replaceWith(input);
  input.addEventListener('pointerdown',e=>e.stopPropagation());
  input.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Enter') input.blur();
    else if(e.key==='Escape'){
      input.value=m.label;
      input.blur();
    }
  });
  input.addEventListener('blur',()=>{
    const v=input.value.trim();
    if(v && v!==m.label) mutateMarkers(()=>{ m.label=v; });
    else renderGrid();
  });
  input.focus();
  input.select();
}

// jump the loop so the marker's section starts now
function jumpToMarker(m){
  if(!playing || !PROG.length) return;
  cur=csWrapWindow(beatToPos(m.beat));
  csFollow=true;
  sfLastSegIdx=-1;
  csNowIdx=-1;
  csUpdateNow(cur);
  syncMeta(); updateSynth(); draw();
}

// click anywhere on the ruler strip to scrub the loop there — continuous,
// so unlike the whole-second slider it can land between beats. marker
// double-clicks coexist: their seek-then-place lands on the measure start
if(csGridScroll){
  csGridScroll.addEventListener('click',e=>{
    if(!PROG.length) return;
    if(e.target.closest('.seq-block, .marker-flag, .mk-rename')) return;
    const rect=csGridTrack.getBoundingClientRect();
    const y=e.clientY-rect.top;
    const px=e.clientX-rect.left;
    if(y<0 || y>44 || px<0 || px>rect.width) return;
    const td=totalDur();
    cur=Math.min(Math.max(0, px/CS_PX_BEAT*60/bpm), td-0.001);
    csFollow=true;
    sfLastSegIdx=-1;
    csNowIdx=-1;
    csUpdateNow(cur);
    csUpdatePlayhead();
    syncMeta(); updateSynth(); draw();
  });
}

// double-click the ruler strip to drop a marker on that measure
if(csGridScroll){
  csGridScroll.addEventListener('dblclick',e=>{
    if(e.target.closest('.seq-block, .marker-flag, .mk-rename')) return;
    if(!PROG.length) return;
    const rect=csGridTrack.getBoundingClientRect();
    const y=e.clientY-rect.top;
    const px=e.clientX-rect.left;
    if(y<0 || y>44 || px<0 || px>rect.width) return;
    const beat=Math.max(
      0,
      Math.min(maxMarkerBeat(), Math.round(px/(CS_PX_BEAT*BEATS_PER_MEASURE))*BEATS_PER_MEASURE)
    );
    if(MARKERS.some(m=>m.beat===beat)){
      if(csStatus) csStatus.textContent='that measure already has a marker';
      return;
    }
    const used=MARKERS.map(m=>m.label);
    const mlabel=MARKER_NAMES.find(n=>!used.includes(n)) || 'Marker '+(MARKERS.length+1);
    mutateMarkers(()=>{
      MARKERS.push({
        beat,
        label:mlabel,
        color:MARKER_COLORS[MARKERS.length%MARKER_COLORS.length],
      });
    });
  });
}

/* ---------- grid drag: resize (edge) + move (body) ---------- */

function beginCsDrag(d){
  csDrag=d;
  if(d.type==='resize') d.el.classList.add('resizing');
  window.addEventListener('pointermove',onCsDragMove);
  window.addEventListener('pointerup',onCsDragEnd);
}

function endCsDrag(){
  window.removeEventListener('pointermove',onCsDragMove);
  window.removeEventListener('pointerup',onCsDragEnd);
  const d=csDrag;
  csDrag=null;
  return d;
}

function computeDropIdx(px,skipIdx){
  let acc=0;
  let idx=0;
  for(let i=0;i<PROG.length;i++){
    if(i===skipIdx) continue;
    if(px>=acc+(PROG[i].beats*CS_PX_BEAT)/2) idx++;
    acc+=PROG[i].beats;
  }
  return idx;
}

function insertionX(dropIdx,skipIdx){
  let x=0;
  let k=0;
  for(let i=0;i<PROG.length;i++){
    if(i===skipIdx) continue;
    if(k===dropIdx) break;
    x+=PROG[i].beats;
    k++;
  }
  return x*CS_PX_BEAT;
}

function onCsDragMove(e){
  if(!csDrag) return;
  if(csDrag.type==='resize'){
    const rect=csGridTrack.getBoundingClientRect();
    const px=e.clientX-rect.left;
    let nb=Math.max(1,Math.min(64,Math.round((px-csDrag.startBeatPx)/CS_PX_BEAT)));
    if(nb!==PROG[csDrag.i].beats){
      PROG[csDrag.i].beats=nb;
      csDrag.el.style.width=nb*CS_PX_BEAT-2+'px';
      const sel=csDrag.el.querySelector('.blk-dur');
      if(sel) sel.value=String(nb);
      csGridTrack.style.width=
        Math.max(totalBeats(),BEATS_PER_MEASURE)*CS_PX_BEAT+'px';
    }
    return;
  }
  // move
  if(!csDrag.moved && Math.abs(e.clientX-csDrag.startX)<=6) return;
  csDrag.moved=true;
  const rect=csGridTrack.getBoundingClientRect();
  const px=e.clientX-rect.left;
  const dropIdx=computeDropIdx(px,csDrag.i);
  if(dropIdx!==csDrag.dropIdx || !csDrag.rendered){
    csDrag.dropIdx=dropIdx;
    csDrag.rendered=true;
    csDrag.dropX=insertionX(dropIdx,csDrag.i);
    renderGrid({idx:csDrag.i, dropIdx});
  }else{
    csDrag.dropX=insertionX(dropIdx,csDrag.i);
    const slot=csGridTrack.querySelector('.drop-slot');
    if(slot) slot.style.left=csDrag.dropX+'px';
  }
}

function onCsDragEnd(){
  const d=endCsDrag();
  if(!d) return;
  if(d.type==='move' && d.moved){
    const item=PROG.splice(d.i,1)[0];
    PROG.splice(d.dropIdx,0,item);
  }
  if(d.prevProg && JSON.stringify(d.prevProg)!==JSON.stringify(PROG)){
    csHistory.push({prog:d.prevProg, markers:MARKERS.map(m=>({...m}))});
    if(csHistory.length>50) csHistory.shift();
  }
  csSyncUndo();
  rebuild();
}

/* ---------- progression history (undo / clear / menu) ---------- */

if(csUndoBtn){
  csUndoBtn.addEventListener('click',()=>{
    if(!csHistory.length) return;
    const past=csHistory.pop();
    PROG=past.prog.map(c=>({...c}));
    MARKERS=past.markers.map(m=>({...m}));
    csSyncUndo();
    rebuild();
  });
}

if(csMenuBtn && csMenuEl){
  const closeMenu=()=>{
    csMenuEl.hidden=true;
    csMenuBtn.setAttribute('aria-expanded','false');
  };
  csMenuBtn.addEventListener('click',()=>{
    const open=csMenuEl.hidden;
    csMenuEl.hidden=!open;
    csMenuBtn.setAttribute('aria-expanded',String(open));
  });
  document.addEventListener('click',e=>{
    if(!csMenuEl.hidden && !csMenuEl.contains(e.target) && e.target!==csMenuBtn){
      closeMenu();
    }
  });
  const csRevoiceBtn=document.getElementById('cs-revoice');
  if(csRevoiceBtn){
    csRevoiceBtn.addEventListener('click',()=>{
      closeMenu();
      if(!PROG.length) return;
      NOTES=voiceChords(PROG.map(c=>c.sym), true);
      if(playing && padVoices) attackAll();
      draw();
      if(csStatus) csStatus.textContent='revoiced — the lines take new paths';
    });
  }
  const csRotateBtn=document.getElementById('cs-rotate');
  const csReverseBtn=document.getElementById('cs-reverse');
  if(csRotateBtn){
    csRotateBtn.addEventListener('click',()=>{
      closeMenu();
      if(PROG.length<2) return;
      mutateProg(()=>{ PROG.push(PROG.shift()); });
      if(csStatus) csStatus.textContent='rotated — '+PROG[0].sym+' now leads';
    });
  }
  if(csReverseBtn){
    csReverseBtn.addEventListener('click',()=>{
      closeMenu();
      if(PROG.length<2) return;
      mutateProg(()=>{ PROG.reverse(); });
      if(csStatus) csStatus.textContent='reversed — '+PROG[0].sym+' now leads';
    });
  }
  if(csClearBtn){
    csClearBtn.addEventListener('click',()=>{
      closeMenu();
      mutateProg(()=>{ PROG=[]; });
    });
  }
}

/* ---------- now-highlight on the chart while playing ---------- */

function csApplyNow(){
  if(!playing || N===0) return;
  csGridTrack.querySelectorAll('.seq-block').forEach(el=>{
    el.classList.toggle('now', Number(el.dataset.idx)===csNowIdx);
  });
}
function csClearNow(){
  csNowIdx=-1;
  if(!csGridTrack) return;
  csGridTrack.querySelectorAll('.seq-block.now').forEach(el=>el.classList.remove('now'));
}
function csUpdateNow(pos){
  if(!csGridTrack) return;
  if(!playing || N===0){ csClearNow(); return; }
  const idx=posToSeg(pos).idx;
  if(idx===csNowIdx) return;
  csNowIdx=idx;
  csApplyNow();
}

/* ---------- persistence: progression, markers, tempo, sound ---------- */

const CS_STORE_KEY='chordStudioSongV1';

function saveCsPrefs(){
  if(csGridTrack===null) return; // chart not present on this page — nothing to save
  try{
    localStorage.setItem(CS_STORE_KEY, JSON.stringify({
      prog:PROG.map(c=>({sym:c.sym, beats:c.beats})),
      markers:MARKERS.map(m=>({beat:m.beat, label:m.label, color:m.color})),
      bpm:Math.max(40, Math.min(240, Math.round(bpm)||90)),
      sound:soundPreset,
      click:csClickOn,
      arp:csArpOn,
      arpRate:csArpRate,
      name:csName,
    }));
  }catch{}
}

function loadCsPrefs(){
  let p=null;
  try{ p=JSON.parse(localStorage.getItem(CS_STORE_KEY)||'null'); }catch{ p=null; }
  if(!p || typeof p!=='object') return;
  if(Array.isArray(p.prog)){
    const prog=p.prog.filter(c=>
      c && typeof c.sym==='string' && parseChord(c.sym) &&
      Number.isInteger(c.beats) && c.beats>=1 && c.beats<=64
    ).slice(0,MAX_CHORDS).map(c=>({sym:c.sym.trim(), beats:c.beats}));
    if(prog.length) PROG=prog;
  }
  if(Array.isArray(p.markers)){
    MARKERS=p.markers
      .filter(m=>
        m && Number.isInteger(m.beat) && m.beat>=0 &&
        typeof m.label==='string' && m.label.trim()
      )
      .map(m=>({
        beat:m.beat,
        label:m.label.trim().slice(0,24),
        color:/^#[0-9a-f]{6}$/i.test(m.color||'') ? m.color : null,
      }))
      .sort((a,b)=>a.beat-b.beat);
    MARKERS.forEach((m,i)=>{
      if(!m.color) m.color=MARKER_COLORS[i%MARKER_COLORS.length];
    });
    const seen=new Set();
    MARKERS=MARKERS.filter(m=>!seen.has(m.beat) && seen.add(m.beat));
  }
  if(Number.isFinite(p.bpm)){
    bpm=Math.max(40, Math.min(240, Math.round(p.bpm)));
    tempo.value=String(bpm);
  }
  if(SOUND_PRESETS[p.sound]) soundPreset=p.sound;
  if(typeof p.click==='boolean') csClickOn=p.click;
  if(typeof p.arp==='boolean') csArpOn=p.arp;
  if([1,2,4].includes(p.arpRate)){
    csArpRate=p.arpRate;
    if(csArpRateSel) csArpRateSel.value=String(csArpRate);
  }
  if(typeof p.name==='string') csName=p.name.trim().slice(0,40);
  if(csNameInput) csNameInput.value=csName;
  csSyncArpUI();
  csSyncClickBtn();
}

/* ---------- share links: the whole progression rides in the hash ---------- */

// URL-safe base64 of {p:[[sym,beats]...], b:bpm, s:sound}; symbols are ASCII
// so btoa is safe. decode validates exactly like the local prefs loader
function csEncodeShare(){
  const json=JSON.stringify({
    p:PROG.map(c=>[c.sym, c.beats]),
    b:Math.round(bpm),
    s:soundPreset,
    n:csName || undefined,
    m:MARKERS.length ? MARKERS.map(x=>[x.beat, x.label]) : undefined,
  });
  return btoa(json).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function csDecodeShare(str){
  try{
    const b64=str.replace(/-/g,'+').replace(/_/g,'/');
    const d=JSON.parse(atob(b64+'='.repeat((4-b64.length%4)%4)));
    if(!d || !Array.isArray(d.p)) return null;
    const prog=d.p.filter(c=>
      Array.isArray(c) && typeof c[0]==='string' && parseChord(c[0]) &&
      Number.isInteger(c[1]) && c[1]>=1 && c[1]<=64
    ).slice(0,MAX_CHORDS).map(c=>[c[0].trim(), c[1]]);
    if(!prog.length) return null;
    const markers=Array.isArray(d.m)
      ? d.m.filter(x=>Array.isArray(x) && Number.isInteger(x[0]) && x[0]>=0 && typeof x[1]==='string' && x[1].trim())
          .slice(0,16).map(x=>[x[0], x[1].trim().slice(0,24)])
      : [];
    return {
      prog,
      bpm:Number.isFinite(d.b) ? Math.max(40, Math.min(240, Math.round(d.b))) : null,
      sound:SOUND_PRESETS[d.s] ? d.s : null,
      markers,
      name:(typeof d.n==='string' && d.n.trim()) ? d.n.trim().slice(0,40) : '',
    };
  }catch{
    return null;
  }
}

const csShareBtn=document.getElementById('cs-share');
const csSaveBtn=document.getElementById('cs-save');

// the whole progression as one shareable poster: every voice's glide across
// the full loop, chord names at the boundaries, the site's mark in the corner
function csRenderPoster(){
  const W=1600,H=900;
  const off=document.createElement('canvas');
  off.width=W; off.height=H;
  const c=off.getContext('2d');
  const g=c.createRadialGradient(W/2,H/2,0,W/2,H/2,W*0.7);
  g.addColorStop(0,theme.stage);
  g.addColorStop(1,theme.deep);
  c.fillStyle=g;
  c.fillRect(0,0,W,H);
  const td=totalDur();
  const yFor=m=>H*0.86-((m-40)/40)*H*0.72;
  const x0=W*0.08, x1=W*0.92;
  // a named progression gets its title set into the poster's sky
  if(csName){
    c.font='800 34px Figtree, sans-serif';
    c.fillStyle='rgba(238,240,243,0.92)';
    c.textAlign='center';
    c.fillText(csName, W/2, H*0.075);
    c.textAlign='left';
  }
  // chord boundaries + names across the full loop
  c.font='700 22px Figtree, sans-serif';
  let acc=0;
  for(let i=0;i<N;i++){
    const x=x0+(acc/totalBeats())*(x1-x0);
    acc+=PROG[i].beats;
    c.strokeStyle='rgba(245,182,70,0.18)';
    c.lineWidth=1.5;
    c.beginPath(); c.moveTo(x,H*0.10); c.lineTo(x,H*0.92); c.stroke();
    c.fillStyle='rgba(245,182,70,0.75)';
    c.fillText(PROG[i].sym, x+8, H*0.14);
  }
  // the five voice trajectories, sampled across the loop
  for(let v=0;v<5;v++){
    const col=theme.voices[v];
    c.strokeStyle=col;
    c.lineWidth=3.5;
    c.shadowColor=col;
    c.shadowBlur=16;
    c.beginPath();
    const steps=240;
    for(let s=0;s<=steps;s++){
      const t=(s/steps)*td;
      const x=x0+(s/steps)*(x1-x0);
      const y=yFor(noteAt(v,t));
      if(s===0) c.moveTo(x,y); else c.lineTo(x,y);
    }
    c.stroke();
  }
  c.shadowBlur=0;
  c.font='700 20px Figtree, sans-serif';
  c.fillStyle='rgba(238,240,243,0.5)';
  c.textAlign='right';
  c.fillText('scottbronder.com · chord studio', x1, H*0.965);
  c.textAlign='left';
  return off;
}

const csMidiBtn=document.getElementById('cs-midi');

// Standard MIDI File, format 0: one track, 480 ticks per quarter, tempo meta,
// then the same five voices per segment the engine plays — note-on at the
// block's start tick, note-off two ticks shy of the next (keeps re-attacks
// clean in DAWs). hand-rolled, no libraries
function csMidiVLQ(n){
  const bytes=[n&0x7f];
  n>>=7;
  while(n>0){ bytes.unshift((n&0x7f)|0x80); n>>=7; }
  return bytes;
}

function csEncodeMidi(){
  const PPQ=480;
  const mpqn=Math.round(60000000/bpm);
  const events=[{tick:0, bytes:[0xFF,0x51,0x03,(mpqn>>16)&0xff,(mpqn>>8)&0xff,mpqn&0xff]}];
  if(csName){
    // track name meta, ASCII-safe
    const ascii=csName.replace(/[^\x20-\x7E]/g,'').slice(0,40);
    if(ascii){
      events.push({tick:0, bytes:[0xFF,0x03,ascii.length, ...[...ascii].map(ch=>ch.charCodeAt(0)&0x7f)]});
    }
  }
  let start=0;
  PROG.forEach((c,i)=>{
    const on=Math.round(start*PPQ);
    const off=Math.max(on, Math.round((start+c.beats)*PPQ)-2);
    NOTES[i].forEach((m,v)=>{
      events.push({tick:on, bytes:[0x90, m&0x7f, v===4?100:88]});
      events.push({tick:off, bytes:[0x80, m&0x7f, 0]});
    });
    start+=c.beats;
  });
  events.sort((a,b)=>a.tick-b.tick);
  let prev=0;
  const track=[];
  events.forEach(ev=>{
    track.push(...csMidiVLQ(ev.tick-prev), ...ev.bytes);
    prev=ev.tick;
  });
  track.push(0x00, 0xFF, 0x2F, 0x00); // end of track
  const len=track.length;
  const bytes=[
    0x4D,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1, (PPQ>>8)&0xff, PPQ&0xff,
    0x4D,0x54,0x72,0x6B, (len>>>24)&0xff,(len>>>16)&0xff,(len>>>8)&0xff,len&0xff,
    ...track,
  ];
  return new Uint8Array(bytes);
}

if(csMidiBtn){
  csMidiBtn.addEventListener('click',()=>{
    if(N===0) return;
    const name='chord-studio-'+csFileSlug()+'.mid';
    const blob=new Blob([csEncodeMidi()], {type:'audio/midi'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),4000);
    if(csStatus) csStatus.textContent='MIDI saved — drop it into any DAW';
  });
}

if(csSaveBtn){
  csSaveBtn.addEventListener('click',()=>{
    if(N===0) return;
    const off=csRenderPoster();
    const name='chord-studio-'+csFileSlug()+'.png';
    const save=url=>{
      const a=document.createElement('a');
      a.href=url;
      a.download=name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if(url.startsWith('blob:')) setTimeout(()=>URL.revokeObjectURL(url),4000);
      if(csStatus) csStatus.textContent='image saved — your progression as neon lines';
    };
    if(off.toBlob) off.toBlob(b=>save(URL.createObjectURL(b)),'image/png');
    else save(off.toDataURL('image/png'));
  });
}
if(csShareBtn){
  csShareBtn.addEventListener('click',async ()=>{
    const url=location.origin+location.pathname+'#chord-studio~'+csEncodeShare();
    history.replaceState(null,'','#chord-studio~'+csEncodeShare());
    let copied=false;
    try{ await navigator.clipboard.writeText(url); copied=true; }catch{}
    if(csStatus) csStatus.textContent=copied
      ? 'link copied — it opens this exact progression'
      : 'link is in the address bar — copy it from there';
  });
}

/* ---------- key-based chord palette ---------- */

const keySelect=document.getElementById('keySelect');
const keyChords=document.getElementById('keyChords');
const modeSelect=document.getElementById('modeSelect');
const soundSelect=document.getElementById('soundSelect');
const csPresetsHost=document.getElementById('cs-presets');
let chordMode='triads';
let currentKey=KEYS.find(k=>k[0]==='G') || KEYS[0];

// one-click starting points, spelled as scale degrees so they transpose into
// whatever key (and mode) is selected; beats shape the feel — waltz in threes,
// the epic loop in long swells
const PRESETS=[
  {name:'pop punk', degrees:[0,4,5,3], beats:[4,4,4,4], sound:'symphony', title:'I–V–vi–IV'},
  {name:'doo-wop', degrees:[0,5,3,4], beats:[4,4,4,4], title:'I–vi–IV–V'},
  {name:'aeolian descent', degrees:[0,6,5,4], beats:[4,4,4,4], sound:'choir', title:'i–VII–VI–v — shines in a minor key'},
  {name:'waltz', degrees:[0,5,3,0], beats:[3,3,3,3], sound:'organ', title:'I–vi–IV–I in three-beat blocks'},
  {name:'slow epic', degrees:[0,2,3,5], beats:[8,8,8,8], sound:'orchestra', title:'I–iii–IV–vi — long swells for the big synths'},
  {name:'jazz turnaround', degrees:[1,4,0], beats:[4,4,8], mode:'sevenths', sound:'organ', title:'ii–V–I with 7ths'}
];

function renderPresets(){
  if(!csPresetsHost) return;
  csPresetsHost.innerHTML='';
  PRESETS.forEach(p=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='ghost-btn cs-preset';
    b.textContent=p.name;
    b.title=p.title+' — loads into the key you picked';
    b.addEventListener('click',()=>loadPreset(p));
    csPresetsHost.appendChild(b);
  });
  const roll=document.createElement('button');
  roll.type='button';
  roll.className='ghost-btn cs-preset';
  roll.textContent='surprise me';
  roll.title='roll a random progression in the key you picked';
  roll.addEventListener('click',()=>csRollProgression());
  csPresetsHost.appendChild(roll);
}

// weighted dice: grounded start, mostly-friendly middle, resolve to I/V/vi
function csRollProgression(){
  if(N>=MAX_CHORDS) return;
  const data=paletteData();
  const middle=[0,0,1,3,3,4,4,4,5,5];       // I ii IV V V V vi pool by degree
  const endings=[0,0,0,4,4,5];              // I I I V V vi
  const count=4+Math.floor(Math.random()*3); // 4-6 chords
  const degrees=[0];
  for(let i=1;i<count-1;i++){
    let d=middle[Math.floor(Math.random()*middle.length)];
    for(let tries=0; tries<3 && d===degrees[i-1]; tries++){
      d=middle[Math.floor(Math.random()*middle.length)];
    }
    degrees.push(d);
  }
  degrees.push(endings[Math.floor(Math.random()*endings.length)]);
  const prog=degrees.map(d=>({sym:data[d].sym, beats:Math.random()<0.2 ? 8 : 4}));
  mutateProg(()=>{ PROG.splice(0, PROG.length, ...prog); });
  if(csGridScroll) csGridScroll.scrollLeft=0;
  const first=csGridTrack.querySelector('.seq-block');
  if(first) first.scrollIntoView({block:'nearest', inline:'start', behavior:'smooth'});
  if(csStatus){
    const keyLabel=(keySelect && keySelect.selectedOptions[0]) ? keySelect.selectedOptions[0].textContent : '';
    csStatus.textContent='rolled — '+csRomanReadout()+' in '+keyLabel+' · roll again';
  }
}

function loadPreset(p){
  // presets are predictable: jazz brings its own 7ths, everything else
  // resets to triads so a leftover mode never surprises the next click
  const wantMode=p.mode||'triads';
  if(chordMode!==wantMode){
    chordMode=wantMode;
    if(modeSelect) modeSelect.value=wantMode;
    renderPalette();
  }
  // a preset is a full vibe — some bring their matched instrument too,
  // applied through the select's own change path (validates, persists,
  // and generation-guarded rebuilds if a patch is live)
  let soundChanged=false;
  if(p.sound && soundSelect && soundSelect.value!==p.sound){
    soundSelect.value=p.sound;
    soundSelect.dispatchEvent(new Event('change',{bubbles:true}));
    soundChanged=soundPreset===p.sound;
  }
  const data=paletteData();
  const prog=p.degrees.map((d,i)=>({sym:data[d].sym, beats:p.beats[i]||4}));
  mutateProg(()=>{
    PROG.splice(0, PROG.length, ...prog);
  });
  if(csGridScroll) csGridScroll.scrollLeft=0;
  // same feedback promise as palette adds: the loaded progression is on screen
  const first=csGridTrack.querySelector('.seq-block');
  if(first) first.scrollIntoView({block:'nearest', inline:'start', behavior:'smooth'});
  if(csStatus){
    const keyLabel=(keySelect && keySelect.selectedOptions[0]) ? keySelect.selectedOptions[0].textContent : '';
    const soundNote=soundChanged && SOUND_PRESETS[soundPreset]
      ? ' · '+SOUND_PRESETS[soundPreset].name.toLowerCase()+' on'
      : '';
    csStatus.textContent=p.name+' loaded — '+p.title+' in '+keyLabel+soundNote;
  }
}

// common-practice gravity, by scale degree: what wants to follow what
const NEXT_DEGREES={
  0:[4,5,3,1,2], // I -> V vi IV ii iii
  1:[4],         // ii -> V
  2:[5],         // iii -> vi
  3:[4,0],       // IV -> V I
  4:[0,5],       // V -> I vi
  5:[3,1,2],     // vi -> IV ii iii
  6:[0]          // vii -> I
};

function renderPalette(){
  if(!keyChords) return;
  keyChords.innerHTML='';
  csSyncCustomAdd();
  const data=paletteData();
  // the chart's last chord suggests where the music wants to go next
  let suggest=new Set();
  if(PROG.length){
    const lastSym=PROG[PROG.length-1].sym;
    const deg=data.findIndex(c=>c.sym===lastSym);
    if(deg>=0 && NEXT_DEGREES[deg]) suggest=new Set(NEXT_DEGREES[deg]);
  }
  data.forEach((c,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='key-chord'+(suggest.has(i) ? ' suggest' : '');
    b.title=suggest.has(i) ? 'Add '+c.sym+' — a natural next chord' : 'Add '+c.sym;
    b.innerHTML= c.sym + '<span>'+c.roman+'</span>';
    b.disabled=PROG.length>=MAX_CHORDS;
    // hover ghosts the chord into the neon before you commit to it
    b.addEventListener('mouseenter',()=>{
      if(playing || b.disabled) return;
      const voiced=voiceChords([c.sym]);
      if(voiced[0]){ csHoverView={sym:c.sym, notes:voiced[0].slice(0,4)}; draw(); }
    });
    b.addEventListener('mouseleave',()=>{ csHoverView=null; draw(); });
    b.addEventListener('click',()=>{
      if(PROG.length>=MAX_CHORDS) return;
      mutateProg(()=>{ PROG.push({sym:c.sym, beats:4}); });
      // land the fresh-card pulse on the newly added block and bring it into
      // view — nearest, so nothing moves when the chart is already visible
      renderGrid(null, PROG.length-1);
      const nb=csGridTrack.querySelector('.seq-block[data-idx="'+(PROG.length-1)+'"]');
      if(nb) nb.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
    });
    keyChords.appendChild(b);
  });
}

// any chord the voicing engine knows: root + quality, outside the key if needed
const csCustomRoot=document.getElementById('cs-custom-root');
const csCustomQ=document.getElementById('cs-custom-q');
const csCustomAdd=document.getElementById('cs-custom-add');
if(csCustomRoot && csCustomQ && csCustomAdd){
  NOTE_SHARP.forEach((n,i)=>{
    const o=document.createElement('option');
    o.value=String(i);
    o.textContent=n;
    csCustomRoot.appendChild(o);
  });
  const Q_NAMES={'':'major','m':'minor','dim':'dim','aug':'aug','sus4':'sus4','sus2':'sus2','6':'6','m6':'m6','7':'7','maj7':'maj7','m7':'m7','m7b5':'m7♭5','dim7':'dim7','add9':'add9','9':'9','maj9':'maj9','m9':'m9'};
  Object.keys(QUALITIES).forEach(q=>{
    const o=document.createElement('option');
    o.value=q;
    o.textContent=Q_NAMES[q]||q;
    csCustomQ.appendChild(o);
  });
  csCustomQ.value='';
  csCustomAdd.addEventListener('click',()=>{
    if(PROG.length>=MAX_CHORDS) return;
    const sym=NOTE_SHARP[Number(csCustomRoot.value)||0]+csCustomQ.value;
    if(!parseChord(sym)) return;
    mutateProg(()=>{ PROG.push({sym, beats:4}); });
    renderGrid(null, PROG.length-1);
    const nb=csGridTrack.querySelector('.seq-block[data-idx="'+(PROG.length-1)+'"]');
    if(nb) nb.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
    if(csStatus) csStatus.textContent=sym+' added — outside the key, but it sings';
  });
  csSyncCustomAdd();
}
function csSyncCustomAdd(){
  if(csCustomAdd) csCustomAdd.disabled=PROG.length>=MAX_CHORDS;
}

function paletteData(){
  const isMajor=!keySelect || keySelect.value.endsWith(':maj');
  const steps=isMajor?SCALE_STEPS:MINOR_STEPS;
  const set=CHORD_MODES[chordMode]||CHORD_MODES.triads;
  const quals=isMajor?set.maj:set.min;
  const romans=isMajor?ROMANS_MAJ:ROMANS_MIN;
  const names=currentKey[2]?NOTE_SHARP:NOTE_FLAT;
  return steps.map((s,i)=>({
    sym: names[(currentKey[1]+s)%12] + quals[i],
    roman: romans[i]
  }));
}

if(soundSelect){
  Object.keys(SOUND_PRESETS).forEach(k=>{
    const o=document.createElement('option');
    o.value=k;
    o.textContent=SOUND_PRESETS[k].name;
    soundSelect.appendChild(o);
  });
  soundSelect.value=soundPreset;
  soundSelect.addEventListener('change',()=>{
    soundPreset=SOUND_PRESETS[soundSelect.value] ? soundSelect.value : 'custom';
    saveCsPrefs();
    if(padVoices || toneReady) switchSound();
    // shopping for a timbre should be audible: while stopped, swell the chord
    // under the preview hairline in the new sound (the jam voice rebuilds
    // wearing it — switchSound tore the old one down)
    if(!playing && N>0 && !csJamHeld.size && window.Tone && Tone.PolySynth){
      const seg=posToSeg(cur).idx;
      const notes=NOTES[seg].slice(0,4).map(midiToFreq);
      csEnsureJam().then(j=>{
        if(!j || playing) return;
        try{ j.synth.triggerAttackRelease(notes, 1.2, Tone.now()+0.02, 0.8); }catch{}
      });
    }
  });
}

if(keySelect && keyChords && modeSelect){
  KEYS.forEach(k=>{
    const o=document.createElement('option');
    o.value=k[1]+':maj';
    o.textContent=k[0]+' major';
    keySelect.appendChild(o);
  });
  KEYS.forEach(k=>{
    const o=document.createElement('option');
    o.value=k[1]+':min';
    o.textContent=k[0]+' minor';
    keySelect.appendChild(o);
  });
  keySelect.value=currentKey[1]+':maj';
  keySelect.addEventListener('change',()=>{
    const pc=Number(keySelect.value.split(':')[0]);
    currentKey=KEYS.find(k=>k[1]===pc) || currentKey;
    renderPalette();
  });
  Object.keys(CHORD_MODES).forEach(k=>{
    const o=document.createElement('option');
    o.value=k;
    o.textContent=CHORD_MODES[k].name;
    modeSelect.appendChild(o);
  });
  modeSelect.value=chordMode;
  modeSelect.addEventListener('change',()=>{
    chordMode=CHORD_MODES[modeSelect.value]?modeSelect.value:'triads';
    renderPalette();
  });
}

/* ---------- jam keys: 1-9 sound the chart's chords under your fingers ---------- */

// a momentary polyphonic stab wearing the selected sound's timbre — separate
// from the transport's gliding voices so the two never fight. built lazily on
// the first press (a keydown is the audio gesture), rebuilt after sound swaps
let csJam=null;
const csJamHeld=new Map();
let csJamView=null; // {sym, notes} — the chord currently lighting up the graph
let csHoverView=null; // same shape, from hovering the palette

function csSetJamView(idx, midis){
  csJamView={sym:PROG[idx].sym, notes:midis || NOTES[idx].slice(0,4)};
  if(label) label.textContent=PROG[idx].sym;
  // light the matching block on the chart
  csGridTrack.querySelectorAll('.seq-block').forEach(el=>{
    el.classList.toggle('now', Number(el.dataset.idx)===idx);
  });
  draw();
}

function csClearJamView(){
  csJamView=null;
  csGridTrack.querySelectorAll('.seq-block.now').forEach(el=>el.classList.remove('now'));
  syncMeta(); // restores the preview label from the transport position
  draw();
}

function csJamOptions(){
  const P=SOUND_PRESETS[soundPreset] || SOUND_PRESETS.custom;
  const L=(P.layers||[]).find(l=>!l.partials) || (P.layers||[])[0] || {};
  const osc=L.partials
    ? {type:'fatsawtooth', count:3, spread:20}
    : {type:L.type||'fatsawtooth', count:L.count||3, spread:L.spread||20};
  return {
    maxPolyphony:8,
    oscillator:osc,
    // clamp the pad envelopes to something playable under fingers
    envelope:{attack:Math.min(0.12, L.attack||0.05), decay:0.2, sustain:L.sustain!==undefined?L.sustain:0.8, release:Math.min(1.5, L.release||1)},
  };
}

async function csEnsureJam(){
  if(!window.Tone || !Tone.PolySynth) return null;
  if(csJam) return csJam;
  try{
    await Tone.start();
    const synth=reg(new Tone.PolySynth(Tone.Synth, csJamOptions()));
    const rv=reg(new Tone.Reverb({decay:6, preDelay:0.02, wet:0.35}));
    try{ if(rv.ready) await rv.ready; }catch{}
    synth.connect(rv);
    rv.toDestination();
    synth.volume.value=-16;
    csJam={synth};
    return csJam;
  }catch{
    return null;
  }
}

window.addEventListener('keydown',async e=>{
  if(e.repeat) return;
  const k=e.key;
  if(!/^[0-9]$/.test(k)) return;
  // only while the chord studio is the tool on screen, and never while the
  // keyboard is doing something else (inputs, focused blocks, marker renames)
  if(!csGridTrack || document.querySelector('.tool-panel[data-tool="chord-studio"]').hidden) return;
  const t=e.target;
  if(t && t.closest && t.closest('input, select, textarea, .seq-block, .marker-flag, [contenteditable]')) return;
  if(N===0) return;
  const idx=(k==='0') ? 9 : Number(k)-1;
  if(idx>=N) return;
  if(playing){
    // live arranging: jump the loop so that chord starts now
    let start=0;
    for(let i=0;i<idx;i++) start+=PROG[i].beats;
    cur=start*60/bpm;
    csFollow=true;
    sfLastSegIdx=-1;
    csNowIdx=-1;
    csUpdateNow(cur);
    csUpdatePlayhead();
    syncMeta(); updateSynth(); draw();
    return;
  }
  const j=await csEnsureJam();
  if(!j) return;
  // shift jabs the chord up an octave — audition pads in register
  const oct=e.shiftKey ? 12 : 0;
  const midis=NOTES[idx].slice(0,4).map(m=>m+oct);
  const notes=midis.map(midiToFreq);
  try{ j.synth.triggerAttack(notes, Tone.now(), 0.9); }catch{}
  csJamHeld.set(k,notes);
  csSetJamView(idx, midis);
});

window.addEventListener('keyup',e=>{
  const notes=csJamHeld.get(e.key);
  if(!notes) return;
  csJamHeld.delete(e.key);
  if(csJam){ try{ csJam.synth.triggerRelease(notes); }catch{} }
  if(csJamHeld.size===0) csClearJamView();
});

// space runs the transport from anywhere in the tool — but never steals it
// from a focused control (buttons, inputs, blocks all own their space)
window.addEventListener('keydown',e=>{
  if(e.key!==' ' || e.repeat) return;
  if(!csGridTrack || document.querySelector('.tool-panel[data-tool="chord-studio"]').hidden) return;
  const t=e.target;
  if(t && t.closest && t.closest('button, input, select, textarea, a, [contenteditable], .seq-block, .marker-flag')) return;
  e.preventDefault();
  if(!playBtn.disabled) setPlaying(!playing);
});

/* ---------- click track: lookahead-scheduled ticks over the transport ---------- */

let csClickOn=false;
let csClickSynth=null;
let csClickAnchor=null; // {at, pos} maps transport seconds to audio time
let csClickNextPos=null; // transport time of the next beat to schedule
let csClickLastCur=null;

/* ---------- arpeggio motion: the chords learn to move ---------- */

let csArpOn=false;
let csArpRate=2; // notes per beat: 1 quarters, 2 eighths, 4 sixteenths
let csArpSynth=null;
let csArpAnchor=null;
let csArpNextPos=null;
let csArpSlot=0;
const CS_ARP_PATTERN=[0,1,2,3,2,1]; // up and down the voices

async function csEnsureArp(){
  if(csArpSynth || !window.Tone || !Tone.Synth) return csArpSynth;
  try{
    await Tone.start();
    csArpSynth=new Tone.Synth({
      oscillator:{type:'triangle'},
      envelope:{attack:0.005, decay:0.28, sustain:0.12, release:0.4},
    });
    const echo=new Tone.FeedbackDelay({delayTime:'8n.', feedback:0.28, wet:0.22});
    csArpSynth.connect(echo);
    echo.toDestination();
    csArpSynth.volume.value=-14;
  }catch{
    csArpSynth=null;
  }
  return csArpSynth;
}

function csArpSchedule(){
  if(!csArpOn || N===0 || !window.Tone) return;
  if(!csArpSynth){ csEnsureArp(); return; }
  if(csArpAnchor && csClickLastCur!==null && Math.abs(cur-csClickLastCur)>0.25){
    csArpAnchor=null; // re-anchor on seeks, like the click
  }
  if(!csArpAnchor){
    csArpAnchor={at:Tone.now()+0.05, pos:cur};
    const step=60/bpm/csArpRate;
    csArpNextPos=Math.ceil((cur-step)*bpm/60*csArpRate+1e-6)*step;
    csArpSlot=0;
  }
  const horizon=Tone.now()+0.3;
  const step=60/bpm/csArpRate;
  while(csArpAnchor.at + (csArpNextPos-csArpAnchor.pos) < horizon){
    const t=Math.max(csArpAnchor.at + (csArpNextPos-csArpAnchor.pos), Tone.now()+0.01);
    const seg=posToSeg(csArpNextPos);
    const chord=NOTES[seg ? seg.idx : 0];
    if(chord){
      const voice=CS_ARP_PATTERN[csArpSlot % CS_ARP_PATTERN.length];
      try{ csArpSynth.triggerAttackRelease(midiToFreq(chord[voice]+12), '16n', t, 0.7); }catch{}
    }
    csArpSlot++;
    csArpNextPos+=step;
  }
}

async function csEnsureClick(){
  if(csClickSynth || !window.Tone || !Tone.MembraneSynth) return csClickSynth;
  try{
    await Tone.start();
    // separate lifecycle from the patch graph: a sound swap must not kill the metronome
    csClickSynth=new Tone.MembraneSynth({pitchDecay:0.008, octaves:4, envelope:{attack:0.001, decay:0.09, sustain:0}});
    csClickSynth.volume.value=-8;
    csClickSynth.toDestination();
  }catch{
    csClickSynth=null;
  }
  return csClickSynth;
}

function csClickSchedule(){
  if(!csClickOn || !window.Tone) return;
  if(!csClickSynth){ csEnsureClick(); return; } // restored pref: build on the play gesture
  // a seek shows up as a discontinuity: re-anchor the audio-time mapping
  if(csClickAnchor && csClickLastCur!==null && Math.abs(cur-csClickLastCur)>0.25){
    csClickAnchor=null;
  }
  csClickLastCur=cur;
  if(!csClickAnchor){
    csClickAnchor={at:Tone.now()+0.05, pos:cur};
    csClickNextPos=Math.ceil(cur*bpm/60+1e-6)*60/bpm;
  }
  const horizon=Tone.now()+0.3;
  while(csClickAnchor.at + (csClickNextPos-csClickAnchor.pos) < horizon){
    const t=Math.max(csClickAnchor.at + (csClickNextPos-csClickAnchor.pos), Tone.now()+0.01);
    const beatIdx=Math.round(csClickNextPos*bpm/60);
    const down=beatIdx%BEATS_PER_MEASURE===0;
    try{ csClickSynth.triggerAttackRelease(down?1900:1250, 0.03, t, down?0.9:0.45); }catch{}
    csClickNextPos+=60/bpm;
  }
}

if(csNameInput){
  csNameInput.addEventListener('input',()=>{
    csName=csNameInput.value.trim();
    saveCsPrefs();
  });
}

const csArpBtn=document.getElementById('cs-arp');
const csArpRateSel=document.getElementById('cs-arp-rate');
function csSyncArpUI(){
  if(csArpBtn){
    csArpBtn.setAttribute('aria-pressed', String(csArpOn));
    csArpBtn.textContent=csArpOn?'On':'Off';
  }
}
if(csArpBtn){
  csArpBtn.addEventListener('click', async ()=>{
    csArpOn=!csArpOn;
    csSyncArpUI();
    if(csArpOn) await csEnsureArp();
    csArpAnchor=null;
    saveCsPrefs();
  });
}
if(csArpRateSel){
  csArpRateSel.addEventListener('change',()=>{
    csArpRate=Number(csArpRateSel.value)||2;
    csArpAnchor=null; // re-grid at the new subdivision
    saveCsPrefs();
  });
}

const csClickBtn=document.getElementById('cs-click');
function csSyncClickBtn(){
  if(!csClickBtn) return;
  csClickBtn.setAttribute('aria-pressed', String(csClickOn));
  csClickBtn.textContent=csClickOn?'On':'Off';
}
if(csClickBtn){
  csClickBtn.addEventListener('click', async ()=>{
    csClickOn=!csClickOn;
    csSyncClickBtn();
    if(csClickOn) await csEnsureClick();
    csClickAnchor=null;
    saveCsPrefs();
  });
}

/* ---------- level meter: everything the tool makes, in one bar ---------- */

let csMeter=null;
const csMeterFill=document.getElementById('cs-meter-fill');

function csUpdateMeter(){
  if(!csMeterFill) return;
  if(!csMeter){
    if(window.Tone && Tone.Meter){
      try{
        csMeter=new Tone.Meter();
        Tone.Destination.connect(csMeter);
      }catch{
        return;
      }
    }else{
      return;
    }
  }
  const v=csMeter.getValue();
  const db=(typeof v==='number' && Number.isFinite(v)) ? v : -60;
  const pct=Math.max(0, Math.min(1, 1+db/60));
  csMeterFill.style.width=(pct*100).toFixed(1)+'%';
}

function csResetMeter(){
  if(csMeterFill) csMeterFill.style.width='0%';
}

function tick(now){
  const dt=Math.min(0.05,(now-last)/1000);
  last=now;
  // paused = nothing on the canvas or transport can change; edits and scrubbing
  // redraw through their own listeners, so idle frames skip the paint entirely
  if(playing){
    playClock+=dt;
    cur=csWrapWindow(cur+dt);
    syncMeta();
    csUpdateNow(cur);
    csUpdatePlayhead();
    draw();
    updateSynth();
    csClickSchedule();
    csArpSchedule();
    csUpdateMeter();
  }else if(csJamView || csHoverView){
    draw(); // the freeze-frame breathes (glow pulse) while held or hovered
    csUpdateMeter();
  }
  requestAnimationFrame(tick);
}

// the idle overview is a scrub surface: click the neon to move the preview
canvas.addEventListener('click',e=>{
  if(playing || N===0 || csJamView) return;
  const rect=canvas.getBoundingClientRect();
  const frac=Math.min(1, Math.max(0, (e.clientX-rect.left-rect.width*0.06)/(rect.width*0.88)));
  const beat=frac*totalBeats();
  cur=csWrapWindow(beat*60/bpm);
  sfLastSegIdx=-1;
  csNowIdx=-1;
  csUpdateNow(cur);
  syncMeta();
  draw();
});

window.addEventListener('resize', draw);
// idle has no frame loop: re-render whenever the canvas box itself changes
// size (late layout, or the tool's panel being shown again)
if(window.ResizeObserver){
  new ResizeObserver(()=>draw()).observe(canvas);
}

// boot: a shared link (hash payload) wins over the saved progression; the
// visitor's own work is backed up first and a restore pill offered, and the
// payload is stripped so a refresh keeps the progression from local storage
let csSharedLoaded=false;
let csFirstVisit=false;
if(csGridTrack){
  const m=/^#chord-studio~([A-Za-z0-9\-_]+)/.exec(location.hash);
  const shared=m ? csDecodeShare(m[1]) : null;
  // captured before anything saves: the boot render persists prefs, which
  // would otherwise erase the very signal we're testing for
  try{ csFirstVisit=!shared && !localStorage.getItem(CS_STORE_KEY); }catch{}
  if(shared){
    try{
      const prev=localStorage.getItem(CS_STORE_KEY);
      if(prev) localStorage.setItem(CS_STORE_KEY+'Backup', prev);
    }catch{}
    PROG=shared.prog.map(c=>({sym:c[0], beats:c[1]}));
    if(shared.markers.length){
      const seen=new Set();
      MARKERS=shared.markers
        .filter(x=>!seen.has(x[0]) && seen.add(x[0]))
        .sort((a,b)=>a[0]-b[0])
        .map((x,i)=>({beat:x[0], label:x[1], color:MARKER_COLORS[i%MARKER_COLORS.length]}));
    }
    if(shared.bpm){ bpm=shared.bpm; tempo.value=String(bpm); }
    if(shared.sound) soundPreset=shared.sound;
    csName=shared.name || '';
    if(csNameInput) csNameInput.value=csName;
    history.replaceState(null,'','#chord-studio');
    csSharedLoaded=true;
    const rb=document.getElementById('cs-restore');
    if(rb && localStorage.getItem(CS_STORE_KEY+'Backup')) rb.hidden=false;
  }else{
    loadCsPrefs();
  }
  if(soundSelect) soundSelect.value=soundPreset;
}

// the lifeline: swap the visitor's own saved work back over the shared one
const csRestoreBtn=document.getElementById('cs-restore');
if(csRestoreBtn){
  csRestoreBtn.addEventListener('click',()=>{
    let p=null;
    try{ p=JSON.parse(localStorage.getItem(CS_STORE_KEY+'Backup')||'null'); }catch{}
    if(!p || !Array.isArray(p.prog)) return;
    const prog=p.prog.filter(c=>
      c && typeof c.sym==='string' && parseChord(c.sym) &&
      Number.isInteger(c.beats) && c.beats>=1 && c.beats<=64
    ).slice(0,MAX_CHORDS).map(c=>({sym:c.sym.trim(), beats:c.beats}));
    if(!prog.length) return;
    let markers=[];
    if(Array.isArray(p.markers)){
      const seen=new Set();
      markers=p.markers.filter(m=>
        m && Number.isInteger(m.beat) && m.beat>=0 && !seen.has(m.beat) && seen.add(m.beat) &&
        typeof m.label==='string' && m.label.trim()
      ).map(m=>({
        beat:m.beat,
        label:m.label.trim().slice(0,24),
        color:/^#[0-9a-f]{6}$/i.test(m.color||'') ? m.color : null,
      })).sort((a,b)=>a.beat-b.beat);
      markers.forEach((m,i)=>{
        if(!m.color) m.color=MARKER_COLORS[i%MARKER_COLORS.length];
      });
    }
    mutateProg(()=>{
      PROG.splice(0, PROG.length, ...prog);
      MARKERS.splice(0, MARKERS.length, ...markers);
    });
    if(Number.isFinite(p.bpm)){
      tempo.value=String(Math.max(40, Math.min(240, Math.round(p.bpm))));
      tempo.dispatchEvent(new Event('input',{bubbles:true}));
    }
    if(SOUND_PRESETS[p.sound] && soundSelect.value!==p.sound){
      soundSelect.value=p.sound;
      soundSelect.dispatchEvent(new Event('change',{bubbles:true}));
    }
    try{ localStorage.removeItem(CS_STORE_KEY+'Backup'); }catch{}
    csRestoreBtn.hidden=true;
    if(csStatus) csStatus.textContent='your progression is back';
  });
}
N=PROG.length;
NOTES=N?voiceChords(PROG.map(c=>c.sym)):[];
renderGrid();
renderPalette();
renderPresets();
csIdleStatus();
csSyncUndo();
syncMeta();
setPlaying(false);
draw();
if(csSharedLoaded && csStatus){
  csStatus.textContent='shared progression loaded — '+PROG.length+' chord'+(PROG.length>1?'s':'');
}
// first visit: the presets, jam keys and sharing hide behind a tiny "?" —
// open the guide for anyone who has never saved a progression here.
// deferred a tick: the generic guide toggles are wired by tools.html's
// inline script, which runs after this file
if(csFirstVisit){
  setTimeout(()=>{
    const btn=document.querySelector('.tool-guide-btn[aria-controls="guide-chord-studio"]');
    if(btn && btn.getAttribute('aria-expanded')==='false') btn.click();
  },0);
}
requestAnimationFrame(tick);

// tab switcher hook: leaving the chord studio stops playback
window.csStopPlayback=()=>setPlaying(false);
