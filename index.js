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

// Страница успеха (показывается пользователю)
app.get("/success", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head><meta charset="UTF-8"><title>Оплата прошла!</title></head>
    <body style="font-family:sans-serif; text-align:center; padding:50px;">
      <h1 style="color:green;">Спасибо! Оплата успешно прошла 🎉</h1>
      <p>Средства зачислены. Заказ в обработке, все будет начислено как можно скорее.</p>
      <p><a href="/">Вернуться на главную</a></p>
    </body>
    </html>
  `);
});

// Страница неудачи
app.get("/failure", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head><meta charset="UTF-8"><title>Оплата не прошла</title></head>
    <body style="font-family:sans-serif; text-align:center; padding:50px;">
      <h1 style="color:red;">Оплата не удалась 😔</h1>
      <p>Возможно, ошибка карты или отмена. Попробуйте снова.</p>
      <p><a href="/">Вернуться на главную</a></p>
    </body>
    </html>
  `);
});
app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});