const tempo=document.getElementById('tempo');
const beats=document.getElementById('beats');
const playBtn=document.getElementById('playBtn');
const scrub=document.getElementById('scrub');
const time=document.getElementById('time');
const label=document.querySelector('.visual-label strong');
const canvas=document.getElementById('viz');
const ctx=canvas.getContext('2d');

const THEMES={
  site:{name:'Site',stage:'#10141b',deep:'#0b0d11',voices:['#f5b646','#7aa2f7','#34d399','#ff8e3c','#eef0f3']}
};
let themeKey='site';
let theme=THEMES.site;
function applyTheme(){
  themeKey='site';
  theme=THEMES.site;
  draw();
}

let CHORDS=['G','B','C','Cm'];
let NOTES=[[71,67,62,59,43],[71,66,63,59,47],[72,67,64,60,48],[72,67,63,60,48]];
let N=CHORDS.length;
const MAX_CHORDS=8;

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
let beatsPerChord=Number(beats.value||4);
let playing=false;
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

function barDur(){ return beatsPerChord*60/bpm; }
function totalDur(){ return N>0 ? barDur()*N : barDur(); }
function fmtSec(s){ return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'); }
function syncMeta(){
  const td=totalDur();
  const pos=((cur%td)+td)%td;
  time.textContent=fmtSec(pos)+' / '+fmtSec(td);
  scrub.max=String(Math.max(1,Math.round(td)));
  scrub.value=String(Math.min(Number(scrub.max), Math.round(pos)));
  const chord=CHORDS[Math.floor(pos/barDur())%N] || '—';
  if(label) label.textContent=chord;
}

// how much of each bar is spent sweeping to the next chord
function sweepDur(b){ return Math.min(1.8, b*0.45); }

function noteAt(voice,t,b){
  if(N===0) return 60;
  const cycle=b*N;
  let tt=((t%cycle)+cycle)%cycle;
  const idx=Math.min(N-1, Math.floor(tt/b));
  const local=tt-idx*b;
  const from=NOTES[idx][voice];
  const to=NOTES[(idx+1)%N][voice];
  const trans=sweepDur(b);
  const hold=b-trans;
  if(local<=hold) return from;
  const p=(local-hold)/trans;
  const e=p*p*(3-2*p);
  return from + (to-from)*e;
}

function midiToFreq(m){ return 440 * Math.pow(2,(m-69)/12); }

// Sampled real-instrument layers: FluidR3_GM soundfonts (GPL) loaded lazily from
// the gleitz MIDI.js mirror only when a sampled preset is used. Real players
// re-articulate on each chord change, so samples trigger at bar boundaries on
// top of the gliding synth pad underneath; the optional harp sweeps upward.
let sfScripts={};
let sfCache={};
let sfBus=null;
let sfLastBarIdx=-1;

function ensureSoundfont(inst){
  if(!sfScripts[inst]){
    const tag=document.createElement('script');
    tag.src='https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/'+inst+'-mp3.js';
    document.head.appendChild(tag);
    sfScripts[inst]=tag;
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
  const b=barDur();
  const idx=Math.floor(pos/b)%N;
  const notes=(NOTES[idx]||[]).slice(0,4);
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
  const P=SOUND_PRESETS[soundPreset] || SOUND_PRESETS.custom;
  await Tone.start();
  const reverb=reg(new Tone.Reverb({decay:P.reverb.decay, preDelay:0.03, wet:P.reverb.wet}));
  try{ if(reverb.ready) await reverb.ready; }catch{}
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

// swap patches live: release, dispose every node, rebuild with the new preset
async function switchSound(){
  const wasPlaying=playing;
  releaseAll();
  await new Promise(r=>setTimeout(r,120));
  toneNodes.forEach(n=>{try{n.dispose();}catch{}});
  toneNodes.length=0;
  sfCache={}; sfLastBarIdx=-1; sfBus=null;
  padVoices=null; bassVoice=null; subVoice=null; shimVoices=null;
  sweepEQ=null; sweepLP=null; toneMaster=null; toneReady=null; sweepUp=false; voicesActive=false;
  if(wasPlaying) ensureSynth();
}

function attackAll(){
  if(!padVoices || N===0) return;
  const b=barDur();
  const td=totalDur();
  const pos=((cur%td)+td)%td;
  padVoices.forEach(v=>v.attack(midiToFreq(noteAt(v.tone,pos,b))));
  bassVoice.triggerAttack(midiToFreq(noteAt(4,pos,b)));
  if(subVoice) subVoice.triggerAttack(midiToFreq(noteAt(4,pos,b)-12));
  if(shimVoices) shimVoices.forEach((v,i)=>v.triggerAttack(midiToFreq(noteAt(i,pos,b)+12)));
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
      // while the chords are sweeping, open the top end and lift the shimmer
      const b0=barDur();
      const local=((cur% b0)+b0)%b0;
      const gliding=local > b0-sweepDur(b0);
      if(gliding!==sweepUp && sweepEQ && sweepLP){
        sweepUp=gliding;
        sweepEQ.gain.rampTo(gliding?5:0, 0.25);
        shimVoices.forEach(v=>v.volume.rampTo(gliding?P.shimmer+5:P.shimmer, 0.3));
        // the whaa: resonant lowpass snaps open through the shift, eases shut after
        sweepLP.frequency.rampTo(gliding?P.wah.peak:P.wah.base, gliding?0.18:0.6);
      }
      const b=barDur();
      const td=totalDur();
      const pos=((cur%td)+td)%td;
      // real instruments re-articulate at each chord onset (bar boundary)
      if(P.sampled && sfBus){
        const barIdx=Math.floor(pos/b);
        if(barIdx!==sfLastBarIdx){ sfLastBarIdx=barIdx; sfTriggerChord(P.sampled, pos); }
      }
      padVoices.forEach(vv=>{
        const f=midiToFreq(noteAt(vv.tone,pos,b));
        if(Number.isFinite(f)) vv.setNote(f);
      });
      const bf=midiToFreq(noteAt(4,pos,b));
      if(Number.isFinite(bf)) bassVoice.setNote(bf);
      if(subVoice){
        const sf=midiToFreq(noteAt(4,pos,b)-12);
        if(Number.isFinite(sf)) subVoice.setNote(sf);
      }
      if(shimVoices){
        for(let v=0;v<shimVoices.length;v++){
          const sf=midiToFreq(noteAt(v,pos,b)+12);
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
  const b=barDur();
  const td=totalDur();
  const pos=((cur%td)+td)%td;
  const now=audioCtx.currentTime;
  masterGain.gain.setTargetAtTime((playing && N>0) ? 0.22 : 0.0001, now, 0.03);
  for(let v=0;v<synthVoices.length;v++){
    const m=noteAt(v,pos,b);
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

  const b=barDur();
  const td=b*N;
  const yFor=m=>h*0.88 - ((m-40)/40)*h*0.78;
  const pxPerBar=w/8;
  const pxPerSec=pxPerBar/b;
  const playX=w*0.5;
  const pos=N>0 ? ((cur%td)+td)%td : 0;

  ctx.font=`700 ${13*dpr}px Figtree, sans-serif`;
  const first=Math.floor((pos - playX/pxPerSec)/b);
  const lastI=Math.ceil((pos + (w-playX)/pxPerSec)/b);
  for(let i=first;i<=lastI;i++){
    const x=playX + (i*b - pos)*pxPerSec;
    if(x<-20 || x>w+20) continue;
    ctx.strokeStyle=theme.voices[0]+'33';
    ctx.lineWidth=1*dpr;
    ctx.beginPath(); ctx.moveTo(x,h*0.06); ctx.lineTo(x,h); ctx.stroke();
    if(N>0){
      ctx.fillStyle=theme.voices[0]+'99';
      ctx.fillText(CHORDS[((i%N)+N)%N], x+6*dpr, h*0.06);
    }
  }

  for(let v=0;v<5;v++){
    const col=theme.voices[v];
    ctx.beginPath();
    for(let x=0;x<=playX;x+=3*dpr){
      const tt=pos - (playX-x)/pxPerSec;
      const y=yFor(noteAt(v,tt,b));
      if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.strokeStyle=col;
    ctx.lineWidth=3*dpr;
    ctx.shadowColor=col;
    ctx.shadowBlur=14*dpr;
    ctx.stroke();
    const py=yFor(noteAt(v,pos,b));
    ctx.beginPath();
    ctx.arc(playX,py,7*dpr,0,Math.PI*2);
    ctx.fillStyle=col;
    ctx.fill();
  }
  ctx.shadowBlur=0;
  if(N>0){
    const nowIdx=Math.floor(pos/b)%N;
    ctx.fillStyle=theme.voices[0];
    ctx.font=`800 ${28*dpr}px Figtree, sans-serif`;
    ctx.fillText(CHORDS[nowIdx], playX+18*dpr, yFor(noteAt(0,pos,b))-14*dpr);
  }
}

function setPlaying(on){
  playing=on;
  if(on){
    ensureSynth();
    if(audioCtx && audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
  }else{
    releaseAll();
  }
  playBtn.innerHTML = on
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  updateSynth();
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
stepBtn('beatsDown','beats',-1);
stepBtn('beatsUp','beats',1);
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
tempo.addEventListener('input',()=>{ bpm=Number(tempo.value); syncMeta(); updateSynth(); draw(); });
beats.addEventListener('input',()=>{ beatsPerChord=Number(beats.value); syncMeta(); updateSynth(); draw(); });
playBtn.addEventListener('click',()=> setPlaying(!playing));
scrub.addEventListener('input',()=>{ cur=Number(scrub.value)||0; syncMeta(); updateSynth(); draw(); });

// Editable progression + key-based chord palette
const chordChips=document.getElementById('chordChips');
const keySelect=document.getElementById('keySelect');
const keyChords=document.getElementById('keyChords');
const modeSelect=document.getElementById('modeSelect');
const clearChords=document.getElementById('clearChords');
const themeSelect=document.getElementById('themeSelect');
const soundSelect=document.getElementById('soundSelect');
let chordMode='triads';
let currentKey=KEYS.find(k=>k[0]==='G') || KEYS[0];

function rebuild(){
  N=CHORDS.length;
  if(N===0){
    NOTES=[];
    cur=0;
    if(playing) releaseAll();
  }else{
    NOTES=voiceChords(CHORDS);
    const td=totalDur();
    cur=((cur%td)+td)%td;
    if(playing && padVoices && !voicesActive) attackAll();
  }
  renderChips();
  renderPalette();
  syncMeta();
  updateSynth();
  draw();
}

function renderChips(){
  chordChips.innerHTML='';
  if(CHORDS.length===0){
    const s=document.createElement('span');
    s.className='empty-chords';
    s.textContent='No chords — pick a key below';
    chordChips.appendChild(s);
    return;
  }
  CHORDS.forEach((sym,i)=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='chip';
    b.title='Remove '+sym;
    b.innerHTML= sym + '<span class="x" aria-hidden="true">×</span>';
    b.addEventListener('click',()=>{ CHORDS.splice(i,1); rebuild(); });
    chordChips.appendChild(b);
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

function renderPalette(){
  if(!keyChords) return;
  keyChords.innerHTML='';
  paletteData().forEach(c=>{
    const b=document.createElement('button');
    b.type='button';
    b.className='key-chord';
    b.title='Add '+c.sym;
    b.innerHTML= c.sym + '<span>'+c.roman+'</span>';
    b.disabled=CHORDS.length>=MAX_CHORDS;
    b.addEventListener('click',()=>{ if(CHORDS.length<MAX_CHORDS){ CHORDS.push(c.sym); rebuild(); } });
    keyChords.appendChild(b);
  });
}

if(clearChords){
  clearChords.addEventListener('click',()=>{ CHORDS=[]; rebuild(); });
}

if(themeSelect){
  applyTheme();
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
    if(padVoices || toneReady) switchSound();
  });
}

if(chordChips && keySelect && keyChords && modeSelect){
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
  renderChips();
  renderPalette();
}

function tick(now){
  const dt=Math.min(0.05,(now-last)/1000);
  last=now;
  if(playing){
    cur=(cur+dt)%totalDur();
  }
  syncMeta();
  draw();
  updateSynth();
  requestAnimationFrame(tick);
}

window.addEventListener('resize', draw);
syncMeta();
setPlaying(false);
draw();
requestAnimationFrame(tick);

// tab switcher hook: leaving the chord studio stops playback
window.csStopPlayback=()=>setPlaying(false);
