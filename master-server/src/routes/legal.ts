/**
 * /v1/legal — публичный endpoint с правовыми disclaimer'ами.
 *
 * Используется лаунчером, сайтом и любым клиентом, который хочет показать
 * пользователю актуальный legal-текст. Версионируется, чтобы клиент знал,
 * нужно ли заново показать согласие.
 */
import type { FastifyInstance } from 'fastify';

const LEGAL_VERSION = '2026-05-22';

const DISCLAIMER_RU = `Grand Theft Auto и Grand Theft Auto: V являются зарегистрированными торговыми марками Take-Two Interactive Software. Alfa MP не связана с и не одобрена Take-Two Interactive Software, Rockstar Games или их аффилированными лицами, и не несёт ответственности за контент, созданный пользователями. Alfa MP не размещает пользовательские сервера. Весь пользовательский контент является собственностью его соответствующих владельцев. Все права защищены.

© 2007–2026 Take-Two Interactive Software и её дочерние предприятия. Все другие знаки и торговые марки являются собственностью их соответствующих владельцев. Все права защищены. © 2026 Alfa MP.`;

const DISCLAIMER_EN = `Grand Theft Auto and Grand Theft Auto: V are registered trademarks of Take-Two Interactive Software. Alfa MP is not affiliated with or endorsed by Take-Two Interactive Software, Rockstar Games, or any of their affiliates, and is not responsible for user-generated content. Alfa MP does not host user servers. All user content is the property of its respective owners. All rights reserved.

© 2007–2026 Take-Two Interactive Software and its subsidiaries. All other marks and trademarks are properties of their respective owners. All rights reserved. © 2026 Alfa MP.`;

const SHORT_EN = 'Alfa MP is not affiliated with Take-Two Interactive or Rockstar Games. GTA V is a trademark of Take-Two Interactive Software. © 2026 Alfa MP.';

export async function legalRoutes(app: FastifyInstance) {
  app.get('/v1/legal', async () => ({
    version: LEGAL_VERSION,
    disclaimer: {
      en: DISCLAIMER_EN,
      ru: DISCLAIMER_RU
    },
    short: {
      en: SHORT_EN
    },
    requires_user_acceptance: true,
    last_updated: LEGAL_VERSION
  }));
}
