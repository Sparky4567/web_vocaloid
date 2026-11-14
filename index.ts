import page from './src/index.html';
import { renderRequest } from './src/api';
import { neuralStatus } from './src/neural';
const server = Bun.serve({
  hostname: process.env.HOST || '127.0.0.1', maxRequestBodySize: 24000, port: Number(process.env.PORT || 3000), idleTimeout: 255,
  routes: {
    '/': page,
    '/api/health': async () => {
      const neural = await neuralStatus();
      const classic = Boolean(Bun.which('espeak') && Bun.which('ffmpeg'));
      return Response.json({ok: classic || neural.ok, classic, neural});
    },
    '/api/render': { POST: async (req) => {
      return renderRequest(req);
    }}
  },
  development: process.env.NODE_ENV !== 'production'
});
console.log(`Chorus studio: http://localhost:${server.port}`);
