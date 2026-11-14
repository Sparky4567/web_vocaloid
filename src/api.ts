import { synthesize } from './synth';
import { neuralStatus, synthesizeNeural } from './neural';
import type { Note } from './music';
let active = 0;
let neuralActive = false;
export async function renderRequest(req: Request): Promise<Response> {
      if (active >= 2) return Response.json({error: 'The studio is busy. Please try again in a moment.'}, {status: 429});
      try {
        if (Number(req.headers.get('content-length')) > 24000) return Response.json({error: 'This phrase is too long.'}, {status: 413});
        const rawBody = await req.text();
        if (new TextEncoder().encode(rawBody).length > 24000) return Response.json({error: 'This phrase is too long.'}, {status: 413});
        let body;
        try { body = JSON.parse(rawBody); } catch { return Response.json({error: 'Invalid JSON request.'}, {status: 400}); }
        if (!body || typeof body !== 'object') return Response.json({error: 'Invalid rendering request.'}, {status: 400});
        const {notes, bpm, voice} = body as {notes: Note[]; bpm: number; voice: string};
        if (!Array.isArray(notes) || notes.length < 1 || notes.length > 48 || !Number.isFinite(bpm) || bpm < 60 || bpm > 180 || !['nova', 'alto', 'classic', 'liee'].includes(voice) || notes.some(n => !n || typeof n.word !== 'string' || !/^[a-zA-Z]+(?:['’][a-zA-Z]+)*$/.test(n.word) || n.word.length > 40 || !Number.isInteger(n.midi) || n.midi < 48 || n.midi > 84 || ![0.5, 1, 1.5, 2, 3, 4].includes(n.beats))) return Response.json({error: 'Use 1–48 English words, valid notes, and a tempo of 60–180 BPM.'}, {status: 400});
        if (voice === 'liee') {
          if (neuralActive) return Response.json({error:'LIEE is rendering another phrase. Please try again shortly.'},{status:429});
          const status = await neuralStatus();
          if (!status.ok) return Response.json({error: status.reason || 'Run bun run model:setup to prepare LIEE.'},{status:503});
          if (neuralActive) return Response.json({error:'LIEE is rendering another phrase. Please try again shortly.'},{status:429});
          neuralActive = true;
          active++;
          try {
            const wav = await synthesizeNeural(notes,bpm);
            return new Response(new Uint8Array(wav),{headers:{'Content-Type':'audio/wav','Content-Disposition':'inline; filename="chorus-liee.wav"','Cache-Control':'no-store','X-Chorus-Voice':'LIEE','X-Audio-Sample-Rate':'44100'}});
          } catch (error) {
            console.error(error);
            return Response.json({error:error instanceof Error ? error.message : 'LIEE rendering failed.'},{status:500});
          } finally { neuralActive = false; active--; }
        }
        if (!Bun.which('espeak') || !Bun.which('ffmpeg')) return Response.json({error: 'Install eSpeak and FFmpeg on the server to enable rendering.'}, {status: 503});
        active++;
        try { const wav = await synthesize(notes, bpm, voice); return new Response(new Uint8Array(wav), {headers: {'Content-Type': 'audio/wav', 'Content-Disposition': 'inline; filename="chorus.wav"', 'Cache-Control': 'no-store'}}); }
        finally { active--; }
      } catch (error) { console.error(error); return Response.json({error: 'Rendering failed. Check that eSpeak and FFmpeg with rubberband support are installed, then try again.'}, {status: 500}); }
}
