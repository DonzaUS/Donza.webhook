import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";

const app = express();

// Только urlencoded — FreeKassa присылает form-data
app.use(bodyParser.urlencoded({ extended: true }));

// Актуальные IP FreeKassa (на декабрь 2025)
const FREEKASSA_IPS = new Set([
  "168.119.157.136",
  "168.119.60.227",
  "178.154.197.79",
  "51.250.54.238"
]);

// ← Вот сюда вставь свой настоящий секрет №2 !!!
const SECRET_WORD_2 = 369258147;

// Webhook от FreeKassa
app.post("/webhook", (req, res) => {
  const data = req.body;

  // 1. Проверка IP (очень важно!)
  const clientIp = req.headers["x-real-ip"] || 
                   req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || 
                   req.socket.remoteAddress;

  if (!FREEKASSA_IPS.has(clientIp)) {
    console.warn(`Неправильный IP: ${clientIp}`);
    return res.status(403).send("Forbidden");
  }

  // 2. Проверка наличия ключевых полей
  if (!data.MERCHANT_ID || !data.AMOUNT || !data.MERCHANT_ORDER_ID || !data.SIGN) {
    console.warn("Неполные данные в вебхуке", data);
    return res.status(400).send("Bad Request");
  }

  // 3. Проверка подписи
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

  // 4. Здесь просто логируем успешную оплату
  // (потом можно будет добавить email в Telegram, файл и т.д.)
  console.log("УСПЕШНАЯ ОПЛАТА!", {
    orderId: data.MERCHANT_ORDER_ID,
    amount: data.AMOUNT,
    intid: data.intid,
    email: data.P_EMAIL || "не указан",
    method: data.CUR_ID,
    time: new Date().toISOString()
  });

  // 5. Обязательно отвечаем YES (FreeKassa ждёт именно это!)
  res.send("YES");
});

// Для проверки, что сервер жив
app.get("/webhook", (req, res) => {
  res.send("Webhook работает ✓");
});

const PORT = process.env.PORT || 8080;

// Страница успеха — показываем "Спасибо" 5 секунд, потом редирект
app.get("/success", (req, res) => {
  console.log("Успешная оплата — показываем спасибо 5 сек, редирект на магазин");
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="refresh" content="5;url=https://www.donza.site/shop">
      <title>Оплата прошла!</title>
      <style>
        body {
          font-family: sans-serif;
          text-align: center;
          padding: 80px;
          background: #f8f9fa;
          color: #333;
        }
        h1 { color: #28a745; margin-bottom: 20px; }
        p { font-size: 1.2em; margin: 20px 0; }
        .redirect-info { 
          font-size: 1em; 
          color: #666; 
          margin-top: 40px;
        }
      </style>
    </head>
    <body>
      <h1>Спасибо! Оплата успешно прошла 🎉</h1>
      <p> Награды будут доставлены как можно скорее </p>
      <p class="redirect-info">Если перенаправление не сработало автоматически — <a href="https://www.donza.site/shop">нажмите сюда</a></p>
    </body>
    </html>
  `);
});

// Страница неудачи — показываем сообщение 5 секунд, потом редирект на магазин
app.get("/failure", (req, res) => {
  console.log("Неудачная оплата — показываем сообщение 5 сек, редирект на магазин");
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="refresh" content="5;url=https://www.donza.site/shop">
      <title>Оплата не прошла</title>
      <style>
        body {
          font-family: sans-serif;
          text-align: center;
          padding: 80px;
          background: #f8f9fa;
          color: #333;
        }
        h1 { color: #dc3545; margin-bottom: 20px; }
        p { font-size: 1.2em; margin: 20px 0; }
        .redirect-info { 
          font-size: 1em; 
          color: #666; 
          margin-top: 40px;
        }
      </style>
    </head>
    <body>
      <h1>Оплата не удалась 😔</h1>
      <p>Возможно, проблема с картой, недостаточно средств или вы отменили платёж.</p>
      <p>Сейчас вы будете перенаправлены в магазин...</p>
      <p class="redirect-info">Если перенаправление не сработало — <a href="https://www.donza.site/shop">нажмите сюда</a></p>
    </body>
    </html>
  `);
});

// Главная страница (корневой путь /)
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Платёжный сервис</title>
      <style>
        body { 
          font-family: sans-serif; 
          text-align: center; 
          padding: 50px; 
          background: #f8f9fa;
        }
        .container { max-width: 600px; margin: 0 auto; }
        h1 { color: #333; }
        .status { 
          background: #e7f3ff; 
          padding: 20px; 
          border-radius: 8px; 
          margin: 20px 0; 
          border-left: 4px solid #007bff;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🔧 Платёжный сервис</h1>
        <div class="status">
          <h2>Статус: <span style="color: green;">Готов к работе</span></h2>
          <p>Webhook: <a href="/webhook" style="color: #007bff;">✓ Активен</a></p>
          <p>Оплата: <a href="/success" style="color: #28a745;">✓ Тест успеха</a> | 
             <a href="/failure" style="color: #dc3545;">✗ Тест отказа</a></p>
        </div>
        <p><small>Сервер запущен на Render. Платежи обрабатываются автоматически.</small></p>
      </div>
    </body>
    </html>
  `);
});
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});