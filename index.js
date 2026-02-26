import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from "cors";
import fetch from "node-fetch"; // npm install node-fetch

const app = express();

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

const ENOT_MERCHANT_ID = process.env.ENOT_MERCHANT_ID;
const ENOT_SECRET = process.env.ENOT_SECRET;
const ENOT_WEBHOOK_SECRET = process.env.ENOT_WEBHOOK_SECRET;

if (!ENOT_MERCHANT_ID || !ENOT_SECRET || !ENOT_WEBHOOK_SECRET) {
  console.error("Env не найдены: ENOT_MERCHANT_ID, ENOT_SECRET или ENOT_WEBHOOK_SECRET");
  process.exit(1);
}

app.post("/create-payment", async (req, res) => {
  const { amount, orderId, gameId, uc, method } = req.body;

  if (!amount || !orderId || !gameId || !method) {
    return res.status(400).json({ success: false, error: "Нет суммы/ID/метода" });
  }

  const payload = {
    merchant_id: ENOT_MERCHANT_ID,
    amount: amount.toFixed(2),
    order_id: orderId,
    currency: "RUB",
    description: `${uc} UC в Donza - ID: ${gameId}`,
    payment_method: method, // 44 - СБП, 36 - карты, 35 - QIWI (проверь коды в доках Enot)
    success_url: "https://www.donza.site/success",
    fail_url: "https://www.donza.site/fail",
    webhook_url: "https://api.donza.site/webhook",
  };

  // Подпись для создания платежа (MD5 от всех полей + secret)
  const signString = Object.keys(payload)
    .sort()
    .map((key) => payload[key])
    .join("") + ENOT_SECRET;
  payload.sign = crypto.createHash("md5").update(signString).digest("hex");

  try {
    const response = await fetch("https://api.enot.io/v1/payment/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.status === "success" && data.data && data.data.url) {
      console.log("Успех Enot, ссылка на оплату:", data.data.url);
      return res.json({ success: true, link: data.data.url });
    } else {
      console.error("Ошибка Enot:", data);
      return res.status(500).json({ success: false, error: data.message || "Ошибка Enot" });
    }
  } catch (err) {
    console.error("Ошибка fetch:", err);
    return res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});

// Webhook для обработки уведомлений об оплате
app.post("/webhook", (req, res) => {
  const { amount, order_id, sign, status } = req.body;

  // Проверка подписи webhook (используем второй ключ)
  const signString = `${amount}${order_id}${ENOT_WEBHOOK_SECRET}`;
  const checkSign = crypto.createHash("md5").update(signString).digest("hex");

  if (sign === checkSign && status === "success") {
    console.log("Оплата прошла! Заказ:", order_id, "Сумма:", amount);
    // Здесь зачисляй UC по order_id (парсинг order-325-...)
  }

  res.send("OK"); // Enot ожидает "OK"
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер запущен на ${PORT}`));