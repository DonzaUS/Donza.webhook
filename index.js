import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from 'cors';

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const SHOP_ID = process.env.SHOP_ID;
const SECRET_WORD = process.env.FREEKASSA_SECRET_WORD; // Секретное слово (не API-ключ!)

if (!SHOP_ID || !SECRET_WORD) {
  console.error("Env не найдены: SHOP_ID или FREEKASSA_SECRET_WORD");
  process.exit(1);
}

app.post('/create-payment', (req, res) => {
  const { amount, orderId, gameId, uc } = req.body;

  if (!amount || !orderId || !gameId) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID' });
  }

  // Формируем строку для MD5-подписи (как в документации)
  const signString = [
    SHOP_ID,               // m
    Number(amount),        // oa
    SECRET_WORD,           // секретное слово
    'RUB',                 // currency
    orderId                // o
  ].join(':');

  const signature = crypto.createHash('md5').update(signString).digest('hex');

  // Параметры для ссылки (как в примере документации)
  const params = new URLSearchParams({
    m: SHOP_ID,
    oa: amount,
    o: orderId,
    currency: 'RUB',
    s: signature,
    desc: `${uc} UC в Donza - ID: ${gameId}`,
    lang: 'ru',
    email: 'client@telegram.org',
    ip: req.ip || '127.0.0.1'
  });

  const paymentLink = `https://pay.freekassa.net/?${params.toString()}`;

  console.log('Готовая ссылка:', paymentLink);

  res.json({ success: true, link: paymentLink });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));