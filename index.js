import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();

app.use(cors({
  origin: ['https://donza.site', 'https://www.donza.site', 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const SECRET_WORD_2 = process.env.FREEKASSA_SECRET_2;
const API_KEY = process.env.FREEKASSA_API_KEY;
const SHOP_ID = process.env.SHOP_ID;

if (!SECRET_WORD_2 || !API_KEY || !SHOP_ID) {
  console.error("❌ Не все env-переменные найдены!");
  process.exit(1);
}

app.post('/create-payment', async (req, res) => {
  console.log('Получен запрос:', req.body);

  const { amount, orderId, method = 44, gameId, uc } = req.body;

  if (!amount || !orderId || !gameId) {
    return res.status(400).json({ success: false, error: 'Нет суммы, ID заказа или игрового ID' });
  }

  const nonce = Date.now();

  const payload = {
    shopId: Number(SHOP_ID),
    nonce,
    paymentId: String(orderId),
    i: Number(method),
    email: 'client@telegram.org',
    ip: req.ip || '127.0.0.1',
    amount: Number(amount),
    currency: 'RUB'
  };

  const sortedKeys = Object.keys(payload).sort();
  const signString = sortedKeys.map(key => payload[key]).join('|');
  payload.signature = crypto
    .createHmac('sha256', API_KEY)
    .update(signString)
    .digest('hex');

  try {
    const response = await fetch('https://api.fk.life/v1/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.type === 'success') {
      res.json({ success: true, link: data.location }); // Ссылка на оплату
    } else {
      console.error('Ошибка FreeKassa:', data);
      res.status(500).json({ success: false, error: data.message || 'Ошибка создания заказа' });
    }
  } catch (err) {
    console.error('Ошибка fetch:', err);
    res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});