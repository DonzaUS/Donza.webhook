import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from 'cors';

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const SHOP_ID = process.env.SHOP_ID;
const SECRET = process.env.SECRET; // или FREEKASSA_SECRET_WORD

if (!SHOP_ID || !SECRET) {
  console.error("Env не найдены");
  process.exit(1);
}

app.post('/create-payment', (req, res) => {
  const { amount, orderId, gameId, uc } = req.body;

  if (!amount || !orderId || !gameId) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID' });
  }

  // Amount как строка (важно!)
  const amountStr = amount.toString();

  const signString = [
    SHOP_ID.toString(),
    amountStr,
    SECRET,
    'RUB',
    orderId
  ].join(':');

  const signature = crypto.createHash('md5').update(signString).digest('hex');

  const params = new URLSearchParams({
    m: SHOP_ID.toString(),
    oa: amountStr,
    o: orderId,
    currency: 'RUB',
    s: signature,
    desc: `${uc} UC в Donza - ID: ${gameId}`,
    lang: 'ru',
    email: 'client@telegram.org',
    ip: req.ip || '127.0.0.1'
  });

  const paymentLink = `https://pay.freekassa.net/?${params.toString()}`;

  console.log('Строка для подписи:', signString);
  console.log('Подпись:', signature);
  console.log('Готовая ссылка:', paymentLink);

  res.json({ success: true, link: paymentLink });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));