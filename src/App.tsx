import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compose, noteName, words, type Note, type Pattern } from './music';
import './style.css';
const initial = 'We are little stars\nSinging through the night';
const demos = [initial, 'Let the morning light\nCarry me back home', 'Every little dream\nBegins with you and me'];
function App() {
  const [text, setText] = useState(initial), [bpm, setBpm] = useState(110), [voice, setVoice] = useState('nova');
  const [pattern, setPattern] = useState<Pattern>('daydream'), [root, setRoot] = useState(60);
  const [notes, setNotes] = useState<Note[]>(compose(initial, 'daydream', 60));
  const [selected, setSelected] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [url, setUrl] = useState(''), [rendered, setRendered] = useState(''), [time, setTime] = useState(0), [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0), [ready, setReady] = useState<boolean | null>(null);
  const [neuralReady,setNeuralReady] = useState(false), [classicReady,setClassicReady] = useState(true);
  const [neuralReason,setNeuralReason] = useState('Checking local singer…');
  const [sampleRate,setSampleRate] = useState(22050), [renderedVoice,setRenderedVoice] = useState('nova');
  const player = useRef<HTMLAudioElement>(null);
  const signature = JSON.stringify({notes, bpm, voice});
  const stale = Boolean(url && rendered !== signature);
  useEffect(() => {
    fetch('/api/health').then(r => r.json() as Promise<{ok: boolean; classic: boolean; neural: {ok: boolean; reason?: string}}>).then(d => {
      setReady(d.ok); setClassicReady(d.classic); setNeuralReady(d.neural.ok);
      setNeuralReason(d.neural.reason || 'A locally rendered neural singing voice.');
      if (d.neural.ok) setVoice('liee');
    }).catch(() => {setReady(false); setNeuralReason('Could not connect to the local studio.');});
  }, []);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  function recompose(value = text, shape = pattern, key = root) { setNotes(compose(value, shape, key)); setSelected(0); setError(''); }
  function updateNote(changes: Partial<Note>) { setNotes(all => all.map((n, i) => i === selected ? {...n, ...changes} : n)); }
  async function render() {
    setBusy(true); setError(''); player.current?.pause();
    try {
      const response = await fetch('/api/render', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: signature});
      if (!response.ok) { const result = await response.json() as {error?: string}; throw new Error(result.error || 'Could not render audio.'); }
      const wav = await response.blob();
      const bytes = await wav.arrayBuffer();
      setSampleRate(new DataView(bytes).getUint32(24,true)); setRenderedVoice(voice);
      setUrl(URL.createObjectURL(wav)); setRendered(signature); setTime(0);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not connect to the studio.'); }
    finally { setBusy(false); }
  }
  const count = words(text).length, total = notes.reduce((a, n) => a + n.beats, 0) * 60 / bpm;
  let offset = 0;
  const active = notes.findIndex(n => { const start = offset; offset += n.beats * 60 / bpm; return time >= start && time < offset; });
  const picked = notes[selected];
  const stamp = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return <div className="app">
    <header><a className="brand" href="/" aria-label="Chorus home"><span className="brand-mark">Ⅲ</span> chorus<span className="studio-tag">VOICE STUDIO</span></a><div className="local"><i className={ready === false ? 'offline' : ''}/>{ready === null ? 'Connecting to studio' : ready ? 'Local engine connected' : 'Engine unavailable'}</div><a className="help" href="#about">How it works ↗</a></header>
    <main><div className="intro"><div><div className="eyebrow">A LITTLE TEXT. A LITTLE MAGIC.</div><h1>Your words.<br/><span>Their first melody.</span></h1><p>Turn a thought into a singing voice. Write it, shape it, hear it.</p></div><div className="hero-art" aria-hidden="true"><div className="orbit"/><div className="wave">{Array.from({length: 25}, (_, i) => <i key={i} style={{height: `${18 + Math.sin(i * .72) ** 2 * 68}px`}}/>)}</div><span>MADE TO BE HEARD</span><b>✦</b></div></div>
    <div className="workspace"><section className="panel lyrics"><div className="panel-heading"><h2><span>01</span> The words</h2><span className="tiny">ENGLISH</span></div><label htmlFor="lyrics" className="field-label">What’s on your mind?</label><textarea id="lyrics" value={text} maxLength={1200} spellCheck={false} onChange={e => {setText(e.target.value); recompose(e.target.value);}} placeholder="Write a little something to sing…"/><div className="text-meta"><span>{count} / 48 words</span><span>Every word gets a note</span></div><div className="try"><span>NEED A FIRST LINE?</span><div>{['Little stars', 'Morning light', 'A little dream'].map((name, i) => <button key={name} onClick={() => {setText(demos[i]!); recompose(demos[i]!);}}>{name} ↗</button>)}</div></div><div className="voice-heading"><h3>Meet your voice</h3><span>LOCAL VOICES</span></div><button className={`neural-voice ${voice === 'liee' ? 'chosen' : ''}`} disabled={!neuralReady} title={neuralReason} onClick={() => setVoice('liee')} aria-pressed={voice === 'liee'}><span className="avatar nova">L<small>✦</small></span><span><strong>LIEE : Immortal Idol</strong><small>{neuralReady ? 'Neural singing · voice by julieraptor' : 'Neural singer · setup required'}</small></span><span>{voice === 'liee' ? '✓' : '↗'}</span></button>{!neuralReady && <p className="model-setup">Local model setup: <code>bun run model:setup</code>, then refresh.</p>}<div className="voices">{[['nova','N','Nova','Bright & airy'], ['alto','A','Alto','Warm & low'], ['classic','C','Classic','Pure robot']].map(([id, letter, name, desc]) => <button className={`voice ${voice === id ? 'chosen' : ''}`} onClick={() => setVoice(id!)} disabled={!classicReady} key={id} aria-pressed={voice === id}><span className={`avatar ${id}`}>{letter}<small>✦</small></span><strong>{name}</strong><span>{desc}</span>{voice === id && <b>✓</b>}</button>)}</div></section>
    <section className="panel melody"><div className="panel-heading"><h2><span>02</span> The melody</h2><span className="tiny"><i/> YOUR MINI COMPOSER</span></div><div className="settings"><label>MELODY<select value={pattern} onChange={e => {const p = e.target.value as Pattern; setPattern(p); recompose(text, p);}}><option value="daydream">Daydream · major</option><option value="starlight">Starlight · rising</option><option value="bittersweet">Bittersweet · minor</option></select></label><label>KEY<select value={root} onChange={e => {const r = Number(e.target.value); setRoot(r); recompose(text, pattern, r);}}>{[60,62,64,65,67].map(n => <option key={n} value={n}>{noteName(n).replace('4','')}</option>)}</select></label><label className="tempo">TEMPO <div><input aria-label="Tempo" type="number" min="60" max="180" value={bpm} onChange={e => setBpm(Number(e.target.value))}/><span>BPM</span></div></label></div>
    <div className="score-caption"><span>PIANO ROLL <span className="muted">/ click a word to tune it</span></span><span>{notes.length} notes · {Number.isFinite(total) ? total.toFixed(1) : '0'}s</span></div><div className="piano"><div className="keys">{[84,81,78,75,72,69,66,63,60,57,54,51,48].map(n => <span key={n}>{noteName(n)}</span>)}</div><div className="roll"><div className="grid">{Array.from({length:13},(_,i) => <div className="grid-line" key={i}/>)}<div className="note-track" style={{minWidth: Math.max(510, notes.reduce((s,n)=> s+n.beats*64,0))}}>{notes.map((n,i) => <button key={i} className={`note ${selected === i ? 'selected' : ''} ${playing && !stale && active === i ? 'sounding' : ''}`} style={{width: n.beats*64-5, top: `${(84-n.midi)/36*264}px`}} title={`${n.word}: ${noteName(n.midi)}, ${n.beats} beats`} onClick={() => setSelected(i)}>{n.word}</button>)}</div></div><div className="ruler">{Array.from({length: Math.max(8,Math.ceil(notes.reduce((s,n)=>s+n.beats,0)/4))},(_,i) => <span key={i}>{String(i+1).padStart(2,'0')}</span>)}</div></div></div>
    <div className="note-editor">{picked ? <><span className="selected-word">“{picked.word}”</span><label>Note <select aria-label="Selected note" value={picked.midi} onChange={e => updateNote({midi: Number(e.target.value)})}>{Array.from({length:37},(_,i) => i+48).map(n => <option key={n} value={n}>{noteName(n)}</option>)}</select></label><label>Length <select aria-label="Selected note length" value={picked.beats} onChange={e => updateNote({beats: Number(e.target.value)})}>{[.5,1,1.5,2,3,4].map(n => <option key={n} value={n}>{n} {n===1?'beat':'beats'}</option>)}</select></label></> : <span>Add lyrics to start composing.</span>}<button className="reset" onClick={() => recompose()}>↺ Reset notes</button></div><div className="melody-footer"><span>✧ A melody to start with. Make it yours.</span><span>4/4</span></div></section></div>
    <section className="render-panel"><div className="render-info"><div className="sound-icon">♫</div><div><h3>{busy ? 'Your words are finding their voice…' : 'Ready for a little goosebumps?'}</h3><p>{busy ? voice === 'liee' ? 'Rendering a connected singing phrase locally. CPU rendering can take a few minutes.' : 'Synthesizing each word locally. This can take a few moments.' : 'Render your phrase, then press play. No cloud. Just your creativity.'}</p></div></div><button className="render-button" disabled={busy || !notes.length || count>48 || !Number.isFinite(bpm) || bpm<60 || bpm>180 || ready===false || (voice === 'liee' ? !neuralReady : !classicReady)} onClick={render}>{busy ? <><span className="spinner"/> Rendering…</> : <>✦ {url ? 'Render again' : 'Make it sing'} <span>↗</span></>}</button></section>
    {(voice === 'liee' || renderedVoice === 'liee') && <p className="model-setup">LIEE by julieraptor · Credit published vocals as LIEE. <a href="https://docs.google.com/document/d/1t13WKc7VA2Q3G_MppznbAwhl3vLIL2MNPyjVN3kWDDg/edit" target="_blank" rel="noreferrer">Voice terms and restrictions ↗</a><br/>Hosting requires prior permission. Monetizing the model and generative AI uses are restricted; ask the creator if your use is unclear.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <section className={`transport ${url ? 'has-audio' : ''}`} aria-label="Audio player"><button className="play" disabled={!url || busy} aria-label={playing?'Pause':'Play'} onClick={() => {if (playing) player.current?.pause(); else player.current?.play().catch(() => setError('Playback failed. Try rendering again.'));}}>{playing ? 'Ⅱ' : '▶'}</button><div className="track-title"><strong>{url ? 'Your little masterpiece' : 'Your voice belongs here'}</strong><span>{stale ? 'Settings changed · render again to hear your edits' : url ? `${renderedVoice === 'liee' ? 'LIEE · ' : ''}WAV · ${sampleRate/1000} kHz · mono` : 'Make something. Then make some noise.'}</span></div><span className="timestamp">{stamp(time)}</span><input className="seek" aria-label="Playback position" type="range" min="0" max={duration || 1} step=".01" value={time} disabled={!url} onChange={e => {if(player.current) player.current.currentTime=Number(e.target.value); setTime(Number(e.target.value));}}/><span className="timestamp">{stamp(duration)}</span>{url ? <a className="download" href={url} download="chorus-phrase.wav">↓ <span>Download WAV</span></a> : <span className="download muted">↓ <span>Download WAV</span></span>}<audio ref={player} src={url || undefined} onLoadedMetadata={e => setDuration(e.currentTarget.duration)} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}/></section>
    <footer id="about"><span><span className="footer-logo">Ⅲ</span> A small studio for big feelings.</span><p>Local neural singing with LIEE by julieraptor.<br/>Classic synthesis also available. No speech or Web Audio APIs.</p><span>BUILT FOR THE JOY OF IT <b>✦</b></span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
