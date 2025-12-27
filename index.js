import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();

// CORS — разрешаем запросы с твоего сайта и localhost
app.use(cors({
  origin: ['https://donza.site', 'https://www.donza.site', 'http://localhost:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

// JSON-парсер — для React-запросов (/create-payment)
app.use(bodyParser.json());

// urlencoded — для webhook FreeKassa
app.use(bodyParser.urlencoded({ extended: true }));

// IP FreeKassa (актуальные на декабрь 2025)
const FREEKASSA_IPS = new Set([
  "168.119.157.136",
  "168.119.60.227",
  "178.154.197.79",
  "51.250.54.238"
]);

// Env-переменные
const SECRET_WORD_2 = process.env.FREEKASSA_SECRET_2;
const API_KEY = process.env.FREEKASSA_API_KEY;
const SHOP_ID = process.env.SHOP_ID;

// Проверка env — если чего-то нет, сервер упадёт с понятной ошибкой
if (!SECRET_WORD_2) {
  console.error("❌ FREEKASSA_SECRET_2 не найден в env!");
  process.exit(1);
}
if (!API_KEY) {
  console.error("❌ FREEKASSA_API_KEY не найден в env!");
  process.exit(1);
}
if (!SHOP_ID) {
  console.error("❌ SHOP_ID не найден в env!");
  process.exit(1);
}

// Webhook от FreeKassa
app.post("/webhook", (req, res) => {
  const data = req.body;

  const clientIp = req.headers["x-real-ip"] || 
                   req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || 
                   req.socket.remoteAddress;

  if (!FREEKASSA_IPS.has(clientIp)) {
    console.warn(`Неправильный IP: ${clientIp}`);
    return res.status(403).send("Forbidden");
  }

  if (!data.MERCHANT_ID || !data.AMOUNT || !data.MERCHANT_ORDER_ID || !data.SIGN) {
    console.warn("Неполные данные в вебхуке", data);
    return res.status(400).send("Bad Request");
  }

  const signString = [
    String(data.MERCHANT_ID),
    String(data.AMOUNT),
    SECRET_WORD_2,
    String(data.MERCHANT_ORDER_ID)
  ].join(":");

  const calculatedSign = crypto
    .createHash("md5")
    .update(signString)
    .digest("hex")
    .toLowerCase();

  if (calculatedSign !== String(data.SIGN).toLowerCase()) {
    console.warn("Неверная подпись!", { received: data.SIGN, calculated: calculatedSign });
    return res.status(403).send("Invalid signature");
  }

  console.log("УСПЕШНАЯ ОПЛАТА!", {
    orderId: data.MERCHANT_ORDER_ID,
    amount: data.AMOUNT,
    intid: data.intid,
    email: data.P_EMAIL || "не указан",
    method: data.CUR_ID,
    time: new Date().toISOString()
  });

  res.send("YES");
});

// Тест webhook
app.get("/webhook", (req, res) => {
  res.send("Webhook работает ✓");
});

// Success страница
app.get("/success", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="refresh" content="5;url=https://www.donza.site/shop">
      <title>Оплата прошла!</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 80px; background: #f8f9fa; color: #333; }
        h1 { color: #28a745; margin-bottom: 20px; }
        p { font-size: 1.2em; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>Спасибо! Оплата успешно прошла 🎉</h1>
      <p>Награды будут доставлены как можно скорее.</p>
      <p>Перенаправление через 5 сек...</p>
    </body>
    </html>
  `);
});

// Failure страница
app.get("/failure", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="refresh" content="9;url=https://www.donza.site/shop">
      <title>Оплата не прошла</title>
      <style>
        body { font-family: sans-serif; text-align: center; padding: 80px; background: #f8f9fa; color: #333; }
        h1 { color: #dc3545; margin-bottom: 20px; }
        p { font-size: 1.2em; margin: 20px 0; }
      </style>
    </head>
    <body>
      <h1>Оплата не удалась 😔</h1>
      <p>Попробуйте снова или свяжитесь с поддержкой.</p>
      <p>Перенаправление через 9 сек...</p>
    </body>
    </html>
  `);
});

// Главная
app.get("/", (req, res) => {
  res.send("Сервер работает! Webhook и create-payment готовы.");
});

// Создание оплаты
app.post('/create-payment', async (req, res) => {
  console.log('Получен запрос на оплату, req.body:', req.body);

  const { 
    amount, 
    orderId, 
    method = 44,
    gameId,
    uc
  } = req.body;

  if (!amount || !orderId || !gameId) {
    console.log('Ошибка: не хватает полей', { amount, orderId, gameId });
    return res.status(400).json({ success: false, error: 'Нет суммы, ID заказа или игрового ID' });
  }

  console.log('Проверка пройдена! Игрок:', gameId, 'Сумма:', amount, 'UC:', uc);

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

  console.log('Отправляем в FreeKassa:', payload);

  const sortedKeys = Object.keys(payload).sort();
  const signString = sortedKeys.map(key => payload[key]).join('|');
  payload.signature = crypto
    .createHmac('sha256', API_KEY)
    .update(signString)
    .digest('hex');

  console.log('Подпись:', payload.signature);

  try {
    const response = await fetch('https://api.fk.life/v1/orders/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('Статус FreeKassa:', response.status);

    const text = await response.text();
    console.log('Сырой ответ FreeKassa:', text);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.error('Не удалось распарсить ответ FreeKassa:', e);
      return res.status(500).json({ success: false, error: 'Неверный ответ от FreeKassa' });
    }

    if (data.type === 'success') {
      console.log(`УСПЕХ! Заказ ${orderId} создан, ссылка: ${data.location}`);
      res.json({ success: true, link: data.location });
    } else {
      console.error('Ошибка FreeKassa:', data);
      res.status(500).json({ success: false, error: data.message || 'Ошибка создания заказа' });
    }
  } catch (err) {
    console.error('Ошибка fetch FreeKassa:', err.message);
    res.status(500).json({ success: false, error: 'Ошибка сервера: ' + err.message });
  }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});