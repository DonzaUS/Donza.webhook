import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from 'cors';

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const SHOP_ID = process.env.SHOP_ID;
const SECRET_WORD = process.env.SECRET_WORD;

if (!SHOP_ID || !SECRET_WORD) {
  console.error("Env не найдены");
  process.exit(1);
}

app.post('/create-payment', (req, res) => {
  const { amount, orderId, gameId, uc } = req.body;

  if (!amount || !orderId || !gameId) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID' });
  }

  // Самое важное: сумма как чистая строка БЕЗ точки и нулей
  const amountStr = Math.floor(Number(amount)).toString(); // 425 → "425", 2100 → "2100"

  const signString = `${SHOP_ID}:${amountStr}:${SECRET_WORD}:RUB:${orderId}`;

  const signature = crypto.createHash('md5').update(signString).digest('hex');

  const params = new URLSearchParams({
    m: SHOP_ID,
    oa: amountStr,
    o: orderId,
    currency: 'RUB',
    s: signature,
    desc: `${uc} UC в Donza - ID: ${gameId}`,
    lang: 'ru'
  });

  const paymentLink = `https://pay.freekassa.net/?${params.toString()}`;

  console.log('Строка для подписи:', signString);
  console.log('Подпись s:', signature);
  console.log('Готовая ссылка:', paymentLink);

  res.json({ success: true, link: paymentLink });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер на ${PORT}`));