import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/** Каталог партий агента (консольная игра sim/src/agent.ts). */
const AGENT_GAMES = fileURLToPath(new URL('../../docs/agent-games/', import.meta.url));

/** Отдаёт файлы партий агента для живого просмотра: GET /agent-games/<имя>.json. */
function agentGames(): Plugin {
  return {
    name: 'agent-games',
    configureServer(server) {
      server.middlewares.use('/agent-games/', (req, res) => {
        const name = decodeURIComponent((req.url ?? '').replace(/^\//, '').split('?')[0] ?? '');
        if (!/^[\w.-]+\.json$/.test(name)) {
          res.statusCode = 400;
          res.end('bad name');
          return;
        }
        readFile(AGENT_GAMES + name, 'utf8').then(
          (text) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');
            res.end(text);
          },
          () => {
            res.statusCode = 404;
            res.end('not found');
          },
        );
      });
    },
  };
}

/** Метка сборки для онлайна: хост и гость должны играть одной сборкой (online/protocol.ts). */
const BUILD_ID = Date.now().toString(36);

export default defineConfig({
  plugins: [react(), agentGames()],
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID) },
  // Онлайн-проверка с другом: собранная версия (`vite preview`) через временный https-туннель
  // Cloudflare (адрес *.trycloudflare.com). Dev-сервер наружу не открываем.
  preview: { allowedHosts: ['.trycloudflare.com'] },
});
