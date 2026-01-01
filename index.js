import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

app.use(cors({ origin: "*" }));
app.use(bodyParser.json());

const API_KEY = process.env.FREEKASSA_API_KEY;
const SHOP_ID = process.env.SHOP_ID;

if (!API_KEY || !SHOP_ID) {
  console.error("Env не найдены");
  process.exit(1);
}

app.post("/create-payment", async (req, res) => {
  const { amount, orderId, method } = req.body;

  if (!amount || !orderId || !method) {
    return res.status(400).json({ success: false, error: "Нет данных" });
  }

  const nonce = Date.now().toString();
  const paymentId = `${orderId}_${Date.now()}`;

  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0] ||
    req.socket.remoteAddress ||
    "8.8.8.8";

  const payload = {
    shopId: Number(SHOP_ID),
    nonce,
    paymentId,
    amount: Number(amount),
    currency: "RUB",
    i: Number(method), // 44 — СБП
    email: "donzaus@gmail.com",
    ip,
  };

  const sortedKeys = Object.keys(payload).sort();
  const signString = sortedKeys
    .map((key) => String(payload[key]))
    .join("|");

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
      return res.json({ success: true, link: data.location });
    }

    return res.status(400).json({ success: false, error: data });
  } catch (e) {
    return res.status(500).json({ success: false, error: "Server error" });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
