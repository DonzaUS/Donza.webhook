import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from 'cors';

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const SHOP_ID = process.env.SHOP_ID;
const SECRET = process.env.SECRET; // Короткое имя — SECRET

if (!SHOP_ID || !SECRET) {
  console.error("Env не найдены: SHOP_ID или SECRET");
  process.exit(1);
}

app.post('/create-payment', (req, res) => {
  const { amount, orderId, gameId, uc } = req.body;

  if (!amount || !orderId || !gameId) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID' });
  }

  // Точная строка для MD5-подписи (как в документации FreeKassa)
  const signString = [
    SHOP_ID,
    Number(amount),
    SECRET,
    'RUB',
    orderId
  ].join(':');

  const signature = crypto.createHash('md5').update(signString).digest('hex');

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