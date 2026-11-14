"""CPU DiffSinger inference for the original LIEE MM2.8 archive. No model edits."""
import argparse
import gc
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import wave
import zipfile

BASE = Path(__file__).resolve().parent.parent
MODEL = BASE / 'models' / 'liee-MM2.8'
EXTRACTED = MODEL / 'extracted'
SHA256 = 'd9fd90e61186f6397c148e3817832bd547d1f13b2ba7ba3d812efe020328fa12'
RATE, HOP = 44100, 512
# eSpeak's English phonemes -> ARPAbet -> the voicebank's own English replacements.
# Explicit vowel aliases from eSpeak's installed English phoneme reference.
# a# is the unstressed vowel in 'about'/'again', not the TRAP vowel a.
ESPEAK = {'a#':'ax','aa':'ae','i':'iy','O@':['ao','r'],'o@':['ao','r'],
          'aI@':['ay','ax'],'aU@':['aw','er'],'i:':'iy','I':'ih','I2':'ih','e':'eh','E':'eh','a':'ae','a:':'aa','A:':'aa','A@':['aa','r'],
          '0':'aa','0:':'ao','O:':'ao','O':'ao','V':'ah','U':'uh','u:':'uw','3:':'er','3':'er',
          '@':'ax','@2':'ax','@L':['ax','l'],'@r':'er','eI':'ey','aI':'ay','OI':'oy','oU':'ow','@U':'ow',
          'aU':'aw','i@':['iy','r'],'I@':['ih','r'],'e@':['eh','r'],'U@':['uh','r'],'tS':'ch','dZ':'jh','T':'th','D':'dh',
          'h':'hh','S':'sh','Z':'zh','N':'ng','j':'y','t#':'t','d#':'d','?':'cl','l=':'l','n=':'n','m=':'m'}
REPLACEMENTS = {'t':'t0','d':'d0','r':'r0','l':'ll','v':'w','w':'L','y':'j'}
VOWELS = set('aa ae ah ao aw ax ay eh er ey ih iy ow oy uh uw'.split())


def safe_extract(archive, destination):
    destination = destination.resolve()
    for item in archive.infolist():
        path = Path(item.filename.replace('\\','/'))
        target = (destination / path).resolve()
        if path.is_absolute() or not target.is_relative_to(destination) or (item.external_attr >> 16) & 0o170000 == 0o120000:
            raise ValueError(f'Unsafe archive path: {item.filename}')
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as source, target.open('wb') as output:
                shutil.copyfileobj(source, output)


def singer_root():
    roots = list(EXTRACTED.glob('*/dsconfig.yaml'))
    if len(roots) != 1:
        raise RuntimeError('Voicebank needs extraction. Run bun run model:setup.')
    return roots[0].parent


def prepare():
    archive = MODEL / 'voicebank.zip'
    with archive.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != SHA256:
            raise ValueError('Voicebank archive checksum mismatch. Run bun run model:download again.')
    # Extract into a staging directory. Never expose a partially extracted singer.
    with tempfile.TemporaryDirectory(prefix='extract-', dir=MODEL) as stage_name:
        stage = Path(stage_name)
        with zipfile.ZipFile(archive) as outer:
            nested = [i for i in outer.infolist() if i.filename.endswith('.zip')]
            if len(nested) != 1:
                raise ValueError('Expected one original voicebank inside the release archive.')
            inner_path = stage / 'singer.zip'
            with outer.open(nested[0]) as source, inner_path.open('wb') as output:
                shutil.copyfileobj(source, output)
            with zipfile.ZipFile(inner_path) as inner:
                safe_extract(inner, stage / 'extracted')
        if EXTRACTED.exists():
            shutil.rmtree(EXTRACTED)
        (stage / 'extracted').rename(EXTRACTED)
    # A manually inspected intermediate is redundant; the original release is retained.
    (MODEL / 'voicebank-inner.zip').unlink(missing_ok=True)
    root = singer_root()
    report={'extracted':str(root),'schema':inspect_models(root)}
    (MODEL/'schema.json').write_text(json.dumps(report,indent=2)+'\n')
    print(f'Verified and extracted original singer: {root}')


def inspect_models(root):
    from onnx_schema import inputs
    return {str(path.relative_to(root)): inputs(path) for path in [
        root/'mm_ac_2.8.liee.onnx', root/'dsdur/mm_tm_2.8.liee.linguistic.onnx',
        root/'dsdur/mm_tm_2.8.liee.dur.onnx', root/'dsvariance/mm_vr_2.8.liee.linguistic.onnx',
        root/'dsvariance/mm_vr_2.8.liee.variance.onnx', root/'dsvocoder/nsf_hifigan.onnx',
    ]}


def status():
    missing = [name for name in ['numpy','onnxruntime','yaml'] if importlib.util.find_spec(name) is None]
    try:
        root = singer_root()
    except RuntimeError as error:
        return {'ok':False,'reason':str(error)}
    for file in ['mm_ac_2.8.liee.onnx','mm_ac_2.8.phonemes.json','dsdur/mm_tm_2.8.liee.linguistic.onnx',
                 'dsdur/mm_tm_2.8.liee.dur.onnx','dsdur/dsdict-en.yaml',
                 'dsvariance/mm_vr_2.8.liee.linguistic.onnx','dsvariance/mm_vr_2.8.liee.variance.onnx','dsvocoder/nsf_hifigan.onnx']:
        if not (root/file).is_file():
            return {'ok':False,'reason':f'Missing model file: {file}. Run bun run model:setup.'}
    if missing:
        return {'ok':False,'reason':f"Python dependencies missing: {', '.join(missing)}. Run bun run model:setup in your terminal."}
    if not shutil.which('espeak'):
        return {'ok':False,'reason':'eSpeak is required for English pronunciation (no eSpeak audio is used).'}
    return {'ok':True,'name':"LIEE : Immortal Idol 'Lilia'",'sampleRate':RATE}


def phonemize(word, symbols, overrides):
    word = word.lower().replace('’', "'")
    if word in overrides:
        phones = overrides[word]
    else:
        result = subprocess.run(['espeak','-q','-v','en-us','-x','--sep=|','--',word],capture_output=True,text=True,check=True,timeout=10)
        raw = result.stdout.strip().replace("'",'').replace(',','').replace(';','')
        phones = []
        for token in re.split(r'[|\s]+',raw):
            if not token or token in ['_','_:']:
                continue
            # Some eSpeak variants append stress digits to vowel symbols.
            base = ESPEAK.get(token, ESPEAK.get(re.sub(r'\d+$','',token), re.sub(r'\d+$','',token)))
            for sound in base if isinstance(base,list) else [base]:
                if sound not in symbols and sound not in REPLACEMENTS:
                    raise ValueError(f'Unrecognized English sound {token!r} in {word!r}. Try another spelling.')
                phones.append(REPLACEMENTS.get(sound,sound))
    if not phones or any(phone not in symbols for phone in phones):
        raise ValueError(f'Unsupported pronunciation for {word!r}.')
    return phones


def allocate(predictions, total):
    """Positive integer phone durations whose sum exactly matches the word's score."""
    if total < len(predictions):
        raise ValueError('A word has too many sounds for its note. Increase its note length or lower the tempo.')
    weights = [max(.001,float(p)) if math.isfinite(float(p)) else .001 for p in predictions]
    remainder = total-len(weights)
    exact = [w/sum(weights)*remainder for w in weights]
    result = [1+math.floor(x) for x in exact]
    for index in sorted(range(len(exact)),key=lambda i:exact[i]-math.floor(exact[i]),reverse=True)[:total-sum(result)]:
        result[index] += 1
    return result


def session_run(path, feeds):
    import numpy as np
    import onnxruntime as ort
    options = ort.SessionOptions()
    options.intra_op_num_threads = max(1,min(2,os.cpu_count() or 1))
    options.inter_op_num_threads = 1
    options.enable_cpu_mem_arena = False
    options.enable_mem_pattern = False
    options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    session = ort.InferenceSession(str(path),sess_options=options,providers=['CPUExecutionProvider'])
    expected = {item.name for item in session.get_inputs()}
    if expected != set(feeds):
        raise RuntimeError(f'Unexpected model inputs in {path.name}: {expected ^ set(feeds)}')
    dtype = {'tensor(float)':np.float32,'tensor(int64)':np.int64,'tensor(bool)':np.bool_}
    inputs = {item.name:np.asarray(feeds[item.name],dtype=dtype[item.type]) for item in session.get_inputs()}
    result = dict(zip([item.name for item in session.get_outputs()],session.run(None,inputs)))
    del session
    gc.collect()
    return result


def synthesize_chunk(notes, bpm, root):
    import numpy as np
    import yaml
    symbols = json.loads((root/'mm_ac_2.8.phonemes.json').read_text())
    dictionary = yaml.safe_load((root/'dsdur/dsdict-en.yaml').read_text(encoding='utf-8-sig'))
    overrides = {entry['grapheme']:entry['phonemes'] for entry in dictionary['entries']}
    phones = [['SP']]+[phonemize(n['word'],symbols,overrides) for n in notes]+[['SP']]
    lead, tail = 8, 12
    durations, cursor = [], 0.0
    for note in notes:
        start = round(cursor*RATE/HOP)
        cursor += note['beats']*60/bpm
        durations.append(round(cursor*RATE/HOP)-start)
    word_dur = [lead]+durations+[tail]
    word_div = [len(p) for p in phones]
    flat = [p for word in phones for p in word]
    tokens = [[symbols[p] for p in flat]]
    midis = [notes[0]['midi']]+[n['midi'] for n in notes]+[notes[-1]['midi']]
    ph_midi = [[m for word,m in zip(phones,midis) for _ in word]]
    print('Predicting English phoneme durations',file=sys.stderr)
    linguistic = session_run(root/'dsdur/mm_tm_2.8.liee.linguistic.onnx',{'tokens':tokens,'word_div':[word_div],'word_dur':[word_dur]})
    predicted = session_run(root/'dsdur/mm_tm_2.8.liee.dur.onnx',{**linguistic,'ph_midi':ph_midi})['ph_dur_pred'][0]
    ph_dur, index = [], 0
    for count, frames in zip(word_div,word_dur):
        ph_dur.extend(allocate(predicted[index:index+count],frames))
        index += count
    frames = sum(ph_dur)
    pitch = np.concatenate([np.full(length,midi,np.float32) for length,midi in zip(word_dur,midis)])
    boundary = lead
    for i,length in enumerate(durations):
        # Shape the target pitch itself, without resampling or shifting generated speech.
        if i:
            width = min(3,length//4,durations[i-1]//4)
            for j in range(width):
                x=(j+1)/max(1,width)
                pitch[boundary+j] = midis[i]+(midis[i+1]-midis[i])*(x*x*(3-2*x))
        for j in range(length):
            age=j*HOP/RATE
            depth=.16*min(1,max(0,(age-.22)/.22))
            pitch[boundary+j] += depth*math.sin(2*math.pi*5.2*age)
        boundary += length
    print('Predicting vocal expression',file=sys.stderr)
    linguistic = session_run(root/'dsvariance/mm_vr_2.8.liee.linguistic.onnx',{'tokens':tokens,'ph_dur':[ph_dur]})
    zeros=np.zeros((1,frames),np.float32)
    retake=np.zeros((1,frames,4),np.bool_);retake[:,:,3]=True
    variance=session_run(root/'dsvariance/mm_vr_2.8.liee.variance.onnx',{
        'encoder_out':linguistic['encoder_out'],'ph_dur':[ph_dur],'pitch':pitch[None,:],
        'energy':zeros,'breathiness':zeros,'voicing':zeros,'tension':zeros,'retake':retake,'steps':np.array(8,np.int64),
    })
    del linguistic
    f0=(440*2**((pitch-69)/12)).astype(np.float32)[None,:]
    print('Rendering LIEE acoustic model',file=sys.stderr)
    mel=session_run(root/'mm_ac_2.8.liee.onnx',{
        'tokens':tokens,'durations':[ph_dur],'f0':f0,'tension':variance['tension_pred'],
        'gender':zeros,'velocity':np.ones((1,frames),np.float32),'steps':np.array(20,np.int64),
    })['mel']
    del variance
    print('Rendering singing vocoder',file=sys.stderr)
    audio=session_run(root/'dsvocoder/nsf_hifigan.onnx',{'mel':mel,'f0':f0})['waveform'].reshape(-1)
    if not np.isfinite(audio).all():
        raise RuntimeError('The model produced invalid audio samples.')
    audio=audio[lead*HOP:(lead+sum(durations))*HOP]
    expected=round(sum(n['beats'] for n in notes)*60/bpm*RATE)
    audio=np.pad(audio,(0,max(0,expected-len(audio))))[:expected]
    ramp=min(round(.006*RATE),len(audio)//2)
    audio[:ramp]*=np.linspace(0,1,ramp)
    audio[-ramp:]*=np.linspace(1,0,ramp)
    return audio


def render(payload, output):
    import numpy as np
    info=status()
    if not info['ok']:
        raise RuntimeError(info['reason'])
    notes,bpm=payload['notes'],payload['bpm']
    if not notes or len(notes)>48 or not 60<=bpm<=180:
        raise ValueError('Invalid score.')
    for note in notes:
        if not re.fullmatch(r"[A-Za-z]+(?:['’][A-Za-z]+)*",note['word']) or not 48<=note['midi']<=84 or note['beats'] not in [.5,1,1.5,2,3,4]:
            raise ValueError('Invalid note.')
    # Bound activation memory on a CPU machine. Typical short phrases run as a whole.
    chunks,current,seconds=[],[],0
    root=singer_root()
    for note in notes:
        length=note['beats']*60/bpm
        if current and seconds+length>10:
            chunks.append(synthesize_chunk(current,bpm,root)); current=[]; seconds=0
        current.append(note); seconds+=length
    if current:
        chunks.append(synthesize_chunk(current,bpm,root))
    audio=np.concatenate(chunks)
    expected=round(sum(n['beats'] for n in notes)*60/bpm*RATE)
    audio=np.pad(audio,(0,max(0,expected-len(audio))))[:expected]
    peak=float(np.max(np.abs(audio)))
    if peak<1e-5:
        raise RuntimeError('The model produced silent audio.')
    audio*=min(1,.95/peak)
    with wave.open(str(output),'wb') as wav:
        wav.setparams((1,2,RATE,0,'NONE','not compressed'))
        wav.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('command',choices=['prepare','check','inspect','render'])
    parser.add_argument('--input',type=Path)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.command=='prepare':
        prepare()
    elif args.command=='check':
        print(json.dumps(status()))
    elif args.command=='inspect':
        print(json.dumps(inspect_models(singer_root()),indent=2))
    else:
        if not args.input or not args.output:
            parser.error('render requires --input and --output')
        render(json.loads(args.input.read_text()),args.output)

if __name__=='__main__':
    try:
        main()
    except Exception as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
