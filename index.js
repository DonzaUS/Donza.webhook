import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from 'cors';

const app = express();

app.use(cors({ origin: '*' })); // для теста — потом сузь до ['https://donza.site']
app.use(bodyParser.json());

const API_KEY = process.env.FREEKASSA_API_KEY;
const SHOP_ID = process.env.SHOP_ID;

if (!API_KEY || !SHOP_ID) {
  console.error("❌ Env не найдены: FREEKASSA_API_KEY или SHOP_ID");
  process.exit(1);
}

app.post('/create-payment', (req, res) => {
  console.log('Получен запрос:', req.body);

  const { amount, orderId, gameId, uc } = req.body;

  if (!amount || !orderId || !gameId) {
    return res.status(400).json({ success: false, error: 'Нет суммы, ID заказа или игрового ID' });
  }

  const nonce = Date.now().toString();

  const payload = {
    shopId: Number(SHOP_ID),
    nonce,
    paymentId: orderId,
    amount: Number(amount),
    currency: 'RUB',
    email: 'client@telegram.org',
    ip: req.ip || '127.0.0.1'
  };

  // Генерация правильной подписи
  const sortedKeys = Object.keys(payload).sort();
  const signString = sortedKeys.map(key => payload[key]).join('|');
  payload.signature = crypto.createHmac('sha256', API_KEY).update(signString).digest('hex');

  // Формируем полную ссылку на оплату
  const paymentLink = `https://pay.freekassa.net/?${new URLSearchParams(payload).toString()}`;

  console.log('Готовая ссылка на оплату:', paymentLink);

  res.json({ success: true, link: paymentLink });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));