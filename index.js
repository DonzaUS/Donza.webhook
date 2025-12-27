import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from 'cors';

const app = express();

app.use(cors({
  origin: ['https://donza.site', 'https://www.donza.site', 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const API_KEY = process.env.FREEKASSA_API_KEY;
const SHOP_ID = process.env.SHOP_ID;

if (!API_KEY || !SHOP_ID) {
  console.error("❌ Не все env-переменные!");
  process.exit(1);
}

app.post('/create-payment', (req, res) => {
  console.log('Запрос:', req.body);

  const { amount, orderId, gameId, uc } = req.body;

  if (!amount || !orderId || !gameId) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID' });
  }

  const nonce = Date.now();

  const payload = {
    shopId: Number(SHOP_ID),
    nonce,
    paymentId: String(orderId),
    amount: Number(amount),
    currency: 'RUB',
    email: 'client@telegram.org',
    ip: req.ip || '127.0.0.1'
  };

  const sortedKeys = Object.keys(payload).sort();
  const signString = sortedKeys.map(key => payload[key]).join('|');
  payload.signature = crypto
    .createHmac('sha256', API_KEY)
    .update(signString)
    .digest('hex');

  console.log('Ссылка:', `https://pay.freekassa.net/?${new URLSearchParams(payload).toString()}`);

  res.json({ success: true, link: `https://pay.freekassa.net/?${new URLSearchParams(payload).toString()}` });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Сервер на ${PORT}`);
});