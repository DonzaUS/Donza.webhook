import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from "cors";
import fetch from "node-fetch"; // npm install node-fetch

const app = express();

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

const API_KEY = process.env.FREEKASSA_API_KEY;
const SHOP_ID = process.env.SHOP_ID;

if (!API_KEY || !SHOP_ID) {
  console.error("Env не найдены: FREEKASSA_API_KEY или SHOP_ID");
  process.exit(1);
}

app.post("/create-payment", async (req, res) => {
  const { amount, orderId, gameId, uc, method } = req.body;

  if (!amount || !orderId || !gameId || !method) {
    return res.status(400).json({ success: false, error: "Нет суммы/ID/метода" });
  }

  const nonce = Date.now().toString();

  const payload = {
    shopId: Number(SHOP_ID),
    nonce,
    paymentId: orderId,
    amount: Number(amount),
    currency: "RUB",
    i: Number(method), // 44 — СБП, 36 — карты, 35 — QIWI
    email: "donzaus@gmail.com", // Или email клиента
    ip: req.ip || "127.0.0.1",
  };

  // Подпись API: сортировка ключей + join('|') + HMAC-SHA256
  const sortedKeys = Object.keys(payload).sort();
  const signString = sortedKeys.map((key) => payload[key]).join("|");
  payload.signature = crypto
    .createHmac("sha256", API_KEY)
    .update(signString)
    .digest("hex");

  try {
    const response = await fetch("https://api.fk.life/v1/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (data.type === "success" && data.location) {
      console.log("Успех API, ссылка на оплату:", data.location);
      return res.json({ success: true, link: data.location });
    } else {
      console.error("Ошибка API:", data);
      return res.status(response.status || 500).json({
        success: false,
        error: data.message || "Ошибка FreeKassa",
      });
    }
  } catch (err) {
    console.error("Ошибка fetch:", err);
    return res.status(500).json({ success: false, error: "Ошибка сервера" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Сервер запущен на ${PORT}`));