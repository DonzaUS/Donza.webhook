import express from "express";
import bodyParser from "body-parser";
import crypto from "crypto";

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Webhook от FreeKassa
app.post("/webhook", (req, res) => {
  const data = req.body;

  // Проверка подписи
  const secret = "ТВОЙ_СЕКРЕТ_ИЗ_FreeKassa";
  const signature = crypto
    .createHash("md5")
    .update(`${data.MERCHANT_ID}:${data.AMOUNT}:${secret}:${data.MERCHANT_ORDER_ID}`)
    .digest("hex");

  if (signature === data.SIGN) {
    console.log("✅ Оплата подтверждена:", data);
    res.send("YES");
  } else {
    console.log("❌ Подпись неверна");
    res.status(403).send("Invalid signature");
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Webhook server started on port ${PORT}`));
