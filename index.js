const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());

const API_KEY = process.env.FREEKASSA_API_KEY;
const SHOP_ID = process.env.SHOP_ID;

if (!API_KEY || !SHOP_ID) {
  console.error('Env не найдены');
  process.exit(1);
}

// ========== 1. СЕРВЕРНЫЙ КЭШ КУРСА ВАЛЮТ ==========
let cachedUsdRate = 90;        // Начальный курс (запасной)
let lastUpdateTime = null;
let lastUpdateDate = null;

// ========== 2. ФУНКЦИЯ ПОЛУЧЕНИЯ КУРСА ИЗ API ЦБ ==========
async function fetchUsdRate() {
  try {
    console.log('[КУРС] Запрашиваю курс с API ЦБ...');
    const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
    const data = await response.json();
    const rate = data.Valute.USD.Value;
    console.log(`[КУРС] Успешно загружен: ${rate} ₽`);
    return rate;
  } catch (error) {
    console.error('[КУРС] Ошибка загрузки:', error.message);
    return null;
  }
}

// ========== 3. ФУНКЦИЯ ОБНОВЛЕНИЯ КЭША ==========
async function updateCache() {
  console.log('[КЭШ] Начинаю обновление курса...');
  const newRate = await fetchUsdRate();
  
  if (newRate !== null && newRate > 0) {
    cachedUsdRate = newRate;
    lastUpdateTime = Date.now();
    lastUpdateDate = new Date();
    console.log(`[КЭШ] ✅ Курс обновлен: ${cachedUsdRate} ₽ (${lastUpdateDate.toLocaleString()})`);
  } else {
    console.log(`[КЭШ] ⚠️ Не удалось обновить курс. Использую старый: ${cachedUsdRate} ₽`);
  }
}

// ========== 4. ЗАПУСКАЕМ ОБНОВЛЕНИЕ КУРСА ==========
// Первое обновление при старте сервера
updateCache();

// Устанавливаем интервал обновления каждые 12 часов
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
setInterval(updateCache, TWELVE_HOURS_MS);
console.log(`[КЭШ] Автообновление каждые 12 часов запущено`);

// ========== 5. НОВЫЙ ЭНДПОИНТ ДЛЯ ПОЛУЧЕНИЯ КУРСА ==========
app.get('/api/rate', (req, res) => {
  res.json({
    success: true,
    rate: cachedUsdRate,
    lastUpdate: lastUpdateDate,
    message: 'Курс обновляется автоматически каждые 12 часов' 
  });
});

// ========== 6. ОСНОВНОЙ ЭНДПОИНТ СОЗДАНИЯ ПЛАТЕЖА (ИЗМЕНЕН) ==========
app.post('/create-payment', async (req, res) => {
  const { amount, orderId, gameId, uc, method } = req.body;

  if (!amount || !orderId || !gameId || !method) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID/метода' });
  }

  // amount теперь должен приходить в ДОЛЛАРАХ (usdPrice)
  // Конвертируем в рубли по текущему курсу из кэша
  const rubAmount = Math.round(amount * cachedUsdRate);
  
  console.log(`[КОНВЕРТАЦИЯ] ${amount}$ → ${rubAmount}₽ (курс: ${cachedUsdRate})`);
  console.log(`[ЗАПРОС] Заказ: ${orderId}, UC: ${uc}, метод: ${method}`);

  const nonce = Date.now().toString();

  const payload = {
    shopId: Number(SHOP_ID),
    nonce,
    paymentId: orderId,
    amount: rubAmount,        // ← ОТПРАВЛЯЕМ РУБЛИ (конвертированные из долларов)
    currency: 'RUB',
    i: Number(method),
    email: 'donzaus@gmail.com',
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
      console.log('Успех FreeKassa, ссылка:', data.location);
      return res.json({ success: true, link: data.location });
    } else {
      console.error('Ошибка FreeKassa:', data);
      return res.status(response.status || 500).json({ success: false, error: data.message || 'Ошибка FreeKassa' });
    }
  } catch (err) {
    console.error('Ошибка:', err);
    return res.status(500).json({ success: false, error: 'Ошибка сервера' });
  }
});

// ========== 7. ВЕБХУК ДЛЯ ПОДТВЕРЖДЕНИЯ ОПЛАТ (НЕ ИЗМЕНЯЕТСЯ) ==========
app.post('/webhook', (req, res) => {
  const { MERCHANT_ID, AMOUNT, MERCHANT_ORDER_ID, SIGN } = req.body;

  const secret2 = process.env.FREEKASSA_SECRET_2;
  const checkSign = crypto.createHash('md5').update(`${MERCHANT_ID}:${AMOUNT}:${secret2}:${MERCHANT_ORDER_ID}`).digest('hex');

  if (SIGN === checkSign) {
    console.log('Оплата прошла! Заказ:', MERCHANT_ORDER_ID, 'Сумма:', AMOUNT);
    // Здесь зачисляй UC
  }

  res.send('OK');
});

// ========== 8. ЗАПУСК СЕРВЕРА ==========
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[СЕРВЕР] Запущен на порту ${PORT}`);
  console.log(`[СЕРВЕР] Текущий курс: ${cachedUsdRate} ₽`);
});