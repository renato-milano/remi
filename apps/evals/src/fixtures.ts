import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Costruisce una FINTA repository con 3 microservizi dalle STORIE diverse
 * (memorie di progetto .remi con TODO/registri differenti). Serve a testare la
 * capacità dell'agente di muoversi tra progetti, leggerne la storia e ragionarci.
 *
 *   {root}/.remi/project.md                        (monorepo)
 *   {root}/services/payments/.remi/project.md      (Stripe; TODO: rimborsi)
 *   {root}/services/payments/charge.js, README.md
 *   {root}/services/auth/.remi/project.md          (JWT; TODO: reset password)
 *   {root}/services/auth/login.js
 *   {root}/services/notifications/send.js          (NIENTE .remi: progetto "nuovo")
 */
export function buildFakeRepo(root: string): void {
  const mk = (rel: string, content: string) => {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, 'utf8');
  };

  mk(
    '.remi/project.md',
    `# Progetto: acme-platform

## Cos'è
Monorepo con 3 microservizi in services/: payments, auth, notifications.

## Registro azioni
- [2026-01-10] Avviato il monorepo acme-platform.
`,
  );

  // payments — storia con un TODO aperto (rimborsi)
  mk(
    'services/payments/.remi/project.md',
    `# Progetto: payments

## Cos'è
Servizio di pagamenti con integrazione Stripe.

## A cosa serve
Gestisce addebiti e transazioni degli utenti.

## Registro azioni
- [2026-02-01] Integrato Stripe.
- [2026-02-15] FATTO: addebiti singoli.
- [2026-03-01] TODO: aggiungere i rimborsi (refund).
`,
  );
  mk('services/payments/charge.js', 'export function charge(amount) {\n  // addebito via Stripe\n  return { ok: true, amount };\n}\n');
  mk('services/payments/README.md', '# Payments\nAddebiti e transazioni via Stripe.\n');

  // auth — storia con un TODO aperto (reset password)
  mk(
    'services/auth/.remi/project.md',
    `# Progetto: auth

## Cos'è
Servizio di autenticazione con token JWT.

## Registro azioni
- [2026-01-20] FATTO: login con JWT.
- [2026-02-10] TODO: reset della password.
`,
  );
  mk('services/auth/login.js', "export function login(user, pass) {\n  return { token: 'jwt.token.here' };\n}\n");

  // notifications — NESSUNA memoria di progetto (progetto "nuovo" da mappare)
  mk('services/notifications/send.js', 'export function send(to, msg) {\n  // invio email/push\n  return { sent: true, to };\n}\n');
  mk('services/notifications/README.md', '# Notifications\nInvio di email e notifiche push.\n');
}
