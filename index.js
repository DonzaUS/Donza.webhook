import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const API_KEY = process.env.FREEKASSA_API_KEY;
const SHOP_ID = process.env.SHOP_ID;

if (!API_KEY || !SHOP_ID) {
  console.error('Env не найдены: FREEKASSA_API_KEY или SHOP_ID');
  process.exit(1);
}

app.post('/create-payment', async (req, res) => {
  const { amount, orderId, gameId, uc, method } = req.body;

  if (!amount || !orderId || !gameId || !method) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID/метода' });
  }

  const nonce = Date.now().toString();

  const payload = {
    shopId: Number(SHOP_ID),
    nonce,
    paymentId: orderId,
    amount: Number(amount),
    currency: 'RUB',
    i: Number(method),  // 44 - СБП, 36 - карты
    email: 'donzaus@gmail.com',  // или динамически от пользователя
    ip: req.ip || '127.0.0.1'
  };

  const sortedKeys = Object.keys(payload).sort();
  const signString = sortedKeys.map(key => payload[key]).join('|');
  payload.signature = crypto.createHmac('sha256', API_KEY).update(signString).digest('hex');

  try {
    const response = await fetch('https://api.fk.life/v1/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.type === 'success' && data.location) {
      console.log('Успех FreeKassa, ссылка на оплату:', data.location);
      return res.json({ success: true, link: data.location });
    } else {
      console.error('Ошибка FreeKassa:', data);
      return res.status(response.status || 500).json({ success: false, error: data.message || 'Ошибка FreeKassa' });
    }
  } catch (err) {
    console.error('Ошибка fetch:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

app.post('/webhook', (req, res) => {
  const { MERCHANT_ID, AMOUNT, MERCHANT_ORDER_ID, SIGN } = req.body;

  const secret2 = process.env.FREEKASSA_SECRET_2;
  const checkSign = crypto.createHash('md5').update(`${MERCHANT_ID}:${AMOUNT}:${secret2}:${MERCHANT_ORDER_ID}`).digest('hex');

  if (SIGN === checkSign) {
    console.log('Оплата прошла! Заказ:', MERCHANT_ORDER_ID, 'Сумма:', AMOUNT);
    // Здесь зачисляй UC по MERCHANT_ORDER_ID
  }

  res.send('OK');
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер запущен на ${PORT}`));