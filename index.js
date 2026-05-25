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
updateCache();
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
setInterval(updateCache, TWELVE_HOURS_MS);
console.log(`[КЭШ] Автообновление каждые 12 часов запущено`);

// ========== 5. ЭНДПОИНТ ДЛЯ ПОЛУЧЕНИЯ КУРСА ==========
app.get('/api/rate', (req, res) => {
  res.json({
    success: true,
    rate: cachedUsdRate,
    lastUpdate: lastUpdateDate,
    message: 'Курс обновляется автоматически каждые 12 часов'
  });
});

// ========== 6. СОЗДАНИЕ ПЛАТЕЖА ==========
app.post('/create-payment', async (req, res) => {
  const { amount, orderId, gameId, uc, method } = req.body;

  if (!amount || !orderId || !gameId || !method) {
    return res.status(400).json({ success: false, error: 'Нет суммы/ID/метода' });
  }

  const rubAmount = Math.round(amount * cachedUsdRate);
  
  console.log(`[КОНВЕРТАЦИЯ] ${amount}$ → ${rubAmount}₽ (курс: ${cachedUsdRate})`);
  console.log(`[ЗАПРОС] Заказ: ${orderId}, UC: ${uc}, метод: ${method}`);

  const nonce = Date.now().toString();
  const payload = {
    shopId: Number(SHOP_ID),
    nonce,
    paymentId: orderId,
    amount: rubAmount,
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

// ========== 7. ВЕБХУК ДЛЯ ПОДТВЕРЖДЕНИЯ ОПЛАТ С УВЕДОМЛЕНИЯМИ В TELEGRAM ==========
app.post('/webhook', async (req, res) => {
  const { MERCHANT_ID, AMOUNT, MERCHANT_ORDER_ID, SIGN } = req.body;

  const secret2 = process.env.FREEKASSA_SECRET_2;
  const checkSign = crypto.createHash('md5').update(`${MERCHANT_ID}:${AMOUNT}:${secret2}:${MERCHANT_ORDER_ID}`).digest('hex');

  if (SIGN === checkSign) {
    // ========== РАЗБИРАЕМ НОМЕР ЗАКАЗА ==========
    // Формат заказа: "order-UC-ИГРОК"
    // Например: "order-325-MyPlayer123"
    const orderParts = MERCHANT_ORDER_ID.split('-');
    const ucAmount = orderParts[1];                    // количество UC (например, "325")
    const gameIdFromOrder = orderParts.slice(2).join('-'); // игровой ID (например, "MyPlayer123")
    
    console.log('✅ ОПЛАТА ПОДТВЕРЖДЕНА!');
    console.log(`🎮 Игрок: ${gameIdFromOrder}`);
    console.log(`💎 UC: ${ucAmount}`);
    console.log(`💰 Сумма: ${AMOUNT} ₽`);
    console.log(`🆔 Заказ: ${MERCHANT_ORDER_ID}`);
    
    // ========== ЗАЧИСЛЕНИЕ UC (допиши свою логику) ==========
    // Здесь ты будешь зачислять UC игроку gameIdFromOrder
    // Например: await addUCToPlayer(gameIdFromOrder, parseInt(ucAmount));
    // =====================================================

    // ========== ОТПРАВКА УВЕДОМЛЕНИЯ В TELEGRAM ==========
    const botToken = process.env.TG_BOT_TOKEN;
    const chatId = process.env.TG_CHAT_ID;
    
    if (botToken && chatId) {
      const message = `✅ НОВАЯ ОПЛАТА!\n\n🎮 Игрок: ${gameIdFromOrder}\n💎 UC: ${ucAmount}\n💰 Сумма: ${AMOUNT} ₽\n🆔 Заказ: ${MERCHANT_ORDER_ID}\n📅 Время: ${new Date().toLocaleString()}`;
      
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'HTML'
          })
        });
        console.log('📨 Уведомление в Telegram отправлено');
      } catch (tgError) {
        console.error('❌ Ошибка отправки в Telegram:', tgError.message);
      }
    } else {
      console.warn('⚠️ TG_BOT_TOKEN или TG_CHAT_ID не настроены');
    }
    // =====================================================

  } else {
    console.warn('❌ Неверная подпись webhook');
  }

  res.send('OK');
});

// ========== 8. СТРАНИЦЫ УСПЕХА И ОШИБКИ ==========
app.get('/success', (req, res) => {
  const { order_id, amount, merchant_order_id } = req.query;
  
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Оплата успешна - Donza</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            min-height: 100vh;
            background: url('https://donza.ru/photo_1.jpg') center/cover no-repeat fixed;
            font-family: system-ui, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .success-card {
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(10px);
            border-radius: 24px;
            padding: 40px 30px;
            max-width: 500px;
            width: 100%;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .check-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #4CAF50, #45a049);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
        }
        .check-icon span { font-size: 45px; color: white; font-weight: bold; }
        h1 { color: white; font-size: 28px; margin-bottom: 12px; }
        .message { color: rgba(255,255,255,0.85); margin-bottom: 25px; }
        .order-details {
            background: rgba(255,255,255,0.1);
            border-radius: 12px;
            padding: 15px;
            margin-bottom: 25px;
            color: #ddd;
        }
        .order-details span { color: #efd55e; }
        .button {
            display: inline-block;
            background: #efd55e90;
            color: white;
            text-decoration: none;
            padding: 12px 30px;
            border-radius: 40px;
            font-weight: 600;
        }
        .button:hover { background: #efd55e; transform: translateY(-2px); }
    </style>
</head>
<body>
    <div class="success-card">
        <div class="check-icon"><span>✓</span></div>
        <h1>Оплата прошла успешно!</h1>
        <div class="message">Спасибо за покупку! Ваш заказ обрабатывается.<br>UC будут зачислены в ближайшее время.</div>
        <div class="order-details">Номер заказа: ${order_id || merchant_order_id || 'Загрузка...'}</div>
        <a href="https://donza.ru/shop" class="button">Вернуться в магазин</a>
    </div>
</body>
</html>`;
  
  res.send(html);
});

app.get('/failure', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ошибка оплаты - Donza</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            min-height: 100vh;
            background: url('https://donza.ru/photo_1.jpg') center/cover no-repeat fixed;
            font-family: system-ui, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .fail-card {
            background: rgba(0, 0, 0, 0.75);
            backdrop-filter: blur(10px);
            border-radius: 24px;
            padding: 40px 30px;
            max-width: 500px;
            width: 100%;
            text-align: center;
            border: 1px solid rgba(255,255,255,0.2);
        }
        .fail-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #f44336, #d32f2f);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
        }
        .fail-icon span { font-size: 45px; color: white; font-weight: bold; }
        h1 { color: white; font-size: 28px; margin-bottom: 12px; }
        .message { color: rgba(255,255,255,0.85); margin-bottom: 25px; }
        .button {
            display: inline-block;
            background: #f4433690;
            color: white;
            text-decoration: none;
            padding: 12px 30px;
            border-radius: 40px;
            font-weight: 600;
        }
        .button:hover { background: #f44336; transform: translateY(-2px); }
    </style>
</head>
<body>
    <div class="fail-card">
        <div class="fail-icon"><span>✕</span></div>
        <h1>Ошибка оплаты</h1>
        <div class="message">К сожалению, произошла ошибка при обработке платежа.<br>Пожалуйста, попробуйте ещё раз.</div>
        <a href="https://donza.ru/shop" class="button">Вернуться в магазин</a>
    </div>
</body>
</html>`;
  
  res.send(html);
});

// ========== 9. ЗАПУСК СЕРВЕРА ==========
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[СЕРВЕР] Запущен на порту ${PORT}`);
  console.log(`[СЕРВЕР] Текущий курс: ${cachedUsdRate} ₽`);
});