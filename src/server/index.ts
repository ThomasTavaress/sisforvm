import { writeFileSync } from 'node:fs';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { seed } from './seed.ts';

const db = openDb();
const seeded = seed(db, {
  adminUser: process.env.ADMIN_USER,
  adminPassword: process.env.ADMIN_PASSWORD,
  demo: process.env.SEED_DEMO !== '0',
  demoPassword: process.env.DEMO_PASSWORD,
});
if (seeded.adminPasswordGenerated || seeded.demoPasswordGenerated) {
  // Senhas iniciais geradas aleatoriamente: gravadas em data/ (fora do git).
  let msg = '';
  if (seeded.adminPasswordGenerated) msg += `Usuário: ${process.env.ADMIN_USER || 'admin'}\nSenha inicial: ${seeded.adminPasswordGenerated}\n`;
  if (seeded.demoPasswordGenerated) msg += `Cliente demo — usuário: fast\nSenha: ${seeded.demoPasswordGenerated}\n`;
  msg += 'Troque as senhas em "Minha conta" após o primeiro acesso e apague este arquivo.\n';
  writeFileSync('data/admin-inicial.txt', msg);
  console.log('\n=== Credenciais iniciais criadas — veja data/admin-inicial.txt ===\n');
}

const app = createApp(db, { staticDir: 'dist/client', secureCookies: process.env.COOKIE_SECURE === '1' });
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`SISFORVM em http://localhost:${port}`));
