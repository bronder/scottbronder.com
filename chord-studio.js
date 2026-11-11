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

function voiceChords(symbols){
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
function fmtSec(s){ return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function syncMeta(){
  const td=totalDur();
  const pos=((cur%td)+td)%td;
  time.textContent=fmtSec(pos)+' / '+fmtSec(td);
  // announce position as time, matching the visible readout — a bare range
  // input would otherwise say percentages
  scrub.setAttribute('aria-valuetext', fmtSec(pos)+' of '+fmtSec(td));
  scrub.max=String(Math.max(1,Math.round(td)));
  scrub.value=String(Math.min(Number(scrub.max), Math.round(pos)));
  const chord=(N>0 && PROG[posToSeg(pos).idx]) ? PROG[posToSeg(pos).idx].sym : '—';
  if(label) label.textContent=chord;
}

// how much of each segment is spent sweeping to the next chord
function sweepDur(b){ return Math.min(1.8, b*0.45); }

function noteAt(voice,t,noIntro,sessT){
  if(N===0) return 60;
  const td=totalDur();
  const tt=((t%td)+td)%td;
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

function setPlaying(on){
  playing=on;
  const chip=document.querySelector('.visual-label');
  if(chip){
    chip.style.opacity=on?'0':'';
    // faded from sight while playing — take it out of the tree too, its
    // "silent preview" wording is stale mid-playback
    chip.setAttribute('aria-hidden', on?'true':'false');
  }
  if(on){
    playClock=0;
    if(introSweep) cur=0;
    ensureSynth();
    if(audioCtx && audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
    csNowIdx=-1;
    csUpdateNow(cur);
  }else{
    releaseAll();
    csClearNow();
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
  cur=Number(scrub.value)||0;
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
const csUndoBtn=document.getElementById('cs-undo');
const csMenuBtn=document.getElementById('cs-menu-btn');
const csMenuEl=document.getElementById('cs-menu');
const csClearBtn=document.getElementById('cs-clear');
let csHistory=[];
let csNowIdx=-1;
let csDrag=null;
let csMdrag=null;

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

function csIdleStatus(){
  if(!csStatus) return;
  csStatus.textContent=PROG.length
    ? PROG.length+' chord'+(PROG.length>1?'s':'')+' · '+totalBeats()+' beats'
    : '';
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

function csUpdatePlayhead(){
  if(!csPlayheadEl) return;
  if(!playing || N===0){
    csPlayheadEl.style.display='none';
    return;
  }
  csPlayheadEl.style.display='block';
  const beat=((cur*bpm/60)%totalBeats()+totalBeats())%totalBeats();
  csPlayheadEl.style.left=(beat*CS_PX_BEAT)+'px';
}

// nothing to play means no transport: the sibling tools disable their play
// buttons on an empty progression too
function csSyncPlayEnabled(){
  if(playBtn) playBtn.disabled = N===0;
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
    '. Press Delete to remove.');

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
  const td=totalDur();
  cur=Math.min(Math.max(0,beatToPos(m.beat)), Math.max(0,td-0.001));
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
}

/* ---------- share links: the whole progression rides in the hash ---------- */

// URL-safe base64 of {p:[[sym,beats]...], b:bpm, s:sound}; symbols are ASCII
// so btoa is safe. decode validates exactly like the local prefs loader
function csEncodeShare(){
  const json=JSON.stringify({
    p:PROG.map(c=>[c.sym, c.beats]),
    b:Math.round(bpm),
    s:soundPreset,
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
    return {
      prog,
      bpm:Number.isFinite(d.b) ? Math.max(40, Math.min(240, Math.round(d.b))) : null,
      sound:SOUND_PRESETS[d.s] ? d.s : null,
    };
  }catch{
    return null;
  }
}

const csShareBtn=document.getElementById('cs-share');
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
  {name:'pop punk', degrees:[0,4,5,3], beats:[4,4,4,4], title:'I–V–vi–IV'},
  {name:'doo-wop', degrees:[0,5,3,4], beats:[4,4,4,4], title:'I–vi–IV–V'},
  {name:'aeolian descent', degrees:[0,6,5,4], beats:[4,4,4,4], title:'i–VII–VI–v — shines in a minor key'},
  {name:'waltz', degrees:[0,5,3,0], beats:[3,3,3,3], title:'I–vi–IV–I in three-beat blocks'},
  {name:'slow epic', degrees:[0,2,3,5], beats:[8,8,8,8], title:'I–iii–IV–vi — long swells for the big synths'},
  {name:'jazz turnaround', degrees:[1,4,0], beats:[4,4,8], mode:'sevenths', title:'ii–V–I with 7ths'}
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
    csStatus.textContent=p.name+' loaded — '+p.title+' in '+keyLabel;
  }
}

function renderPalette(){
  if(!keyChords) return;
  keyChords.innerHTML='';
  paletteData().forEach(c=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='key-chord';
    b.title='Add '+c.sym;
    b.innerHTML= c.sym + '<span>'+c.roman+'</span>';
    b.disabled=PROG.length>=MAX_CHORDS;
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
    sfLastSegIdx=-1;
    csNowIdx=-1;
    csUpdateNow(cur);
    csUpdatePlayhead();
    syncMeta(); updateSynth(); draw();
    return;
  }
  const j=await csEnsureJam();
  if(!j) return;
  const notes=NOTES[idx].slice(0,4).map(midiToFreq);
  try{ j.synth.triggerAttack(notes, Tone.now(), 0.9); }catch{}
  csJamHeld.set(k,notes);
});

window.addEventListener('keyup',e=>{
  const notes=csJamHeld.get(e.key);
  if(!notes) return;
  csJamHeld.delete(e.key);
  if(csJam){ try{ csJam.synth.triggerRelease(notes); }catch{} }
});

function tick(now){
  const dt=Math.min(0.05,(now-last)/1000);
  last=now;
  // paused = nothing on the canvas or transport can change; edits and scrubbing
  // redraw through their own listeners, so idle frames skip the paint entirely
  if(playing){
    playClock+=dt;
    cur=(cur+dt)%totalDur();
    syncMeta();
    csUpdateNow(cur);
    csUpdatePlayhead();
    draw();
    updateSynth();
  }
  requestAnimationFrame(tick);
}

window.addEventListener('resize', draw);

// boot: a shared link (hash payload) wins over the saved progression; the
// visitor's own work is backed up first, and the payload is stripped so a
// refresh keeps the progression from local storage like any other session
if(csGridTrack){
  const m=/^#chord-studio~([A-Za-z0-9\-_]+)/.exec(location.hash);
  const shared=m ? csDecodeShare(m[1]) : null;
  if(shared){
    try{
      const prev=localStorage.getItem(CS_STORE_KEY);
      if(prev) localStorage.setItem(CS_STORE_KEY+'Backup', prev);
    }catch{}
    PROG=shared.prog.map(c=>({sym:c[0], beats:c[1]}));
    if(shared.bpm){ bpm=shared.bpm; tempo.value=String(bpm); }
    if(shared.sound) soundPreset=shared.sound;
    history.replaceState(null,'','#chord-studio');
  }else{
    loadCsPrefs();
  }
  if(soundSelect) soundSelect.value=soundPreset;
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
requestAnimationFrame(tick);

// tab switcher hook: leaving the chord studio stops playback
window.csStopPlayback=()=>setPlaying(false);
