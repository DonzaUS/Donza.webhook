import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from 'cors';

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const SECRET_WORD = process.env.FREEKASSA_SECRET_WORD; // Секретное слово из FreeKassa (не API-ключ!)
const SHOP_ID = process.env.SHOP_ID;

if (!SECRET_WORD || !SHOP_ID) {
  console.error("Env не найдены: FREEKASSA_SECRET_WORD или SHOP_ID");
  process.exit(1);
}

app.post('/create-payment', (req, res) => {
  console.log('Запрос:', req.body);

  const { amount, orderId, gameId, uc } = req.body;

  if (!amount || !orderId || !gameId) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID' });
  }

  const signString = [
    SHOP_ID,
    Number(amount),
    SECRET_WORD,
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
    lang: 'ru'
  });

  const paymentLink = `https://pay.freekassa.net/?${params.toString()}`;

  console.log('Готовая ссылка:', paymentLink);

  res.json({ success: true, link: paymentLink });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер на ${PORT}`));